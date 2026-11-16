import { createFirestoreRepository } from '../firestoreRepository';
import type { DocSnapshot, FirestorePort, Platform, WriteOp } from '../port';
import { DataError } from '../repository';
import { fakeSentinels } from '../testing/fakes';

/**
 * A platform where each commit stays pending, as on a native device with no
 * connection. The test reads the queued writes in order.
 */
function offlinePlatform(labels: DocSnapshot[] = []) {
  const commits: WriteOp[][] = [];
  let next = 0;
  let onLabels: ((docs: DocSnapshot[]) => void) | null = null;
  const firestore: FirestorePort = {
    ...fakeSentinels,
    newId: (path) => `${path}-${++next}`,
    get: () => new Promise(() => {}),
    watchMembership: (path, _uid, onNext) => {
      if (path === 'labels') {
        onLabels = onNext;
        onNext(labels);
      }
      return () => {};
    },
    listMembership: async () => [],
    commit: (ops) => {
      commits.push(ops);
      return new Promise(() => {});
    },
    runTransaction: () => new Promise(() => {}),
  };
  const user = { uid: 'alice', isAnonymous: true, logins: [], displayName: null };
  const platform: Platform = {
    firestore,
    auth: {
      current: () => user,
      onChange: (listener) => {
        listener(user);
        return () => {};
      },
      signInAnonymously: async () => user,
      signOut: async () => {},
      link: async () => user,
      signIn: async () => user,
      signInWithCredential: async () => user,
      unlink: async () => user,
      reauthenticate: async () => {},
      deleteUser: async () => {},
    },
    store: { read: async () => null, write: async () => {} },
    randomBytes: (n) => new Uint8Array(n),
    now: () => 10_000,
  };
  return { platform, commits, pushLabels: (docs: DocSnapshot[]) => onLabels?.(docs) };
}

const labelDoc = (id: string, members: string[]): DocSnapshot => ({
  id,
  data: { name: id, members, gaugeIds: [], createdBy: members[0], createdAt: { toMillis: () => 0 } },
});

describe('createGauge and createLabel', () => {
  it('return the ID at once and queue the writes in order, with no connection', async () => {
    const { platform, commits } = offlinePlatform([labelDoc('home', ['alice', 'bob'])]);
    const repo = createFirestoreRepository(platform);
    repo.subscribeMyLabels(() => {});

    const label = repo.createLabel('Plants');
    const gauge = repo.createGauge({
      name: 'Water',
      repeatDays: 3,
      curve: 'linear',
      labelIds: ['home', label.id],
      doneAt: 20_000,
    });
    expect(label.id).toBe('labels-1');
    expect(gauge.id).toBe('gauges-2');

    // The label writes start after one microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(commits.map((ops) => ops.map((op) => `${op.type} ${op.path}`))).toEqual([
      ['set labels/labels-1'],
      ['set gauges/gauges-2'],
      ['update gauges/gauges-2'],
      ['update gauges/gauges-2', 'update labels/home'],
      ['update gauges/gauges-2', 'update labels/labels-1'],
    ]);
    // The first execution is not after the time of the create.
    expect(commits[2][0]).toMatchObject({ data: { executions: { union: [{ at: { ts: 10_000 }, by: 'alice' }] } } });
    // The shared label gives its members to the gauge.
    expect(commits[3][0]).toMatchObject({
      data: { members: { union: ['alice', 'bob'] }, joinVia: 'home' },
    });
  });

  it('uses its own copy of a label that the server did not confirm yet, with no live list', async () => {
    // A read of such a label can reach the server before the create, and the
    // rules refuse it. The fake `get` never answers, so a read stops the write.
    const { platform, commits } = offlinePlatform();
    const repo = createFirestoreRepository(platform);

    const label = repo.createLabel('Plants');
    repo.createGauge({ name: 'Water', repeatDays: 3, curve: 'linear', labelIds: [label.id] });
    await Promise.resolve();
    await Promise.resolve();
    expect(commits.map((ops) => ops.map((op) => `${op.type} ${op.path}`))).toEqual([
      ['set labels/labels-1'],
      ['set gauges/gauges-2'],
      ['update gauges/gauges-2', 'update labels/labels-1'],
    ]);

    repo.addLabelToGauge('other-gauge', label.id).catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(commits[3].map((op) => `${op.type} ${op.path}`)).toEqual(['update gauges/other-gauge', 'update labels/labels-1']);
  });

  it('writes the emoji of a new label, and refuses a text that is not one emoji', async () => {
    const { platform, commits } = offlinePlatform();
    const repo = createFirestoreRepository(platform);
    repo.createLabel('Plants', '🪴');
    repo.createLabel('Car');
    await Promise.resolve();
    expect(commits[0][0]).toMatchObject({ data: { name: 'Plants', emoji: '🪴' } });
    expect(commits[1][0]).not.toHaveProperty('data.emoji');
    expect(() => repo.createLabel('Home', 'ab')).toThrow(DataError);
    expect(() => repo.createLabel('Home', '🏠🚗')).toThrow(DataError);
  });

  it('throws at once for a name that is not valid', () => {
    const { platform, commits } = offlinePlatform();
    const repo = createFirestoreRepository(platform);
    expect(() => repo.createGauge({ name: '  ', repeatDays: 1, curve: 'linear' })).toThrow(DataError);
    expect(() => repo.createLabel('')).toThrow(DataError);
    expect(commits).toEqual([]);
  });
});
