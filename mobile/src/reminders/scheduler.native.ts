import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '../i18n';
import { androidPermissionState } from './permission';
import {
  type PendingReminder,
  type PermissionState,
  REMINDER_ID_PREFIX,
  REMINDER_KIND,
  type DevTools,
  type ReminderScheduler,
} from './types';

/** The Android channel of the reminders. The user can change its sound in the system settings. */
const CHANNEL_ID = 'reminders';

let channelReady: Promise<void> | null = null;

/**
 * Android 8 and later needs a channel for each notification. Android 13 and
 * later shows the permission prompt only after the app has a channel.
 */
function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: t.reminders.channel,
    importance: AndroidImportance.DEFAULT,
  })
    .then(() => undefined)
    .catch((error) => {
      channelReady = null;
      throw error;
    });
  return channelReady;
}

/** `afterRequest`: the response comes from a request, so the user answered a prompt (Android only). */
function toState(response: Notifications.NotificationPermissionsStatus, afterRequest = false): PermissionState {
  // On iOS, the docs say to read `ios.status`. A provisional permission
  // shows the notifications quietly in the Notification Center.
  const ios = response.ios?.status;
  if (ios !== undefined) {
    if (
      ios === IosAuthorizationStatus.AUTHORIZED ||
      ios === IosAuthorizationStatus.PROVISIONAL ||
      ios === IosAuthorizationStatus.EPHEMERAL
    ) {
      return 'granted';
    }
    return ios === IosAuthorizationStatus.DENIED ? 'denied' : 'undetermined';
  }
  // Android: "denied" also means "not asked yet". See `androidPermissionState`.
  return androidPermissionState(response, afterRequest);
}

/** The iOS and Android scheduler, with `expo-notifications`. */
export const scheduler: ReminderScheduler = {
  supported: true,

  getPermission: async () => toState(await Notifications.getPermissionsAsync()),

  requestPermission: async () => {
    await ensureChannel();
    return toState(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
      true,
    );
  },

  listPending: async () => {
    const requests = await Notifications.getAllScheduledNotificationsAsync();
    return requests
      .filter((request) => request.identifier.startsWith(REMINDER_ID_PREFIX))
      .map<PendingReminder>((request) => ({
        id: request.identifier,
        title: request.content.title ?? '',
        body: request.content.body ?? '',
      }));
  },

  schedule: async (reminder) => {
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: reminder.title,
        body: reminder.body,
        data: { kind: REMINDER_KIND, gaugeIds: reminder.gaugeIds },
        sound: 'default',
      },
      // On Android, the system can move the time a little. A daily summary
      // does not need an exact alarm, so the app does not ask for one.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.at, channelId: CHANNEL_ID },
    });
  },

  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};

function isReminder(notification: Notifications.Notification): boolean {
  return notification.request.content.data?.kind === REMINDER_KIND;
}

function gaugeIdsOf(notification: Notifications.Notification): string[] {
  const ids = notification.request.content.data?.gaugeIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Sets how a reminder shows while the app is open. `isStillDue` gets the
 * gauges that the reminder names. It returns `false` when the live data
 * shows that none of them is red now, for example because another member
 * marked them done. The app then hides the reminder.
 */
export function configureForeground(isStillDue: (gaugeIds: string[]) => boolean): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const show = !isReminder(notification) || isStillDue(gaugeIdsOf(notification));
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}

/** Calls `onTap` when the user taps a reminder while the app runs or is in the background. */
export function onReminderTap(onTap: () => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER && isReminder(response.notification)) {
      onTap();
    }
  });
  return () => subscription.remove();
}

/**
 * Development only: helpers for the test switch in `devTest.ts`. A
 * provisional permission needs no prompt on iOS, so a test can run in the
 * simulator with no tap.
 */
export const devTools: DevTools | null = {
  requestQuietPermission: async (): Promise<PermissionState> => {
    await ensureChannel();
    return toState(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowProvisional: true } }), true);
  },
  pending: async () =>
    (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
      id: request.identifier,
      title: request.content.title ?? '',
      body: request.content.body ?? '',
      trigger: JSON.stringify(request.trigger),
    })),
  presented: async () =>
    (await Notifications.getPresentedNotificationsAsync()).map((notification) => ({
      id: notification.request.identifier,
      title: notification.request.content.title ?? '',
      body: notification.request.content.body ?? '',
      // iOS gives seconds here, Android gives milliseconds.
      date: new Date(notification.date < 1e11 ? notification.date * 1000 : notification.date).toString(),
    })),
};
