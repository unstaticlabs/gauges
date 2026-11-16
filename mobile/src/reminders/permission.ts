import type { PermissionState } from './types';

/**
 * Reads the Android answer of `expo-notifications`.
 *
 * Android 13 and later has no "not asked yet" state. Before the first
 * prompt, `getPermissionsAsync` gives `status: 'denied'`, because the
 * notifications are off until the user allows them, with `canAskAgain:
 * true`. The app read that as a refusal, so it never showed the prompt. So:
 *
 * - Before a request, "not granted, but the app can ask" is `undetermined`.
 * - After a request, "not granted" is `denied`: the user answered the prompt.
 *   Android lets the app ask again one time, but the app does not nag.
 * - "Not granted, and the app cannot ask" is `denied`. The system shows no
 *   prompt anymore, so the user must turn notifications on in the settings.
 */
export function androidPermissionState(
  response: { granted: boolean; canAskAgain: boolean },
  afterRequest: boolean,
): PermissionState {
  if (response.granted) return 'granted';
  if (afterRequest) return 'denied';
  return response.canAskAgain ? 'undetermined' : 'denied';
}

export interface FirstGaugeAskInput {
  /** `false` on the web. */
  supported: boolean;
  /** `true` after the settings and the permission are read from the device. */
  loaded: boolean;
  enabled: boolean;
  permission: PermissionState | null;
  /** `true` after the app showed the prompt one time on this device. */
  asked: boolean | null;
  /** The number of active gauges of the user. */
  activeGauges: number;
}

/**
 * Reminders are on by default, but the app does not ask for the permission
 * at the first start, on an empty app. It asks one time, the first time the
 * user has a gauge: after the first new gauge, or after a login that brings
 * gauges back.
 */
export function shouldAskOnFirstGauge(input: FirstGaugeAskInput): boolean {
  return (
    input.supported &&
    input.loaded &&
    input.enabled &&
    input.permission === 'undetermined' &&
    input.asked === false &&
    input.activeGauges > 0
  );
}
