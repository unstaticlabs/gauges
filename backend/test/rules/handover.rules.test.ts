/**
 * Rules tests for the hand-over of an account merge: `handovers/{code}` and
 * the claim writes on gauges and labels (`claimVia`).
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { hostAndPort, rulesText } from './emulator';

type Db = firebase.firestore.Firestore;
const { Timestamp, FieldValue } = firebase.firestore;

const DAY = 86400000;
const CODE = 'h'.repeat(43);
const EXPIRED = 'x'.repeat(43);
const NEW_CODE = 'n'.repeat(43);

let env: RulesTestEnvironment;

const db = (uid: string): Db => env.authenticatedContext(uid).firestore();
const ts = (offset = 0) => Timestamp.fromMillis(Date.now() + offset);

function gaugeData(createdBy: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'Plants',
    repeatDays: 3,
    curve: 'linear',
    labelIds: [],
    members: [createdBy],
    createdBy,
    executions: [],
    archivedAt: null,
    mutedBy: [],
    createdAt: ts(),
    ...extra,
  };
}

function labelData(createdBy: string, extra: Record<string, unknown> = {}) {
  return { name: 'Home', members: [createdBy], gaugeIds: [], createdBy, createdAt: ts(), ...extra };
}

/**
 * The start state:
 * - anna is the old (anonymous) account. She owns gauge `gA` and label `LA`,
 *   and mutes `gA`. She shares label `LS` and gauge `gB` with bob, who
 *   created both.
 * - bob owns `gP` alone.
 * - anna made the hand-over `CODE` (not taken yet) and an expired one.
 * - tom is the new account. mallory is a stranger.
 */
async function seed(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc('gauges/gA').set(gaugeData('anna', { labelIds: ['LA'], mutedBy: ['anna'] }));
    await d.doc('labels/LA').set(labelData('anna', { gaugeIds: ['gA'] }));
    await d.doc('gauges/gB').set(gaugeData('bob', { labelIds: ['LS'], members: ['bob', 'anna'] }));
    await d.doc('labels/LS').set(labelData('bob', { members: ['bob', 'anna'], gaugeIds: ['gB'] }));
    await d.doc('gauges/gP').set(gaugeData('bob'));
    await d.doc(`handovers/${CODE}`).set({ from: 'anna', createdAt: ts(), expiresAt: ts(DAY) });
    await d.doc(`handovers/${EXPIRED}`).set({ from: 'anna', createdAt: ts(-2 * DAY), expiresAt: ts(-DAY) });
  });
}

const take = (uid: string, code = CODE) => db(uid).doc(`handovers/${code}`).update({ to: uid });

beforeAll(async () => {
  firebase.firestore.setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-gauges',
    firestore: { rules: rulesText(), ...hostAndPort() },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('create a hand-over', () => {
  const valid = () => ({ from: 'anna', createdAt: ts(), expiresAt: ts(7 * DAY) });

  it('lets a user create a hand-over from themselves', async () => {
    await assertSucceeds(db('anna').doc(`handovers/${NEW_CODE}`).set(valid()));
  });

  it('denies a hand-over from another user', async () => {
    await assertFails(db('mallory').doc(`handovers/${NEW_CODE}`).set(valid()));
  });

  it('denies an expiry in the past, or more than 8 days away', async () => {
    await assertFails(db('anna').doc(`handovers/${NEW_CODE}`).set({ ...valid(), expiresAt: ts(-1000) }));
    await assertFails(db('anna').doc(`handovers/${NEW_CODE}`).set({ ...valid(), expiresAt: ts(9 * DAY) }));
  });

  it('denies a short code, an extra field, a preset `to`, and no sign-in', async () => {
    await assertFails(db('anna').doc('handovers/short').set(valid()));
    await assertFails(db('anna').doc(`handovers/${NEW_CODE}`).set({ ...valid(), to: 'tom' }));
    await assertFails(db('anna').doc(`handovers/${NEW_CODE}`).set({ ...valid(), extra: 1 }));
    await assertFails(env.unauthenticatedContext().firestore().doc(`handovers/${NEW_CODE}`).set(valid()));
  });

  it('denies a read or a list to everybody', async () => {
    await assertFails(db('anna').doc(`handovers/${CODE}`).get());
    await assertFails(db('tom').doc(`handovers/${CODE}`).get());
    await assertFails(db('anna').collection('handovers').get());
  });
});

describe('take a hand-over', () => {
  it('lets the new account take it, and take it again', async () => {
    await assertSucceeds(take('tom'));
    await assertSucceeds(take('tom'));
  });

  it('denies a second account after the first one took it', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(take('mallory'));
  });

  it('denies the old account, an expired hand-over, and another value', async () => {
    await assertFails(take('anna'));
    await assertFails(take('tom', EXPIRED));
    await assertFails(db('tom').doc(`handovers/${CODE}`).update({ to: 'mallory' }));
    await assertFails(db('tom').doc(`handovers/${CODE}`).update({ to: 'tom', from: 'tom' }));
  });

  it('lets the old account delete it before, and the new account after', async () => {
    await assertFails(db('mallory').doc(`handovers/${CODE}`).delete());
    await assertFails(db('tom').doc(`handovers/${CODE}`).delete());
    await assertSucceeds(take('tom'));
    await assertFails(db('mallory').doc(`handovers/${CODE}`).delete());
    await assertSucceeds(db('tom').doc(`handovers/${CODE}`).delete());
  });
});

describe('claim a gauge', () => {
  const claimAdd = (uid: string, path: string, extra: Record<string, unknown> = {}) =>
    db(uid).doc(path).update({ members: FieldValue.arrayUnion(uid), claimVia: CODE, ...extra });

  it('denies a claim before the new account takes the hand-over', async () => {
    await assertFails(claimAdd('tom', 'gauges/gA', { createdBy: 'tom' }));
  });

  it('lets the new account take the place of the creator, then remove the old account', async () => {
    await assertSucceeds(take('tom'));
    await assertSucceeds(claimAdd('tom', 'gauges/gA', { createdBy: 'tom', mutedBy: FieldValue.arrayUnion('tom') }));
    // Now tom is a member: a normal member update removes anna.
    await assertSucceeds(
      db('tom').doc('gauges/gA').update({
        members: FieldValue.arrayRemove('anna'),
        mutedBy: FieldValue.arrayRemove('anna'),
      }),
    );
    const g = (await assertSucceeds(db('tom').doc('gauges/gA').get())).data();
    expect(g).toMatchObject({ members: ['tom'], createdBy: 'tom', mutedBy: ['tom'] });
  });

  it('keeps another creator: the new account cannot take the place of bob', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('tom', 'gauges/gB', { createdBy: 'tom' }));
    await assertSucceeds(claimAdd('tom', 'gauges/gB'));
    await assertSucceeds(db('tom').doc('gauges/gB').update({ members: FieldValue.arrayRemove('anna') }));
    await assertFails(db('tom').doc('gauges/gB').update({ members: FieldValue.arrayRemove('bob') }));
  });

  it('denies a gauge of which the old account is not a member', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('tom', 'gauges/gP'));
  });

  it('denies a claim that adds another user, changes other fields, or unmutes', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(
      db('tom').doc('gauges/gA').update({ members: FieldValue.arrayUnion('tom', 'mallory'), claimVia: CODE }),
    );
    await assertFails(claimAdd('tom', 'gauges/gA', { name: 'Mine' }));
    await assertFails(claimAdd('tom', 'gauges/gA', { executions: [{ at: ts(), by: 'tom' }] }));
    await assertFails(claimAdd('tom', 'gauges/gA', { mutedBy: FieldValue.arrayRemove('anna') }));
  });

  it('denies a stranger who knows the code after the new account took it', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('mallory', 'gauges/gA'));
    await assertFails(claimAdd('mallory', 'gauges/gB'));
  });

  it('denies an unknown or an expired code', async () => {
    await assertFails(db('tom').doc('gauges/gA').update({ members: FieldValue.arrayUnion('tom'), claimVia: NEW_CODE }));
    await assertFails(take('tom', EXPIRED));
    await assertFails(db('tom').doc('gauges/gA').update({ members: FieldValue.arrayUnion('tom'), claimVia: EXPIRED }));
  });

  it('denies `claimVia` on a new gauge', async () => {
    await assertFails(db('tom').doc('gauges/new1').set({ ...gaugeData('tom'), claimVia: CODE }));
  });
});

