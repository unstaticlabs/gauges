/**
 * The rules tests of `firestore.rules`. They run against the local
 * Firestore emulator.
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

const CODE = 'a'.repeat(20) + 'B'.repeat(12) + '_-x9';
const EXPIRED_CODE = 'e'.repeat(40);
const OTHER_LABEL_CODE = 'o'.repeat(40);

let env: RulesTestEnvironment;

function db(uid: string): Db {
  return env.authenticatedContext(uid).firestore();
}

function anonDb(): Db {
  return env.unauthenticatedContext().firestore();
}

function now(): firebase.firestore.Timestamp {
  return Timestamp.fromMillis(Date.now());
}

function gaugeData(createdBy: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'Water the plants',
    repeatDays: 3,
    curve: 'linear',
    labelIds: [],
    members: [createdBy],
    createdBy,
    executions: [],
    archivedAt: null,
    mutedBy: [],
    createdAt: now(),
    ...extra,
  };
}

function labelData(createdBy: string, extra: Record<string, unknown> = {}) {
  return {
    name: 'Home',
    members: [createdBy],
    gaugeIds: [],
    createdBy,
    createdAt: now(),
    ...extra,
  };
}

/**
 * The start state of each test:
 * - alice owns gauge `g1` with label `L1`. L1 has a valid invite, an expired
 *   invite, and alice as the only member.
 * - alice and dave share label `L2`. L2 is not on a gauge.
 * - `L3` belongs to erin, with an invite. It is not on g1.
 * - bob and carol are strangers.
 * - Some documents are outside the data model (`groups/`, `categories/`,
 *   and `users/alice/groups/`). The rules deny them to everybody.
 */
async function seed(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await d.doc('users/alice').set({ name: 'Alice', hasCompletedTutorial: true });
    await d.doc('gauges/g1').set(gaugeData('alice', { labelIds: ['L1'] }));
    await d.doc('labels/L1').set(labelData('alice', { gaugeIds: ['g1'] }));
    await d.doc(`labels/L1/invites/${CODE}`).set({
      createdBy: 'alice',
      createdAt: now(),
      expiresAt: null,
    });
    await d.doc(`labels/L1/invites/${EXPIRED_CODE}`).set({
      createdBy: 'alice',
      createdAt: Timestamp.fromMillis(Date.now() - 2 * 86400000),
      expiresAt: Timestamp.fromMillis(Date.now() - 86400000),
    });
    await d.doc('labels/L2').set(labelData('alice', { name: 'Flat', members: ['alice', 'dave'] }));
    await d.doc('labels/L3').set(labelData('erin', { name: 'Erin' }));
    await d.doc(`labels/L3/invites/${OTHER_LABEL_CODE}`).set({
      createdBy: 'erin',
      createdAt: now(),
      expiresAt: null,
    });
    await d.doc('groups/x1').set({ name: 'Group', createdBy: 'alice' });
    await d.doc('groups/x1/memberships/alice').set({});
    await d.doc('groups/x1/gauges/t1').set({ name: 'Task' });
    await d.doc('users/alice/groups/x1').set({ name: 'Group' });
    await d.doc('categories/c1').set({ name: 'Category' });
  });
}

/** Bob joins L1 with the valid code. */
async function bobJoinsL1(): Promise<void> {
  await assertSucceeds(
    db('bob').doc('labels/L1').update({
      members: FieldValue.arrayUnion('bob'),
      joinCode: CODE,
    }),
  );
}

