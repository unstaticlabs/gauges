import type { AuthPort } from './port';
import { type AuthUser, DataError } from './repository';

/**
 * Wraps the auth port of the live website so that an anonymous user never
 * reaches the app.
 *
 * The website can share the API key and the browser storage of an earlier
 * web app of the same Firebase project. A browser that used that web app
 * can still hold its anonymous login, and Firebase restores it at start. This
 * wrapper hides such a user: `current` gives `null`, `onChange` reports
 * `null`, and the wrapper signs the user out at once. The app then shows
 * the login gate. No write and no delete can run as that user, because
 * each operation of the repository needs `current` first, and the account
 * operations here refuse an anonymous user.
 */
export function withoutAnonymous(port: AuthPort): AuthPort {
  let signingOut = false;

  /** Signs out an anonymous user one time, also when many calls see it. */
  const dropAnonymous = () => {
    if (signingOut) return;
    signingOut = true;
    port
      .signOut()
      .catch((error) => console.warn('Sign-out of an anonymous user failed', error))
      .finally(() => {
        signingOut = false;
      });
  };

  /** Gives `null` for an anonymous user, and starts its sign-out. */
  const visible = (user: AuthUser | null): AuthUser | null => {
    if (!user?.isAnonymous) return user;
    dropAnonymous();
    return null;
  };

  /** Throws when no user with a login is signed in. */
  const requireLogin = () => {
    if (!visible(port.current())) throw new DataError('unauthenticated', 'No user is signed in.');
  };

  const guarded: AuthPort = {
    current: () => visible(port.current()),
    onChange: (listener) => port.onChange((user) => listener(visible(user))),
    signInAnonymously: async () => {
      throw new DataError('permission-denied', 'The website needs a login.');
    },
    signOut: () => port.signOut(),
    link: async (provider) => {
      requireLogin();
      return port.link(provider);
    },
    signIn: (provider) => port.signIn(provider),
    signInWithCredential: (credential) => port.signInWithCredential(credential),
    unlink: async (provider) => {
      requireLogin();
      return port.unlink(provider);
    },
    reauthenticate: async (provider) => {
      requireLogin();
      return port.reauthenticate(provider);
    },
    deleteUser: async () => {
      requireLogin();
      return port.deleteUser();
    },
  };
  const { beforeDelete } = port;
  if (beforeDelete) {
    guarded.beforeDelete = async () => {
      requireLogin();
      return beforeDelete.call(port);
    };
  }
  return guarded;
}
