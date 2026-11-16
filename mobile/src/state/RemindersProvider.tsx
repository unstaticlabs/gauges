import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { activeGauges, type Gauge, planReminders, type PlannedReminder, reminderTimes, type TimeOfDay } from '@/domain';
import { t } from '@/i18n';
import {
  configureForeground,
  createReminderSync,
  DEFAULT_REMINDER_SETTINGS,
  isStillDue,
  logPending,
  onReminderTap,
  parseReminderSettings,
  type PermissionState,
  REMINDER_DAYS,
  REMINDER_TEST_MINUTES,
  type ReminderSettings,
  type ReminderSync,
  scheduler,
  shouldAskOnFirstGauge,
  startReminderTest,
} from '@/reminders';

import { useGauges } from './DataProvider';
import { useNow } from './NowProvider';
import { useSession } from './SessionProvider';
import { readStored, STORAGE_KEYS, writeStored } from './storage';

export interface Reminders {
  /** `false` on the web. */
  supported: boolean;
  /** `false` until the settings are read from the device. */
  loaded: boolean;
  settings: ReminderSettings;
  /** `null` until the app knows it. */
  permission: PermissionState | null;
  /**
   * The next reminder for the live data, `null` when nothing turns red in
   * the next days, and `undefined` while the gauges load.
   */
  next: PlannedReminder | null | undefined;
  /**
   * Turns reminders on or off. A switch to on asks for the permission if the
   * system can still show the prompt. A refusal turns reminders off.
   */
  setEnabled: (enabled: boolean) => Promise<void>;
  setTime: (time: TimeOfDay) => void;
}

/** The wait before the first prompt, so that it does not show over a form that closes. */
const FIRST_ASK_DELAY_MS = 900;

const RemindersContext = createContext<Reminders>({
  supported: false,
  loaded: false,
  settings: DEFAULT_REMINDER_SETTINGS,
  permission: null,
  next: undefined,
  setEnabled: async () => {},
  setTime: () => {},
});

/**
 * Keeps the pending reminders of the phone equal to the plan for the live
 * gauges. A sync runs after each change of the gauges, the settings, the
 * user, or the permission, and when the next reminder time passes. It also
 * runs each time the app returns to the foreground. See `src/reminders/README.md`.
 */
export function RemindersProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const gauges = useGauges();
  const now = useNow();
  const { supported } = scheduler;
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [asked, setAsked] = useState<boolean | null>(null);
  const syncRef = useRef<ReminderSync | null>(null);

  const uid = user?.uid ?? null;
  const gaugeList: readonly Gauge[] | null = gauges.status === 'ready' ? gauges.items : null;

  // The foreground check and the tap read the newest values from here.
  const live = useRef({ gauges: gaugeList, uid });
  useEffect(() => {
    live.current = { gauges: gaugeList, uid };
  }, [gaugeList, uid]);

  const save = useCallback((update: (previous: ReminderSettings) => ReminderSettings) => {
    setSettings((previous) => {
      const next = update(previous);
      void writeStored(STORAGE_KEYS.reminders, next);
      return next;
    });
  }, []);

  const refreshPermission = useCallback(() => {
    scheduler
      .getPermission()
      .then(setPermission)
      .catch(() => setPermission(null));
  }, []);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void readStored<unknown>(STORAGE_KEYS.reminders).then((stored) => {
      if (!active) return;
      setSettings(parseReminderSettings(stored));
      setLoaded(true);
    });
    void readStored<boolean>(STORAGE_KEYS.reminderAsked).then((stored) => {
      if (active) setAsked(stored === true);
    });
    refreshPermission();
    const sync = createReminderSync({
      scheduler,
      strings: t,
      onResult: () => logPending(),
      onError: (error) => console.warn('Reminder sync failed', error),
    });
    syncRef.current = sync;
    configureForeground((ids) => isStillDue(live.current.gauges, live.current.uid, ids, Date.now()));
    const stopTap = onReminderTap(() => {
      // A tap opens the app on the home screen.
      if (router.canDismiss()) router.dismissAll();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      // The user can change the permission in the system settings.
      refreshPermission();
      void sync.flush();
    });
    return () => {
      active = false;
      sync.dispose();
      syncRef.current = null;
      stopTap();
      subscription.remove();
    };
  }, [supported, refreshPermission]);

  // Development only: see `src/reminders/devTest.ts`.
  const testStarted = useRef(false);
  useEffect(() => {
    if (REMINDER_TEST_MINUTES <= 0 || !loaded || uid === null || testStarted.current) return;
    testStarted.current = true;
    void startReminderTest(Date.now()).then((test) => {
      refreshPermission();
      if (test) save(() => test);
    });
  }, [loaded, uid, save, refreshPermission]);

  // The next reminder time changes only when a reminder time passes. Then
  // the plan moves one day forward.
  const nextTime = reminderTimes(now, settings.time, 1)[0];

  useEffect(() => {
    const sync = syncRef.current;
    if (!supported || !loaded || sync === null) return;
    sync.request({ enabled: settings.enabled, userId: uid, gauges: gaugeList, timeOfDay: settings.time });
    // A log-out and a switch to off cancel the reminders at once.
    if (!settings.enabled || uid === null) void sync.flush();
  }, [supported, loaded, settings, uid, gaugeList, nextTime, permission]);

  const next = useMemo(() => {
    if (uid === null || gaugeList === null) return undefined;
    return planReminders({ gauges: gaugeList, userId: uid, now, timeOfDay: settings.time, days: REMINDER_DAYS })[0] ?? null;
  }, [uid, gaugeList, now, settings.time]);

  /** Shows the system prompt. A refusal turns reminders off, so that nothing nags. */
  const ask = useCallback(async (): Promise<PermissionState> => {
    setAsked(true);
    void writeStored(STORAGE_KEYS.reminderAsked, true);
    const state = await scheduler.requestPermission();
    setPermission(state);
    if (state !== 'granted') save((previous) => ({ ...previous, enabled: false }));
    return state;
  }, [save]);

  // The first time the user has a gauge, ask one time (see `shouldAskOnFirstGauge`).
  const activeCount = useMemo(() => (gaugeList ? activeGauges(gaugeList).length : 0), [gaugeList]);
  const askOnFirstGauge = shouldAskOnFirstGauge({
    supported,
    loaded,
    enabled: settings.enabled,
    permission,
    asked,
    activeGauges: activeCount,
  });
  useEffect(() => {
    if (!askOnFirstGauge) return;
    const timer = setTimeout(() => void ask(), FIRST_ASK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [askOnFirstGauge, ask]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const state = await scheduler.getPermission();
        setPermission(state);
        if (state === 'undetermined' && (await ask()) !== 'granted') return;
      }
      // When the system shows no prompt anymore, the switch keeps the
      // choice. The section then explains how to allow notifications, and
      // the reminders start when the user allows them.
      save((previous) => ({ ...previous, enabled }));
    },
    [ask, save],
  );

  const setTime = useCallback((time: TimeOfDay) => save((previous) => ({ ...previous, time })), [save]);

  const value = useMemo<Reminders>(
    () => ({ supported, loaded, settings, permission, next, setEnabled, setTime }),
    [supported, loaded, settings, permission, next, setEnabled, setTime],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): Reminders {
  return useContext(RemindersContext);
}