beforeAll(async () => {
  // The SDK logs each denied write. The tests expect many of them.
  firebase.firestore.setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-gauges',
    firestore: {
      rules: rulesText(),
      ...hostAndPort(),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('users (point 7)', () => {
  it('lets the owner write their name', async () => {
    await assertSucceeds(db('bob').doc('users/bob').set({ name: 'Bob' }));
    await assertSucceeds(db('alice').doc('users/alice').set({ name: 'Al' }, { merge: true }));
  });

  it('accepts the field hasCompletedTutorial', async () => {
    await assertSucceeds(
      db('bob').doc('users/bob').set({ name: 'Bob', hasCompletedTutorial: false }),
    );
  });

  it('denies a write to the profile of another user', async () => {
    await assertFails(db('bob').doc('users/alice').set({ name: 'Mallory' }));
  });

  it('denies an empty name, a long name, and an unknown field', async () => {
    await assertFails(db('bob').doc('users/bob').set({ name: '' }));
    await assertFails(db('bob').doc('users/bob').set({ name: '   ' }));
    await assertFails(db('bob').doc('users/bob').set({ name: 'x'.repeat(61) }));
    await assertFails(db('bob').doc('users/bob').set({ name: 'Bob', admin: true }));
  });

  it('lets a signed-in user get one profile by ID', async () => {
    await assertSucceeds(db('bob').doc('users/alice').get());
  });

  it('denies a list of users', async () => {
    await assertFails(db('bob').collection('users').get());
    await assertFails(db('alice').collection('users').where('name', '==', 'Alice').get());
  });

  it('denies unauthenticated access', async () => {
    await assertFails(anonDb().doc('users/alice').get());
    await assertFails(anonDb().collection('users').get());
    await assertFails(anonDb().doc('users/x').set({ name: 'X' }));
  });

  it('denies a delete of the profile of another user', async () => {
    await assertFails(db('bob').doc('users/alice').delete());
    await assertSucceeds(db('alice').doc('users/alice').delete());
  });
});

describe('gauge read (point 1)', () => {
  it('lets a member get the gauge and list their gauges', async () => {
    await assertSucceeds(db('alice').doc('gauges/g1').get());
    const result = await assertSucceeds(
      db('alice').collection('gauges').where('members', 'array-contains', 'alice').get(),
    );
    expect(result.size).toBe(1);
  });

  it('denies a stranger', async () => {
    await assertFails(db('bob').doc('gauges/g1').get());
    await assertFails(db('bob').collection('gauges').get());
    await assertFails(
      db('bob').collection('gauges').where('members', 'array-contains', 'alice').get(),
    );
  });

  it('gives a stranger an empty list for their own query', async () => {
    const result = await assertSucceeds(
      db('bob').collection('gauges').where('members', 'array-contains', 'bob').get(),
    );
    expect(result.size).toBe(0);
  });

  it('denies unauthenticated access', async () => {
    await assertFails(anonDb().doc('gauges/g1').get());
    await assertFails(anonDb().collection('gauges').doc().set(gaugeData('x')));
  });
});

describe('gauge write by a member or a stranger (point 1)', () => {
  it('lets a member rename, mark done, and archive', async () => {
    const d = db('alice').doc('gauges/g1');
    await assertSucceeds(d.update({ name: 'Water the cactus' }));
    await assertSucceeds(
      d.update({ executions: FieldValue.arrayUnion({ at: now(), by: 'alice' }) }),
    );
    await assertSucceeds(d.update({ archivedAt: now() }));
    await assertSucceeds(d.update({ archivedAt: null }));
  });

  it('denies a stranger', async () => {
    await assertFails(db('bob').doc('gauges/g1').update({ name: 'Mine now' }));
    await assertFails(
      db('bob').doc('gauges/g1').update({
        executions: FieldValue.arrayUnion({ at: now(), by: 'bob' }),
      }),
    );
    await assertFails(db('bob').doc('gauges/g1').delete());
  });

  it('denies a change of createdBy or createdAt', async () => {
    await assertFails(db('alice').doc('gauges/g1').update({ createdBy: 'dave' }));
    await assertFails(
      db('alice').doc('gauges/g1').update({ createdAt: Timestamp.fromMillis(0) }),
    );
  });

  it('denies invalid fields', async () => {
    const d = db('alice').doc('gauges/g1');
    await assertFails(d.update({ repeatDays: 0 }));
    await assertFails(d.update({ repeatDays: '3' }));
    await assertFails(d.update({ curve: 'square' }));
    await assertFails(d.update({ name: '' }));
    await assertFails(d.update({ name: 'x'.repeat(61) }));
    await assertFails(d.update({ archivedAt: 'yesterday' }));
    await assertFails(d.update({ color: 'red' }));
  });

  it('denies removal of the creator from members', async () => {
    await assertFails(db('alice').doc('gauges/g1').update({ members: [] }));
  });

  it('lets a member delete the gauge', async () => {
    await assertSucceeds(db('alice').doc('gauges/g1').delete());
  });
});

describe('gauge and label create (point 2)', () => {
  it('lets a user create a gauge with only themselves in members', async () => {
    await assertSucceeds(db('bob').collection('gauges').doc().set(gaugeData('bob')));
  });

  it('denies a gauge with another creator or another member', async () => {
    await assertFails(db('bob').collection('gauges').doc().set(gaugeData('alice')));
    await assertFails(
      db('bob').collection('gauges').doc().set(gaugeData('bob', { members: ['bob', 'carol'] })),
    );
  });

  it('denies a new gauge with labels, executions, or invalid fields', async () => {
    const c = db('bob').collection('gauges');
    await assertFails(c.doc().set(gaugeData('bob', { labelIds: ['L1'] })));
    await assertFails(
      c.doc().set(gaugeData('bob', { executions: [{ at: now(), by: 'bob' }] })),
    );
    await assertFails(c.doc().set(gaugeData('bob', { repeatDays: 0 })));
    await assertFails(c.doc().set(gaugeData('bob', { curve: 'cubic' })));
    await assertFails(c.doc().set(gaugeData('bob', { name: '' })));
  });

  it('lets a user create a label with only themselves in members', async () => {
    await assertSucceeds(db('bob').collection('labels').doc().set(labelData('bob')));
  });

  it('lets a user create a label with or without an emoji', async () => {
    await assertSucceeds(db('bob').collection('labels').doc().set(labelData('bob', { emoji: '🪴' })));
    await assertFails(db('bob').collection('labels').doc().set(labelData('bob', { emoji: ['🪴'] })));
  });

  it('denies a label with another creator or another member', async () => {
    await assertFails(db('bob').collection('labels').doc().set(labelData('alice')));
    await assertFails(
      db('bob').collection('labels').doc().set(labelData('bob', { members: ['bob', 'carol'] })),
    );
  });
});

describe('label read and write (point 1)', () => {
  it('lets a member get the label and list their labels', async () => {
    await assertSucceeds(db('dave').doc('labels/L2').get());
    const result = await assertSucceeds(
      db('dave').collection('labels').where('members', 'array-contains', 'dave').get(),
    );
    expect(result.size).toBe(1);
  });

  it('denies a stranger', async () => {
    await assertFails(db('bob').doc('labels/L1').get());
    await assertFails(db('bob').doc('labels/L1').update({ name: 'Mine' }));
    await assertFails(db('bob').doc('labels/L1').delete());
  });

  it('lets a member rename the label', async () => {
    await assertSucceeds(db('dave').doc('labels/L2').update({ name: 'Our flat' }));
  });

  it('denies a member that adds another user to the label', async () => {
    await assertFails(
      db('alice').doc('labels/L1').update({ members: FieldValue.arrayUnion('carol') }),
    );
  });

  it('lets a member set, change, and remove the emoji of the label', async () => {
    await assertSucceeds(db('dave').doc('labels/L2').update({ emoji: '🏠' }));
    // A family emoji has 11 UTF-16 code units and 25 bytes.
    await assertSucceeds(db('alice').doc('labels/L2').update({ emoji: '👨‍👩‍👧‍👦' }));
    await assertSucceeds(db('alice').doc('labels/L2').update({ emoji: null }));
  });

  it('denies an emoji that is not a short string', async () => {
    await assertFails(db('dave').doc('labels/L2').update({ emoji: '' }));
    await assertFails(db('dave').doc('labels/L2').update({ emoji: 'x'.repeat(33) }));
    await assertFails(db('dave').doc('labels/L2').update({ emoji: 7 }));
    await assertFails(db('bob').doc('labels/L1').update({ emoji: '🏠' }));
  });

  it('lets only the creator delete a shared label', async () => {
    await assertFails(db('dave').doc('labels/L2').delete());
    await assertSucceeds(db('alice').doc('labels/L2').delete());
  });
});

describe('label level mode', () => {
  /** Gives L1 (alice alone, on g1) and L2 (alice and dave) the mode `worst`, with no rules. */
  async function withMode(): Promise<void> {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('labels/L1').update({ aggregate: 'worst' });
      await ctx.firestore().doc('labels/L2').update({ aggregate: 'worst' });
    });
  }

  it('lets a member set and change the mode, with each of the four values', async () => {
    for (const mode of ['worst', 'lowerHalf', 'median', 'average']) {
      await assertSucceeds(db('dave').doc('labels/L2').update({ aggregate: mode }));
    }
    await assertSucceeds(db('alice').doc('labels/L2').update({ aggregate: 'median' }));
    const l = (await assertSucceeds(db('dave').doc('labels/L2').get())).data();
    expect(l?.aggregate).toBe('median');
  });

  it('denies an unknown value', async () => {
    for (const value of ['best', '', 'Worst', null, 3, ['worst']]) {
      await assertFails(db('dave').doc('labels/L2').update({ aggregate: value }));
    }
  });

  it('denies a user who is not a member', async () => {
    await assertFails(db('bob').doc('labels/L1').update({ aggregate: 'average' }));
    await withMode();
    await assertFails(db('bob').doc('labels/L1').update({ aggregate: 'average' }));
  });

  it('lets a user create a label with or without a mode', async () => {
    await assertSucceeds(db('carol').doc('labels/new1').set(labelData('carol')));
    await assertSucceeds(db('carol').doc('labels/new2').set(labelData('carol', { aggregate: 'average' })));
    await assertFails(db('carol').doc('labels/new3').set(labelData('carol', { aggregate: 'best' })));
  });

  it('keeps a label without the field valid for each write', async () => {
    await assertSucceeds(db('dave').doc('labels/L2').update({ name: 'Our flat', emoji: '🏠' }));
    await assertSucceeds(db('dave').doc('labels/L2').update({ members: FieldValue.arrayRemove('dave') }));
  });

  // An app that does not know the field writes only the fields that it
  // changes. The rules check the whole document after the write, so these
  // writes must pass on a label that has the field.
  describe('writes of an app that does not know the field', () => {
    beforeEach(withMode);

    it('renames the label and changes its emoji', async () => {
      await assertSucceeds(db('dave').doc('labels/L2').update({ name: 'Our flat' }));
      await assertSucceeds(db('dave').doc('labels/L2').update({ emoji: '🏠' }));
      await assertSucceeds(db('dave').doc('labels/L2').update({ emoji: null }));
      const l = (await assertSucceeds(db('dave').doc('labels/L2').get())).data();
      expect(l).toMatchObject({ name: 'Our flat', aggregate: 'worst' });
    });

    it('adds the label to a gauge and removes it, with gaugeIds', async () => {
      const d = db('alice');
      const add = d.batch();
      add.update(d.doc('gauges/g1'), {
        labelIds: FieldValue.arrayUnion('L2'),
        members: FieldValue.arrayUnion('dave'),
        joinVia: 'L2',
      });
      add.update(d.doc('labels/L2'), { gaugeIds: FieldValue.arrayUnion('g1') });
      await assertSucceeds(add.commit());
      const remove = d.batch();
      remove.update(d.doc('gauges/g1'), {
        labelIds: FieldValue.arrayRemove('L2'),
        members: FieldValue.arrayRemove('dave'),
      });
      remove.update(d.doc('labels/L2'), { gaugeIds: FieldValue.arrayRemove('g1') });
      await assertSucceeds(remove.commit());
    });

    it('joins by invite, then leaves', async () => {
      await bobJoinsL1();
      await assertSucceeds(db('bob').doc('labels/L1').update({ joinCode: FieldValue.delete() }));
      await assertSucceeds(db('bob').doc('labels/L1').update({ members: FieldValue.arrayRemove('bob') }));
      const l = (await assertSucceeds(db('alice').doc('labels/L1').get())).data();
      expect(l).toMatchObject({ members: ['alice'], aggregate: 'worst' });
    });

    it('deletes the label', async () => {
      await assertSucceeds(db('alice').doc('labels/L2').delete());
    });

    it('still denies a stranger and a join with a mode change', async () => {
      await assertFails(db('bob').doc('labels/L1').update({ name: 'Mine' }));
      await assertFails(
        db('bob').doc('labels/L1').update({
          members: FieldValue.arrayUnion('bob'),
          joinCode: CODE,
          aggregate: 'average',
        }),
      );
    });
  });
});

describe('join by invite code (point 3)', () => {
  it('lets a user join the label with the code, then join its gauges', async () => {
    await bobJoinsL1();
    await assertSucceeds(db('bob').doc('labels/L1').get());
    await assertSucceeds(
      db('bob').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('bob'),
        joinVia: 'L1',
      }),
    );
    await assertSucceeds(db('bob').doc('gauges/g1').get());
  });

  it('lets a user join the label and the gauge in one batch', async () => {
    const d = db('bob');
    const batch = d.batch();
    batch.update(d.doc('labels/L1'), { members: FieldValue.arrayUnion('bob'), joinCode: CODE });
    batch.update(d.doc('gauges/g1'), { members: FieldValue.arrayUnion('bob'), joinVia: 'L1' });
    await assertSucceeds(batch.commit());
  });

  it('denies a wrong code', async () => {
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob'),
        joinCode: 'z'.repeat(40),
      }),
    );
  });

  it('denies a missing code', async () => {
    await assertFails(db('bob').doc('labels/L1').update({ members: FieldValue.arrayUnion('bob') }));
  });

  it('denies an expired code', async () => {
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob'),
        joinCode: EXPIRED_CODE,
      }),
    );
  });

  it('denies the code of another label', async () => {
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob'),
        joinCode: OTHER_LABEL_CODE,
      }),
    );
  });

  it('denies a code with a path in it', async () => {
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob'),
        joinCode: `${CODE}/../${CODE}`,
      }),
    );
  });

  it('denies a join that adds another user or changes the name', async () => {
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob', 'carol'),
        joinCode: CODE,
      }),
    );
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('carol'),
        joinCode: CODE,
      }),
    );
    await assertFails(
      db('bob').doc('labels/L1').update({
        members: FieldValue.arrayUnion('bob'),
        joinCode: CODE,
        name: 'Taken',
      }),
    );
  });

  it('denies a self-add to a gauge without label membership', async () => {
    await assertFails(
      db('bob').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('bob'),
        joinVia: 'L1',
      }),
    );
    await assertFails(db('bob').doc('gauges/g1').update({ members: FieldValue.arrayUnion('bob') }));
  });

  it('denies a self-add through a label that is not on the gauge', async () => {
    // Erin is a member of L3, but L3 is not on g1.
    await assertFails(
      db('erin').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('erin'),
        joinVia: 'L3',
      }),
    );
  });

  it('denies a self-add that also changes another field', async () => {
    await bobJoinsL1();
    await assertFails(
      db('bob').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('bob'),
        joinVia: 'L1',
        name: 'Changed',
      }),
    );
    await assertFails(
      db('bob').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('bob'),
        joinVia: 'L1',
        executions: FieldValue.arrayUnion({ at: now(), by: 'bob' }),
      }),
    );
  });

  it('denies a self-add that also adds another user', async () => {
    await bobJoinsL1();
    await assertFails(
      db('bob').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('bob', 'carol'),
        joinVia: 'L1',
      }),
    );
  });
});

