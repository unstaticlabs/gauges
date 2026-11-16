/**
 * Runs the shared account code (login, link, merge, delete) with the web
 * driver against the local Firestore and Auth emulators. Each device has its
 * own Firebase app and its own device store. The Auth emulator accepts an
 * unsigned JSON ID token in place of a real Google or Apple login.
 */
import { MERGE_KEY, type PendingMerge } from '../../../mobile/src/data/account';
import { createWebRepository, disposeWebApps, memoryDeviceStore } from '../../../mobile/src/data/client.web';
import type { EmulatorConfig } from '../../../mobile/src/data/config';
import type { DeviceStore } from '../../../mobile/src/data/port';
import {
  DataError,
  type LoginProvider,
  type MergeChoice,
  type Repository,
} from '../../../mobile/src/data/repository';
import type { Gauge, Label } from '../../../mobile/src/domain/types';

import { loadRules } from '../rules/emulator';

const PROJECT = 'demo-gauges';

function emulator(): EmulatorConfig {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  const authPort = (process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099').split(':')[1];
  return { host, firestorePort: Number(port), authPort: Number(authPort) };
}

const documentsUrl = () => {
  const e = emulator();
  return `http://${e.host}:${e.firestorePort}/v1/projects/${PROJECT}/databases/(default)/documents`;
};

async function clearEmulators(): Promise<void> {
  const e = emulator();
  await fetch(`http://${e.host}:${e.firestorePort}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${e.host}:${e.authPort}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Reads a document with no rules, as the emulator owner. Gives `null` when it does not exist. */
async function adminGet(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${documentsUrl()}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`adminGet ${path}: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** A Google account of the Auth emulator. */
const googleToken = (sub: string) => JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true });
const appleToken = (sub: string) => JSON.stringify({ sub: `apple-${sub}`, email: `${sub}@privaterelay.example.com` });

interface Device {
  repo: Repository;
  store: DeviceStore & { values: Map<string, string> };
  appName: string;
  /** The person who uses the device: the subject of their Google and Apple tokens. */
  person: string;
}

let counter = 0;

/** A device whose Google and Apple logins belong to `person`. */
function newDevice(person: string, store = memoryDeviceStore(), appName = `device-${++counter}`): Device {
  const repo = createWebRepository({
    appName,
    emulator: emulator(),
    store,
    idTokenFor: (provider: LoginProvider) => (provider === 'google' ? googleToken(person) : appleToken(person)),
  });
  return { repo, store, appName, person };
}

/** The same device after a restart of the app: a new repository on the same app and store. */
function restart(device: Device): Device {
  return newDevice(device.person, device.store, device.appName);
}

/** Waits until the live list matches `predicate`. */
function waitFor<T>(
  subscribe: (onData: (items: T[]) => void, onError: (e: DataError) => void) => () => void,
  predicate: (items: T[]) => boolean,
  what = 'the live list',
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    let stop: (() => void) | null = null;
    let last: T[] = [];
    const timer = setTimeout(() => {
      done = true;
      stop?.();
      reject(new Error(`Timeout: ${what} did not reach the expected state. Last: ${JSON.stringify(last)}`));
    }, 10000);
    stop = subscribe(
      (items) => {
        last = items;
        if (done || !predicate(items)) return;
        done = true;
        clearTimeout(timer);
        setTimeout(() => stop?.(), 0);
        resolve(items);
      },
      (error) => {
        done = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const gaugesOf = (d: Device) => d.repo.subscribeMyGauges.bind(d.repo);
const labelsOf = (d: Device) => d.repo.subscribeMyLabels.bind(d.repo);

async function gauges(d: Device, count: number): Promise<Gauge[]> {
  return waitFor(gaugesOf(d), (gs) => gs.length === count, `${count} gauges`);
}

async function labels(d: Device, count: number): Promise<Label[]> {
  return waitFor(labelsOf(d), (ls) => ls.length === count, `${count} labels`);
}

const byName = <T extends { name: string }>(items: T[], name: string): T => {
  const item = items.find((i) => i.name === name);
  if (!item) throw new Error(`No item named ${name}`);
  return item;
};

const never = async (): Promise<MergeChoice> => {
  throw new Error('decide must not be called');
};

beforeAll(() => {
  const warn = console.warn;
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('@firebase/firestore')) return;
    warn(...args);
  });
});

// The data layer must work with the final rules.
beforeAll(async () => {
  await loadRules();
});

beforeEach(async () => {
  await clearEmulators();
});

afterAll(async () => {
  await disposeWebApps();
});

describe('link', () => {
  it('links Google to an anonymous account: the user ID and the data stay', async () => {
    const phone = newDevice('ann');
    const anon = await phone.repo.signInAnonymously();
    await phone.repo.createGauge({ name: 'Plants', repeatDays: 3, curve: 'linear' }).saved;

    const result = await phone.repo.logIn('google', never);

    expect(result).toEqual({ kind: 'linked' });
    const user = phone.repo.currentUser()!;
    expect(user.uid).toBe(anon.uid);
    expect(user.isAnonymous).toBe(false);
    expect(user.logins).toEqual([{ provider: 'google', email: 'ann@example.com' }]);
    expect((await gauges(phone, 1))[0].name).toBe('Plants');
  });

  it('adds a second login, and unlinks only while another login remains', async () => {
    const phone = newDevice('ann');
    await phone.repo.signInAnonymously();
    await phone.repo.logIn('google', never);
    await phone.repo.logIn('apple', never);
    expect(phone.repo.currentUser()!.logins.map((l) => l.provider).sort()).toEqual(['apple', 'google']);

    await phone.repo.unlinkLogin('google');
    expect(phone.repo.currentUser()!.logins.map((l) => l.provider)).toEqual(['apple']);
    await expect(phone.repo.unlinkLogin('apple')).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('tells the auth listeners about a new login', async () => {
    const phone = newDevice('ann');
    await phone.repo.signInAnonymously();
    const seen: number[] = [];
    const stop = phone.repo.onAuthStateChanged((u) => u && seen.push(u.logins.length));
    await phone.repo.logIn('google', never);
    stop();
    expect(seen.at(-1)).toBe(1);
  });

  it('denies a login of another account when the account already has a login', async () => {
    const other = newDevice('bob');
    await other.repo.logIn('google', never);
    // ann has a login, and tries the Google account of bob.
    const phone = newDevice('ann');
    await phone.repo.signInAnonymously();
    await phone.repo.logIn('apple', never);
    const bobGoogle = newDevice('bob', phone.store, phone.appName);
    await expect(bobGoogle.repo.logIn('google', never)).rejects.toMatchObject({ code: 'credential-in-use' });
  });
});

describe('log in to an existing account', () => {
  it('signs in with no user', async () => {
    const web = newDevice('ann');
    expect(await web.repo.logIn('google', never)).toEqual({ kind: 'switched' });
    expect(web.repo.currentUser()).toMatchObject({ isAnonymous: false });
  });

  it('switches with no question when the anonymous account has no data', async () => {
    const first = newDevice('ann');
    const account = (await first.repo.logIn('google', never), first.repo.currentUser()!);

    const phone = newDevice('ann');
    const anon = await phone.repo.signInAnonymously();
    await phone.repo.setMyName('Temp');
    expect(await phone.repo.logIn('google', never)).toEqual({ kind: 'switched' });
    expect(phone.repo.currentUser()!.uid).toBe(account.uid);
    // The profile of the empty anonymous account is gone.
    expect(await adminGet(`users/${anon.uid}`)).toBeNull();
  });

  it('keeps everything when the user cancels the question', async () => {
    await newDevice('ann').repo.logIn('google', never);
    const phone = newDevice('ann');
    const anon = await phone.repo.signInAnonymously();
    await phone.repo.createGauge({ name: 'Plants', repeatDays: 3, curve: 'linear' }).saved;
    const asked: unknown[] = [];

    const result = await phone.repo.logIn('google', async (data) => (asked.push(data), 'cancel'));

    expect(result).toEqual({ kind: 'cancelled' });
    expect(asked).toEqual([{ gauges: 1, labels: 0 }]);
    expect(phone.repo.currentUser()!.uid).toBe(anon.uid);
    expect(await gauges(phone, 1)).toHaveLength(1);
  });
});

/**
 * The scene of the merge tests:
 * - ann has an account with a Google login and the gauge "Bins" on her
 *   first phone. Her account has no name.
 * - bob shares the label "Flat" with the gauge "Dishes".
 * - ann's second phone has an anonymous account "Anna" with the gauge
 *   "Plants" (private label "Garden", an execution, muted), the archived
 *   gauge "Old", and the shared label "Flat" of bob, where she marked
 *   "Dishes" as done.
 */
async function mergeScene() {
  const annFirst = newDevice('ann');
  await annFirst.repo.logIn('google', never);
  const account = annFirst.repo.currentUser()!;
  await annFirst.repo.createGauge({ name: 'Bins', repeatDays: 7, curve: 'linear' }).saved;

  const bob = newDevice('bob');
  const bobUser = await bob.repo.signInAnonymously();
  await bob.repo.setMyName('Bob');
  const flat = await bob.repo.createLabel('Flat').saved.then(() => bob.repo);
  const flatId = (await labels(bob, 1))[0].id;
  await flat.createGauge({ name: 'Dishes', repeatDays: 1, curve: 'linear', labelIds: [flatId] }).saved;
  const invite = await bob.repo.createInvite(flatId);

  const phone = newDevice('ann');
  const anon = await phone.repo.signInAnonymously();
  await phone.repo.setMyName('Anna');
  const garden = phone.repo.createLabel('Garden');
  await garden.saved;
  const plants = phone.repo.createGauge({
    name: 'Plants',
    repeatDays: 3,
    curve: 'late',
    labelIds: [garden.id],
    doneAt: Date.now() - 86400000,
  });
  await plants.saved;
  await phone.repo.setMuted(plants.id, true);
  const old = phone.repo.createGauge({ name: 'Old', repeatDays: 5, curve: 'linear' });
  await old.saved;
  await phone.repo.archiveGauge(old.id);
  await phone.repo.joinByInvite(invite);
  const dishes = byName(await gauges(phone, 3), 'Dishes');
  await phone.repo.markDone(dishes.id);

  return { annFirst, account, bob, bobUser, flatId, phone, anon, plantsId: plants.id, gardenId: garden.id };
}

/** Checks that the account has all the data of the scene, and the old account is gone. */
async function expectMerged(scene: Awaited<ReturnType<typeof mergeScene>>, device: Device) {
  const { account, anon, bobUser } = scene;
  const all = await gauges(device, 4);
  expect(all.map((g) => g.name).sort()).toEqual(['Bins', 'Dishes', 'Old', 'Plants']);

  const plants = byName(all, 'Plants');
  expect(plants).toMatchObject({ createdBy: account.uid, members: [account.uid], mutedBy: [account.uid], curve: 'late' });
  expect(plants.labelIds).toEqual([scene.gardenId]);
  expect(plants.executions).toHaveLength(1);
  expect(plants.executions[0].by).toBe(account.uid);

  const old = byName(all, 'Old');
  expect(old.archivedAt).not.toBeNull();
  expect(old.createdBy).toBe(account.uid);

  const dishes = byName(all, 'Dishes');
  expect(dishes.createdBy).toBe(bobUser.uid);
  expect(dishes.members.sort()).toEqual([account.uid, bobUser.uid].sort());
  expect(dishes.executions.map((e) => e.by)).toEqual([account.uid]);

  const ls = await labels(device, 2);
  expect(byName(ls, 'Garden')).toMatchObject({ createdBy: account.uid, members: [account.uid] });
  const flat = byName(ls, 'Flat');
  expect(flat.createdBy).toBe(bobUser.uid);
  expect(flat.members.sort()).toEqual([account.uid, bobUser.uid].sort());

  // Nothing keeps the old account.
  for (const g of all) expect(g.members).not.toContain(anon.uid);
  for (const l of ls) expect(l.members).not.toContain(anon.uid);
  expect(await adminGet(`users/${anon.uid}`)).toBeNull();
  // The account got the name of the device.
  expect(await device.repo.getProfiles([account.uid])).toEqual([{ id: account.uid, name: 'Anna' }]);
  // The device and the database keep nothing of the merge.
  expect(device.store.values.has(MERGE_KEY)).toBe(false);
}

describe('merge', () => {
  it('moves all the data of the anonymous account to the existing account', async () => {
    const scene = await mergeScene();
    const asked: unknown[] = [];

    const result = await scene.phone.repo.logIn('google', async (data) => (asked.push(data), 'merge'));

    expect(asked).toEqual([{ gauges: 3, labels: 2 }]);
    expect(result).toEqual({ kind: 'merged', report: { gauges: 3, labels: 2, skipped: 0 } });
    expect(scene.phone.repo.currentUser()!.uid).toBe(scene.account.uid);
    await expectMerged(scene, scene.phone);
    // The first phone of ann sees the same data.
    await gauges(scene.annFirst, 4);

    // bob sees ann's account in place of the old one, once, and still works.
    // (The first snapshot can come from the local cache of bob, so wait.)
    const pair = [scene.account.uid, scene.bobUser.uid].sort().join();
    const [bobDishes] = await waitFor(gaugesOf(scene.bob), (gs) => gs[0]?.members.sort().join() === pair, 'bob: Dishes');
    const [bobFlat] = await waitFor(labelsOf(scene.bob), (ls) => ls[0]?.members.sort().join() === pair, 'bob: Flat');
    await scene.bob.repo.markDone(bobDishes.id);
    await scene.bob.repo.createGauge({ name: 'Floor', repeatDays: 7, curve: 'linear', labelIds: [bobFlat.id] }).saved;
    await waitFor(gaugesOf(scene.phone), (gs) => gs.some((g) => g.name === 'Floor'), 'the new shared gauge');
  });

  it('ends the merge on the next start when the app stopped after the sign-in', async () => {
    const scene = await mergeScene();
    // The app stops after the sign-in, before the first claim: the first
    // read of the merge record fails.
    const store = scene.phone.store;
    const read = store.read.bind(store);
    let fail = true;
    store.read = async <T,>(key: string) => {
      if (key === MERGE_KEY && fail) {
        fail = false;
        throw new Error('The app stopped.');
      }
      return read<T>(key);
    };
    await expect(scene.phone.repo.logIn('google', async () => 'merge')).rejects.toBeInstanceOf(DataError);
    expect(scene.phone.repo.currentUser()!.uid).toBe(scene.account.uid);
    expect(store.values.has(MERGE_KEY)).toBe(true);

    const next = restart(scene.phone);
    expect(await next.repo.resumeMerge()).toEqual({ gauges: 3, labels: 2, skipped: 0 });
    await expectMerged(scene, next);
    expect(await next.repo.resumeMerge()).toBeNull();
  });

  it('ends a merge that stopped half way, and counts the done items once', async () => {
    const scene = await mergeScene();
    const store = scene.phone.store;
    // Keep a copy of the record, then run the whole merge.
    const write = store.write.bind(store);
    let record: PendingMerge | null = null;
    store.write = async (key, value) => {
      if (key === MERGE_KEY && value) record = value as PendingMerge;
      return write(key, value);
    };
    await scene.phone.repo.logIn('google', async () => 'merge');
    // Put the record back, as if the app stopped before its last step, and
    // put a new hand-over in place (the merge deleted the first one).
    const pending = record! as PendingMerge;
    await write(MERGE_KEY, pending);
    const res = await fetch(`${documentsUrl()}/handovers?documentId=${pending.code}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          from: { stringValue: pending.from },
          to: { stringValue: scene.account.uid },
          createdAt: { timestampValue: new Date().toISOString() },
          expiresAt: { timestampValue: new Date(Date.now() + 86400000).toISOString() },
        },
      }),
    });
    expect(res.ok).toBe(true);

    expect(await restart(scene.phone).repo.resumeMerge()).toEqual({ gauges: 3, labels: 2, skipped: 0 });
    await expectMerged(scene, scene.phone);
  });

  it('undoes the first step when the app stopped before the sign-in', async () => {
    const scene = await mergeScene();
    // A failed sign-in: the credential is not valid.
    const broken = createWebRepository({
      appName: scene.phone.appName,
      emulator: emulator(),
      store: scene.phone.store,
      idTokenFor: () => 'not a token',
    });
    // The link fails before the merge, so make the record by hand with a
    // working link, then stop: the device holds the record, the user is
    // still the anonymous account.
    await expect(broken.logIn('google', async () => 'merge')).rejects.toBeInstanceOf(DataError);
    expect(broken.currentUser()!.uid).toBe(scene.anon.uid);

    const write = scene.phone.store.write.bind(scene.phone.store);
    const pending: PendingMerge = {
      version: 1,
      code: 'u'.repeat(43),
      from: scene.anon.uid,
      fromName: 'Anna',
      gauges: [],
      labels: [],
    };
    await write(MERGE_KEY, pending);
    expect(await restart(scene.phone).repo.resumeMerge()).toBeNull();
    expect(scene.phone.store.values.has(MERGE_KEY)).toBe(false);
    expect(await scene.phone.repo.getProfiles([scene.anon.uid])).toEqual([{ id: scene.anon.uid, name: 'Anna' }]);
    expect(await gauges(scene.phone, 3)).toHaveLength(3);
  });

  it('leaves the data out on request: shared labels lose the old account, private data goes', async () => {
    const scene = await mergeScene();

    expect(await scene.phone.repo.logIn('google', async () => 'discard')).toEqual({ kind: 'switched' });

    expect(scene.phone.repo.currentUser()!.uid).toBe(scene.account.uid);
    expect((await gauges(scene.phone, 1)).map((g) => g.name)).toEqual(['Bins']);
    expect(await adminGet(`gauges/${scene.plantsId}`)).toBeNull();
    expect(await adminGet(`labels/${scene.gardenId}`)).toBeNull();
    const only = scene.bobUser.uid;
    await waitFor(labelsOf(scene.bob), (ls) => ls[0]?.members.join() === only, 'bob: Flat without ann');
    await waitFor(gaugesOf(scene.bob), (gs) => gs[0]?.members.join() === only, 'bob: Dishes without ann');
  });
});

describe('delete account', () => {
  it('leaves shared labels, deletes private data and the profile, then the auth user', async () => {
    const bob = newDevice('bob');
    const bobUser = await bob.repo.signInAnonymously();
    const flatId = await bob.repo.createLabel('Flat').saved.then(async () => (await labels(bob, 1))[0].id);
    await bob.repo.createGauge({ name: 'Dishes', repeatDays: 1, curve: 'linear', labelIds: [flatId] }).saved;
    const invite = await bob.repo.createInvite(flatId);

    const ann = newDevice('ann');
    await ann.repo.logIn('google', never);
    const annUser = ann.repo.currentUser()!;
    await ann.repo.setMyName('Ann');
    await ann.repo.joinByInvite(invite);
    const priv = ann.repo.createLabel('Mine');
    await priv.saved;
    const plants = ann.repo.createGauge({ name: 'Plants', repeatDays: 3, curve: 'linear', labelIds: [priv.id] });
    await plants.saved;
    // A gauge that ann made in the shared label: bob uses it too.
    const floor = ann.repo.createGauge({ name: 'Floor', repeatDays: 7, curve: 'linear', labelIds: [flatId] });
    await floor.saved;
    await gauges(ann, 3);

    await ann.repo.deleteAccount();

    expect(ann.repo.currentUser()).toBeNull();
    expect(await adminGet(`users/${annUser.uid}`)).toBeNull();
    expect(await adminGet(`gauges/${plants.id}`)).toBeNull();
    expect(await adminGet(`labels/${priv.id}`)).toBeNull();
    // bob keeps the shared label and both gauges, with no ann in the label.
    const bobGauges = await waitFor(
      gaugesOf(bob),
      (gs) => gs.length === 2 && gs.some((g) => g.name === 'Dishes' && g.members.join() === bobUser.uid),
      'bob: Dishes and Floor',
    );
    expect(bobGauges.map((g) => g.name).sort()).toEqual(['Dishes', 'Floor']);
    await waitFor(labelsOf(bob), (ls) => ls[0]?.members.join() === bobUser.uid, 'bob: Flat without ann');
    // The Google login now makes a new account.
    await ann.repo.logIn('google', never);
    expect(ann.repo.currentUser()!.uid).not.toBe(annUser.uid);
  });

  it('deletes an anonymous account', async () => {
    const phone = newDevice('ann');
    await phone.repo.signInAnonymously();
    const g = phone.repo.createGauge({ name: 'Plants', repeatDays: 3, curve: 'linear' });
    await g.saved;
    await phone.repo.deleteAccount();
    expect(phone.repo.currentUser()).toBeNull();
    expect(await adminGet(`gauges/${g.id}`)).toBeNull();
  });
});
