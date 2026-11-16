import { type AuthCredential, GoogleAuthProvider, OAuthProvider } from '@react-native-firebase/auth';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';

import { GOOGLE_WEB_CLIENT_ID } from './config';
import { toBase64Url } from './invite';
import { providerIdOf } from './providers';
import { DataError, type LoginProvider } from './repository';

/**
 * Gets the credential of a provider from its native SDK on iOS and Android.
 * Only `client.native.ts` uses this file. To add a provider, add a function
 * here that gives its Firebase credential.
 */

const cancelled = () => new DataError('cancelled', 'The user closed the login window.');

let googleReady = false;

function ensureGoogle(): void {
  if (googleReady) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleReady = true;
}

/**
 * Google: the native SDK gives an ID token for the web client of the
 * Firebase project. On iOS it reads its own client ID from
 * `GoogleService-Info.plist`. On Android, the Firebase project needs the
 * SHA-1 fingerprint of each signing key.
 */
async function googleCredential(): Promise<AuthCredential> {
  ensureGoogle();
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw cancelled();
    if (!response.data.idToken) throw new DataError('unknown', 'Google gave no ID token.');
    return GoogleAuthProvider.credential(response.data.idToken);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) throw cancelled();
    throw error;
  }
}

/**
 * Apple on iOS: the system sheet gives an identity token. Firebase checks
 * the nonce: Apple gets its SHA-256 hash, Firebase gets the raw value.
 */
async function appleSignIn(): Promise<{ credential: AuthCredential; authorizationCode: string | null }> {
  const rawNonce = toBase64Url(getRandomBytes(32));
  const nonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce,
    });
    if (!result.identityToken) throw new DataError('unknown', 'Apple gave no identity token.');
    const fullName = result.fullName
      ? { givenName: result.fullName.givenName, familyName: result.fullName.familyName }
      : undefined;
    const credential = new OAuthProvider(providerIdOf('apple')).credential({
      idToken: result.identityToken,
      rawNonce,
      fullName,
    });
    return { credential, authorizationCode: result.authorizationCode };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') throw cancelled();
    throw error;
  }
}

export async function nativeCredential(provider: LoginProvider): Promise<AuthCredential> {
  return provider === 'google' ? googleCredential() : (await appleSignIn()).credential;
}

/**
 * Apple on iOS, before an account delete: the App Store asks the app to
 * revoke the Apple tokens. A fresh Apple sign-in gives the credential (it
 * also counts as a recent login) and the authorization code that Firebase
 * uses for the revocation.
 */
export function appleForDelete(): Promise<{ credential: AuthCredential; authorizationCode: string | null }> {
  return appleSignIn();
}

/** Signs out of the Google SDK, so that the next login shows the account list again. */
export async function signOutOfProviders(): Promise<void> {
  try {
    ensureGoogle();
    await GoogleSignin.signOut();
  } catch {
    // The user can still choose an account on the next login.
  }
}