describe('label on a gauge (point 4)', () => {
  it('lets a member add their label, with its members, in one batch', async () => {
    const d = db('alice');
    const batch = d.batch();
    batch.update(d.doc('gauges/g1'), {
      labelIds: FieldValue.arrayUnion('L2'),
      members: FieldValue.arrayUnion('alice', 'dave'),
      joinVia: 'L2',
    });
    batch.update(d.doc('labels/L2'), { gaugeIds: FieldValue.arrayUnion('g1') });
    await assertSucceeds(batch.commit());
    await assertSucceeds(db('dave').doc('gauges/g1').get());
  });

  it('denies a member that adds a stranger', async () => {
    await assertFails(
      db('alice').doc('gauges/g1').update({ members: FieldValue.arrayUnion('carol') }),
    );
    // Carol is not a member of L1, so naming L1 does not help.
    await assertFails(
      db('alice').doc('gauges/g1').update({
        members: FieldValue.arrayUnion('carol'),
        joinVia: 'L1',
      }),
    );
  });

  it('denies a label of which the caller is not a member', async () => {
    const d = db('alice');
    const batch = d.batch();
    batch.update(d.doc('gauges/g1'), {
      labelIds: FieldValue.arrayUnion('L3'),
      members: FieldValue.arrayUnion('erin'),
      joinVia: 'L3',
    });
    await assertFails(batch.commit());
  });

  it('denies a new label on a gauge when the label does not list the gauge', async () => {
    await assertFails(
      db('alice').doc('gauges/g1').update({
        labelIds: FieldValue.arrayUnion('L2'),
        members: FieldValue.arrayUnion('dave'),
        joinVia: 'L2',
      }),
    );
  });

  it('lets a member remove a label and its members', async () => {
    await bobJoinsL1();
    await assertSucceeds(
      db('bob').doc('gauges/g1').update({ members: FieldValue.arrayUnion('bob'), joinVia: 'L1' }),
    );
    const d = db('alice');
    const batch = d.batch();
    batch.update(d.doc('gauges/g1'), {
      labelIds: FieldValue.arrayRemove('L1'),
      members: FieldValue.arrayRemove('bob'),
    });
    batch.update(d.doc('labels/L1'), { gaugeIds: FieldValue.arrayRemove('g1') });
    await assertSucceeds(batch.commit());
    await assertFails(db('bob').doc('gauges/g1').get());
  });
});

