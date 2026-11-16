import type { AuthUser, Login, LoginProvider } from './repository';

/**
 * The names of the providers in Firebase Auth. To add a provider, add it to
 * `LoginProvider` and here.
 */
const PROVIDER_IDS: Record<LoginProvider, string> = {
  google: 'google.com',
  apple: 'apple.com',
};

export function providerIdOf(provider: LoginProvider): string {
  return PROVIDER_IDS[provider];
}

export function providerOf(providerId: string): LoginProvider | null {
  const entry = Object.entries(PROVIDER_IDS).find(([, id]) => id === providerId);
  return entry ? (entry[0] as LoginProvider) : null;
}

/** The user fields that both Firebase SDKs give. */
export interface SdkUser {
  uid: string;
  isAnonymous: boolean;
  displayName?: string | null;
  providerData?: readonly { providerId: string; email?: string | null; displayName?: string | null }[];
}

/** Converts a user of either SDK. It leaves out providers that the app does not know. */
export function toAuthUser(user: SdkUser | null): AuthUser | null {
  if (!user) return null;
  const logins: Login[] = [];
  let displayName = user.displayName ?? null;
  for (const info of user.providerData ?? []) {
    const provider = providerOf(info.providerId);
    if (!provider || logins.some((l) => l.provider === provider)) continue;
    logins.push({ provider, email: info.email ?? null });
    displayName ??= info.displayName ?? null;
  }
  return { uid: user.uid, isAnonymous: user.isAnonymous, logins, displayName };
}