describe('claim a label', () => {
  const claimAdd = (uid: string, path: string, extra: Record<string, unknown> = {}) =>
    db(uid).doc(path).update({ members: FieldValue.arrayUnion(uid), claimVia: CODE, ...extra });
  const claimRemove = (uid: string, path: string, who = 'anna') =>
    db(uid).doc(path).update({ members: FieldValue.arrayRemove(who), claimVia: CODE });

  it('lets the new account replace the old account in a shared label', async () => {
    await assertSucceeds(take('tom'));
    await assertSucceeds(claimAdd('tom', 'labels/LS'));
    await assertSucceeds(claimRemove('tom', 'labels/LS'));
    const l = (await assertSucceeds(db('bob').doc('labels/LS').get())).data();
    expect(l).toMatchObject({ members: ['bob', 'tom'], createdBy: 'bob' });
  });

  it('lets the new account become the creator of a label of the old account', async () => {
    await assertSucceeds(take('tom'));
    await assertSucceeds(claimAdd('tom', 'labels/LA', { createdBy: 'tom' }));
    await assertSucceeds(claimRemove('tom', 'labels/LA'));
    const l = (await assertSucceeds(db('tom').doc('labels/LA').get())).data();
    expect(l).toMatchObject({ members: ['tom'], createdBy: 'tom' });
  });

  it('denies a new creator in a label of bob, and the removal of bob', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('tom', 'labels/LS', { createdBy: 'tom' }));
    await assertSucceeds(claimAdd('tom', 'labels/LS'));
    await assertFails(claimRemove('tom', 'labels/LS', 'bob'));
  });

  it('denies a claim before the take, a stranger, and a rename', async () => {
    await assertFails(claimAdd('tom', 'labels/LS'));
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('mallory', 'labels/LS'));
    await assertFails(claimAdd('tom', 'labels/LS', { name: 'Mine' }));
  });

  it('denies a removal of the old account by a user who is not a member', async () => {
    await assertSucceeds(take('tom'));
    await assertFails(claimRemove('tom', 'labels/LS'));
  });

  it('lets a claim pass on a label with a level mode, and denies a mode change in it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('labels/LS').update({ aggregate: 'median' });
    });
    await assertSucceeds(take('tom'));
    await assertFails(claimAdd('tom', 'labels/LS', { aggregate: 'worst' }));
    await assertSucceeds(claimAdd('tom', 'labels/LS'));
    await assertSucceeds(claimRemove('tom', 'labels/LS'));
    const l = (await assertSucceeds(db('bob').doc('labels/LS').get())).data();
    expect(l).toMatchObject({ members: ['bob', 'tom'], aggregate: 'median' });
  });
});