describe('leave (point 5)', () => {
  beforeEach(async () => {
    await bobJoinsL1();
    await assertSucceeds(
      db('bob').doc('gauges/g1').update({ members: FieldValue.arrayUnion('bob'), joinVia: 'L1' }),
    );
  });

  it('lets a member remove themselves from the label and its gauges', async () => {
    const d = db('bob');
    const batch = d.batch();
    batch.update(d.doc('labels/L1'), { members: FieldValue.arrayRemove('bob') });
    batch.update(d.doc('gauges/g1'), {
      members: FieldValue.arrayRemove('bob'),
      mutedBy: FieldValue.arrayRemove('bob'),
    });
    await assertSucceeds(batch.commit());
    await assertFails(db('bob').doc('gauges/g1').get());
    await assertFails(db('bob').doc('labels/L1').get());
  });

  it('denies a member that removes another member from the label', async () => {
    await assertFails(db('bob').doc('labels/L1').update({ members: FieldValue.arrayRemove('alice') }));
  });

  it('denies the last member that leaves; the last member deletes instead', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('labels/L4').set(labelData('carol'));
    });
    await assertFails(db('carol').doc('labels/L4').update({ members: [] }));
    await assertSucceeds(db('carol').doc('labels/L4').delete());
  });
});

describe('mute (point 4 and the data layer)', () => {
  it('lets a member mute and unmute only themselves', async () => {
    const d = db('alice').doc('gauges/g1');
    await assertSucceeds(d.update({ mutedBy: FieldValue.arrayUnion('alice') }));
    await assertSucceeds(d.update({ mutedBy: FieldValue.arrayRemove('alice') }));
    await assertFails(d.update({ mutedBy: FieldValue.arrayUnion('dave') }));
  });
});

