import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** A short success feedback on iOS and Android. It does nothing on the web. */
export function successHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** The pause between the two pulses of the done feedback on Android. */
const ANDROID_SECOND_PULSE_MS = 110;

/**
 * The feedback when the user marks a gauge done. On iOS it is the system
 * success pattern. On Android, the success pattern of `expo-haptics` uses a
 * low strength (50 and 60 of 255), so a user hardly feels it. Android gets
 * the system "confirm" effect, then a heavy pulse: two clear taps.
 */
export function doneHaptic(): void {
  if (Platform.OS === 'ios') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } else if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, ANDROID_SECOND_PULSE_MS);
  }
}

/** A light tap feedback, for example when a swipe passes the threshold. */
export function selectionHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}
