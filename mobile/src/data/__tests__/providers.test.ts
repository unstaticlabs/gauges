import { toDataError } from '../firestoreRepository';
import { providerIdOf, providerOf, toAuthUser } from '../providers';

describe('providers', () => {
  it('maps the provider names both ways', () => {
    expect(providerIdOf('google')).toBe('google.com');
    expect(providerOf('apple.com')).toBe('apple');
    expect(providerOf('password')).toBeNull();
  });

  it('converts an SDK user and leaves out unknown providers', () => {
    expect(
      toAuthUser({
        uid: 'u1',
        isAnonymous: false,
        displayName: null,
        providerData: [
          { providerId: 'google.com', email: 'a@example.com', displayName: 'Ann' },
          { providerId: 'password', email: 'a@example.com' },
          { providerId: 'apple.com', email: null },
        ],
      }),
    ).toEqual({
      uid: 'u1',
      isAnonymous: false,
      displayName: 'Ann',
      logins: [
        { provider: 'google', email: 'a@example.com' },
        { provider: 'apple', email: null },
      ],
    });
    expect(toAuthUser({ uid: 'a', isAnonymous: true })).toEqual({
      uid: 'a',
      isAnonymous: true,
      displayName: null,
      logins: [],
    });
    expect(toAuthUser(null)).toBeNull();
  });
});

describe('toDataError for auth errors', () => {
  it.each([
    ['auth/credential-already-in-use', 'credential-in-use'],
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/requires-recent-login', 'requires-recent-login'],
    ['auth/account-exists-with-different-credential', 'account-exists'],
    ['auth/network-request-failed', 'unavailable'],
    ['auth/internal-error', 'unknown'],
  ])('maps %s to %s', (raw, code) => {
    expect(toDataError({ code: raw, message: 'x' }).code).toBe(code);
  });
});