describe('invites (point 6)', () => {
  const code = 'N'.repeat(43);

  it('lets a label member create and delete an invite', async () => {
    const ref = db('alice').doc(`labels/L1/invites/${code}`);
    await assertSucceeds(ref.set({ createdBy: 'alice', createdAt: now(), expiresAt: null }));
    await assertSucceeds(ref.delete());
  });

  it('accepts an expiry time in the future and denies one in the past', async () => {
    const future = Timestamp.fromMillis(Date.now() + 86400000);
    const past = Timestamp.fromMillis(Date.now() - 1000);
    await assertSucceeds(
      db('alice')
        .doc(`labels/L1/invites/${code}`)
        .set({ createdBy: 'alice', createdAt: now(), expiresAt: future }),
    );
    await assertFails(
      db('alice')
        .doc(`labels/L1/invites/${'P'.repeat(43)}`)
        .set({ createdBy: 'alice', createdAt: now(), expiresAt: past }),
    );
  });

  it('denies a stranger', async () => {
    await assertFails(
      db('bob')
        .doc(`labels/L1/invites/${code}`)
        .set({ createdBy: 'bob', createdAt: now(), expiresAt: null }),
    );
    await assertFails(db('bob').doc(`labels/L1/invites/${CODE}`).delete());
  });

  it('denies a short code', async () => {
    await assertFails(
      db('alice')
        .doc('labels/L1/invites/short')
        .set({ createdBy: 'alice', createdAt: now(), expiresAt: null }),
    );
  });

  it('denies an overwrite of an invite', async () => {
    await assertFails(
      db('alice')
        .doc(`labels/L1/invites/${EXPIRED_CODE}`)
        .set({ createdBy: 'alice', createdAt: now(), expiresAt: null }),
    );
  });

  it('denies a read or a list, also to a member', async () => {
    await assertFails(db('alice').doc(`labels/L1/invites/${CODE}`).get());
    await assertFails(db('alice').collection('labels/L1/invites').get());
    await assertFails(db('bob').doc(`labels/L1/invites/${CODE}`).get());
  });

  it('makes a deleted code fail', async () => {
    await assertSucceeds(db('alice').doc(`labels/L1/invites/${CODE}`).delete());
    await assertFails(
      db('bob').doc('labels/L1').update({ members: FieldValue.arrayUnion('bob'), joinCode: CODE }),
    );
  });
});

