import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { anonymousAllowed, type AuthUser, getRepository, signsInAutomatically } from '@/data';

import { readStored, STORAGE_KEYS, writeStored } from './storage';

export type SessionStatus =
  /** The first auth event did not arrive yet, or the app signs in now. */
  | 'loading'
  | 'signedIn'
  /** No user: the app shows the start screen (the login screen on the web). */
  | 'signedOut';

export interface Session {
  status: SessionStatus;
  user: AuthUser | null;
  /** `true` when the start screen offers to continue without an account. */
  anonymousAllowed: boolean;
  /** Logs out. On the phone, the next start shows the start screen. */
  signOut: () => Promise<void>;
  /** Makes a new anonymous account. */
  continueWithoutAccount: () => Promise<void>;
}

const noop = async () => {};

const SessionContext = createContext<Session>({
  status: 'loading',
  user: null,
  anonymousAllowed,
  signOut: noop,
  continueWithoutAccount: noop,
});

/**
 * Follows the auth state of the repository.
 *
 * On the phone, the first start signs in anonymously, with no login screen.
 * After a log-out, the app shows the start screen, also after a restart,
 * until the user logs in or continues without an account. The web always
 * shows the login screen when no user is signed in.
 *
 * After each sign-in, it calls `repairMemberships` one time, so that the
 * user gets back each gauge that a shared label lists.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: SessionStatus; user: AuthUser | null }>({
    status: 'loading',
    user: null,
  });

  useEffect(() => {
    const repository = getRepository();
    let repairedFor: string | null = null;
    let first = true;
    let active = true;
    const stop = repository.onAuthStateChanged((user) => {
      const isFirst = first;
      first = false;
      if (user) {
        setState({ status: 'signedIn', user });
        if (repairedFor !== user.uid) {
          repairedFor = user.uid;
          void writeStored(STORAGE_KEYS.loggedOut, null);
          repository.repairMemberships().catch((error) => {
            console.warn('repairMemberships failed', error);
          });
        }
        return;
      }
      if (!isFirst || !signsInAutomatically) {
        setState({ status: 'signedOut', user: null });
        return;
      }
      // The first start on the phone: sign in anonymously, unless the user
      // logged out before.
      void readStored<boolean>(STORAGE_KEYS.loggedOut).then((loggedOut) => {
        if (!active) return;
        if (loggedOut) {
          setState({ status: 'signedOut', user: null });
          return;
        }
        repository.signInAnonymously().catch((error) => {
          console.warn('Anonymous sign-in failed', error);
          if (active) setState({ status: 'signedOut', user: null });
        });
      });
    });
    return () => {
      active = false;
      stop();
    };
  }, []);

  const signOut = useCallback(async () => {
    await writeStored(STORAGE_KEYS.loggedOut, true);
    await getRepository().signOut();
  }, []);

  const continueWithoutAccount = useCallback(async () => {
    await writeStored(STORAGE_KEYS.loggedOut, null);
    await getRepository().signInAnonymously();
  }, []);

  const session = useMemo<Session>(
    () => ({ ...state, anonymousAllowed, signOut, continueWithoutAccount }),
    [state, signOut, continueWithoutAccount],
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
