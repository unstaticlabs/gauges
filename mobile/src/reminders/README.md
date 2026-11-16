# Reminders

The phone shows one daily summary notification at a time that the user
picks, only on days when one gauge or more is red at that time. The phone
schedules the notifications itself. There is no push server.

Example: title "3 gauges are low", body "Change the sheets, Water the
plants, and 1 more".

## Files

| File | What it does |
|---|---|
| `types.ts` | The `ReminderScheduler` interface and the reminder types. |
| `scheduler.native.ts` | iOS and Android, with `expo-notifications`. Also the foreground rule and the tap. |
| `scheduler.web.ts` | Does nothing. The website has no reminders. |
| `scheduler.ts` | Lets TypeScript resolve `./scheduler`. Metro picks the platform file. |
| `sync.ts` | The platform-neutral sync: plan, reconcile, debounce, and one sync at a time. |
| `settings.ts` | The settings on the device: on or off, and the time. |
| `permission.ts` | Reads the Android permission answer, and decides when the app asks the first time. |
| `devTest.ts` | A test switch for development builds only (see below). |

`src/state/RemindersProvider.tsx` connects the sync to the app state. The
text comes from `src/i18n/reminders.ts` and `t.reminders`.

## How a sync works

1. `planReminders` (in `src/domain`) gives the days in the next 14 days
   that have a red gauge at the reminder time. It leaves out archived
   gauges, gauges that the user muted, and gauges of other users.
2. Each day becomes one request with the ID `gauges.reminder.<time>`.
3. `reconcile` reads the pending requests of the app (only the IDs with
   that prefix). It cancels each one that is not in the plan or has another
   text, and schedules each one that is missing.

A second sync with the same data changes nothing. The app keeps 14 requests
at most. iOS keeps 64 for each app.

## When a sync runs

- After a change of the gauges, a mute, the settings, the user, or the
  permission. The sync waits 800 ms after the last change.
- When a reminder time passes. The plan then moves one day forward.
- Each time the app returns to the foreground. The app also reads the
  permission again, because the user can change it in the system settings.

All syncs go through one queue, so two syncs never run at the same time. A
sync always uses the newest data. These cases cancel all reminders at once,
with no wait:

- The user turns reminders off.
- The user logs out.
- The permission is missing or revoked.

While the gauges load, a sync keeps the pending reminders.

## The permission

Reminders are on by default, at 18:00. The app does not ask for the
permission at the first start, on an empty app. It asks one time, the first
time the user has an active gauge: after the first new gauge, or after a
login that brings gauges back (`shouldAskOnFirstGauge`). The device
remembers the ask (`STORAGE_KEYS.reminderAsked`).

- If the user allows notifications, the reminders start.
- If the user refuses, the app turns reminders off, and nothing asks
  again. The user can turn the switch on later: the app then shows the
  prompt again if the system still allows it.
- If the system shows no prompt anymore, the switch stays on, and the
  section explains how to allow notifications, with a button that opens the
  notification settings of the app. On Android, it opens the page of the
  app notifications directly. The reminders start when the user allows
  them and returns to the app.

On Android 13 and later, the app makes the channel "Daily reminder" first,
because Android shows the prompt only after the app has a channel.

Android has no "not asked yet" state. Before the first prompt,
`getPermissionsAsync` gives `status: 'denied'` with `canAskAgain: true`.
The app read that as a refusal, so it never showed the prompt.
`androidPermissionState` reads it as `undetermined`. After a request, "not
granted" is `denied`, because the user answered the prompt.

## Delivery

- iOS: `expo-notifications` turns the date into a time interval. The
  notification comes at the time.
- Android: the app does not ask for exact alarms (`SCHEDULE_EXACT_ALARM`),
  because a daily summary does not need one, and Google Play restricts the
  permission. Android can move the time a little.
- While the app is open, a reminder shows only if one of its gauges is still
  red in the live data.
- A tap on a reminder opens the app on the home screen.

## Known limit: shared gauges

The text of a reminder is fixed when the phone schedules it. If another
member marks a shared gauge done and you do not open the app, your next
reminder can still name that gauge. Each start of the app, each return to
the foreground, and each live change while the app runs corrects the plan.

### Why there is no background task

SDK 58 has `expo-background-task` (BGTaskScheduler on iOS, WorkManager on
Android). The app does not use it:

- A sync from the local Firestore cache gives the same plan: the cache
  changes only while the app runs, and the plan already covers 14 days.
  A useful task must read from the server in a headless start, with the
  auth state restored. This adds parts that can fail.
- On iOS, the system picks the time of the task, often at night while the
  phone charges, and stops all tasks after the user swipes the app away.
  The simulator cannot run the task, so you can test it only on a device.
- It adds a native module and the `processing` background mode to the app.

The gain is small and not reliable, so the app does not have it. Silent
push is out of scope, because it needs a server.

## Test on a simulator with no tap

The development build has a test switch. Start Metro with the emulator and
the switch:

```sh
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 EXPO_PUBLIC_REMINDER_TEST_MINUTES=3 npx expo start --dev-client --clear
```

After the sign-in, the app asks for a quiet (provisional) permission. iOS
gives it with no prompt and puts the notifications in the Notification
Center with no banner. The app turns reminders on at a time 3 minutes or
more ahead, and Metro shows lines that start with `[reminders test]`: the
pending requests after each sync, and the delivered notifications 30
seconds after the reminder time. A release build ignores the variable,
because `__DEV__` is `false`.

On the simulator, the Keychain keeps the Firebase user after you delete the
app. To start with a new user, run `xcrun simctl keychain booted reset`
before you install the app again.