describe('gauge pause', () => {
  const DAY = 86400000;
  const ago = (days: number) => Timestamp.fromMillis(Date.now() - days * DAY);
  const PAUSE = { pausedAt: ago(1), pausedMs: 2 * DAY, pausedMsSince: ago(5) };

  /** Puts g1 on L2, so that alice and dave share it. */
  async function shareG1WithDave(): Promise<void> {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('gauges/g1').update({ labelIds: ['L1', 'L2'], members: ['alice', 'dave'] });
      await ctx.firestore().doc('labels/L2').update({ gaugeIds: ['g1'] });
    });
  }

  it('lets each member pause and resume', async () => {
    await shareG1WithDave();
    await assertSucceeds(db('dave').doc('gauges/g1').update({ pausedAt: now() }));
    await assertSucceeds(
      db('alice').doc('gauges/g1').update({ pausedAt: null, pausedMs: 3 * DAY, pausedMsSince: ago(4) }),
    );
    await assertSucceeds(db('alice').doc('gauges/g1').update({ pausedAt: now() }));
    await assertSucceeds(db('dave').doc('gauges/g1').update({ pausedAt: null, pausedMs: 0, pausedMsSince: null }));
    // A transaction of the app writes the whole document.
    const g = (await assertSucceeds(db('alice').doc('gauges/g1').get())).data()!;
    await assertSucceeds(db('alice').doc('gauges/g1').set({ ...g, pausedAt: now() }));
  });

  it('denies invalid values', async () => {
    const d = db('alice').doc('gauges/g1');
    for (const value of ['yesterday', 12, true, {}]) {
      await assertFails(d.update({ pausedAt: value }));
      await assertFails(d.update({ pausedMsSince: value }));
    }
    for (const value of [-1, 630720000001, '5', null, now()]) {
      await assertFails(d.update({ pausedMs: value }));
    }
    await assertSucceeds(d.update({ pausedMs: 630720000000 }));
  });

  it('denies a stranger', async () => {
    await assertFails(db('bob').doc('gauges/g1').update({ pausedAt: now() }));
  });

  it('denies a new gauge with a pause field', async () => {
    for (const field of Object.entries(PAUSE)) {
      await assertFails(db('bob').collection('gauges').doc().set(gaugeData('bob', Object.fromEntries([field]))));
    }
    await assertFails(db('bob').collection('gauges').doc().set(gaugeData('bob', { pausedAt: null })));
  });

  it('denies a self-join that also changes the pause', async () => {
    await bobJoinsL1();
    await assertFails(
      db('bob').doc('gauges/g1').update({ members: FieldValue.arrayUnion('bob'), joinVia: 'L1', pausedAt: now() }),
    );
  });

  // An app that does not know the fields writes only the fields that it
  // changes. The rules check the whole document after the write, so each of
  // these writes must pass on a gauge that has the fields.
  describe('writes of an app that does not know the fields', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc('gauges/g1').update({ ...PAUSE, executions: [{ at: ago(5), by: 'alice' }] });
      });
    });

    it('marks done, changes the date of an execution, and removes it', async () => {
      const d = db('alice').doc('gauges/g1');
      const doneAt = now();
      await assertSucceeds(d.update({ executions: FieldValue.arrayUnion({ at: doneAt, by: 'alice' }) }));
      await assertSucceeds(
        d.update({ executions: [{ at: ago(5), by: 'alice' }, { at: ago(0.5), by: 'alice' }] }),
      );
      await assertSucceeds(d.update({ executions: FieldValue.arrayRemove({ at: ago(5), by: 'alice' }) }));
      const g = (await assertSucceeds(d.get())).data();
      expect(g).toMatchObject({ pausedMs: 2 * DAY });
    });

    it('renames, and changes the interval and the curve', async () => {
      const d = db('alice').doc('gauges/g1');
      await assertSucceeds(d.update({ name: 'Fertilize' }));
      await assertSucceeds(d.update({ repeatDays: 30, curve: 'late' }));
    });

    it('adds a label with its members and removes it, in batches', async () => {
      const d = db('alice');
      const add = d.batch();
      add.update(d.doc('gauges/g1'), {
        labelIds: FieldValue.arrayUnion('L2'),
        members: FieldValue.arrayUnion('alice', 'dave'),
        joinVia: 'L2',
      });
      add.update(d.doc('labels/L2'), { gaugeIds: FieldValue.arrayUnion('g1') });
      await assertSucceeds(add.commit());
      const remove = d.batch();
      remove.update(d.doc('gauges/g1'), {
        labelIds: FieldValue.arrayRemove('L2'),
        members: FieldValue.arrayRemove('dave'),
        mutedBy: FieldValue.arrayRemove('dave'),
      });
      remove.update(d.doc('labels/L2'), { gaugeIds: FieldValue.arrayRemove('g1') });
      await assertSucceeds(remove.commit());
    });

    it('archives, restores, mutes, and unmutes', async () => {
      const d = db('alice').doc('gauges/g1');
      await assertSucceeds(d.update({ archivedAt: now() }));
      await assertSucceeds(d.update({ archivedAt: null }));
      await assertSucceeds(d.update({ mutedBy: FieldValue.arrayUnion('alice') }));
      await assertSucceeds(d.update({ mutedBy: FieldValue.arrayRemove('alice') }));
    });

    it('joins the gauge through a label, marks it done, then leaves', async () => {
      await bobJoinsL1();
      const d = db('bob');
      await assertSucceeds(d.doc('gauges/g1').update({ members: FieldValue.arrayUnion('bob'), joinVia: 'L1' }));
      await assertSucceeds(d.doc('gauges/g1').update({ executions: FieldValue.arrayUnion({ at: now(), by: 'bob' }) }));
      const leave = d.batch();
      leave.update(d.doc('labels/L1'), { members: FieldValue.arrayRemove('bob') });
      leave.update(d.doc('gauges/g1'), {
        members: FieldValue.arrayRemove('bob'),
        mutedBy: FieldValue.arrayRemove('bob'),
      });
      await assertSucceeds(leave.commit());
    });

    it('deletes the label of the gauge, then the gauge', async () => {
      const d = db('alice');
      const batch = d.batch();
      batch.update(d.doc('gauges/g1'), { labelIds: FieldValue.arrayRemove('L1') });
      batch.delete(d.doc('labels/L1'));
      await assertSucceeds(batch.commit());
      await assertSucceeds(d.doc('gauges/g1').delete());
    });

    it('still denies a stranger', async () => {
      await assertFails(db('bob').doc('gauges/g1').update({ executions: FieldValue.arrayUnion({ at: now(), by: 'bob' }) }));
    });
  });
});

describe('everything else (point 8)', () => {
  it('denies the paths outside the data model, also to the creator', async () => {
    await assertFails(db('alice').doc('groups/x1').get());
    await assertFails(db('alice').doc('groups/x1').set({ name: 'X', createdBy: 'alice' }));
    await assertFails(db('alice').doc('groups/x1/gauges/t1').get());
    await assertFails(db('alice').doc('users/alice/groups/x1').get());
    await assertFails(db('alice').doc('users/alice/groups/x2').set({ name: 'X' }));
    await assertFails(db('alice').doc('categories/c1').get());
  });

  it('denies the paths outside the data model to other users', async () => {
    await assertFails(db('bob').doc('groups/x1').get());
    await assertFails(db('bob').doc('groups/x1/gauges/t1').get());
    await assertFails(db('bob').doc('users/alice/groups/x1').get());
    await assertFails(db('bob').doc('users/alice/groups/x2').set({ name: 'X' }));
  });

  it('denies an unknown collection', async () => {
    await assertFails(db('alice').doc('other/x').set({ a: 1 }));
  });
});
