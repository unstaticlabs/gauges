import { createFirestoreRepository } from '../firestoreRepository';
import type { AuthPort, FirestorePort, Platform, WriteOp } from '../port';
import type { AuthUser } from '../repository';
import { fakeSentinels } from '../testing/fakes';
import { withoutAnonymous } from '../withoutAnonymous';

const anonymous: AuthUser = { uid: 'old-anon', isAnonymous: true, displayName: null, logins: [] };
const google: AuthUser = {
  uid: 'u1',
  isAnonymous: false,
  displayName: 'Ann',
  logins: [{ provider: 'google', email: 'a@example.com' }],
};

/** A fake auth port. `restore` plays the user that the browser restores at start. */
function fakePort(restored: AuthUser | null) {
  let user = restored;
  const listeners = new Set<(user: AuthUser | null) => void>();
  const emit = () => listeners.forEach((listener) => listener(user));
  const calls: string[] = [];
  const port: AuthPort = {
    current: () => user,
    onChange: (listener) => {
      listeners.add(listener);
      listener(user);
      return () => listeners.delete(listener);
    },
    signInAnonymously: async () => {
      calls.push('signInAnonymously');
      return anonymous;
    },
    signOut: async () => {
      calls.push('signOut');
      user = null;
      emit();
    },
    link: async () => {
      calls.push('link');
      return google;
    },
    signIn: async () => {
      calls.push('signIn');
      user = google;
      emit();
      return google;
    },
    signInWithCredential: async () => google,
    unlink: async () => {
      calls.push('unlink');
      return google;
    },
    reauthenticate: async () => {
      calls.push('reauthenticate');
    },
    beforeDelete: async () => {
      calls.push('beforeDelete');
    },
    deleteUser: async () => {
      calls.push('deleteUser');
    },
  };
  return { port, calls };
}

describe('withoutAnonymous', () => {
  it('hides a restored anonymous user and signs it out', async () => {
    const { port, calls } = fakePort(anonymous);
    const guarded = withoutAnonymous(port);
    const seen: (AuthUser | null)[] = [];
    guarded.onChange((user) => seen.push(user));
    await Promise.resolve();
    expect(seen[0]).toBeNull();
    expect(seen).not.toContainEqual(anonymous);
    expect(guarded.current()).toBeNull();
    expect(calls.filter((c) => c === 'signOut')).toHaveLength(1);
    expect(port.current()).toBeNull();
  });

  it('refuses each account operation for an anonymous user', async () => {
    const { port, calls } = fakePort(anonymous);
    // Keep the user in place, as if the sign-out were slow.
    port.signOut = () => new Promise(() => {});
    const guarded = withoutAnonymous(port);
    await expect(guarded.deleteUser()).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(guarded.beforeDelete!()).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(guarded.link('google')).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(guarded.unlink('google')).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(guarded.reauthenticate('google')).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(guarded.signInAnonymously()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(calls).toEqual([]);
  });

  it('keeps a user with a login', async () => {
    const { port, calls } = fakePort(google);
    const guarded = withoutAnonymous(port);
    const seen: (AuthUser | null)[] = [];
    guarded.onChange((user) => seen.push(user));
    expect(seen).toEqual([google]);
    expect(guarded.current()).toEqual(google);
    await guarded.deleteUser();
    expect(calls).toEqual(['deleteUser']);
  });

  it('lets a login replace the anonymous user', async () => {
    const { port } = fakePort(anonymous);
    const guarded = withoutAnonymous(port);
    const seen: (AuthUser | null)[] = [];
    guarded.onChange((user) => seen.push(user));
    await guarded.signIn('google');
    expect(seen.at(-1)).toEqual(google);
    expect(seen).not.toContainEqual(anonymous);
  });
});

describe('a repository on the guarded port', () => {
  it('writes and deletes nothing for a restored anonymous user', async () => {
    const { port, calls } = fakePort(anonymous);
    // Keep the user in place, as if the sign-out were slow.
    port.signOut = () => new Promise(() => {});
    const commits: WriteOp[][] = [];
    const reads: string[] = [];
    const firestore: FirestorePort = {
      ...fakeSentinels,
      newId: (path) => `${path}-1`,
      get: async (path) => {
        reads.push(path);
        return null;
      },
      watchMembership: () => () => {},
      listMembership: async () => [],
      commit: async (ops) => {
        commits.push(ops);
      },
      runTransaction: () => new Promise(() => {}),
    };
    const platform: Platform = {
      firestore,
      auth: withoutAnonymous(port),
      store: { read: async () => null, write: async () => {} },
      randomBytes: (n) => new Uint8Array(n),
    };
    const repo = createFirestoreRepository(platform);
    const users: (AuthUser | null)[] = [];
    repo.onAuthStateChanged((user) => users.push(user));

    expect(users).toEqual([null]);
    expect(repo.currentUser()).toBeNull();
    await expect(repo.deleteAccount()).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(repo.markDone('g1')).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(repo.setMyName('Ann')).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(repo.resumeMerge()).resolves.toBeNull();
    expect(commits).toEqual([]);
    expect(calls).toEqual([]);
  });
});
