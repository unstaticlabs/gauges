import Constants from 'expo-constants';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { dateLocale, formatReminderWhen, reminderNames, t } from '@/i18n';
import { REMINDER_DAYS } from '@/reminders';
import { useNow, useReminders } from '@/state';
import { Button, SwitchRow, TimeField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { Section } from '../Section';

/**
 * Opens the notification settings of the app. Android opens the page of the
 * app notifications directly. iOS opens the settings page of the app, which
 * has the notifications.
 */
function openNotificationSettings(): void {
  const appPackage = Constants.expoConfig?.android?.package;
  if (Platform.OS === 'android' && appPackage) {
    Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: appPackage },
    ]).catch(() => void Linking.openSettings());
    return;
  }
  void Linking.openSettings();
}

/**
 * The reminder settings: on or off, the time, and the next reminder. The
 * website has no reminders, so it shows one line that says where they are.
 */
export function RemindersSection() {
  const { colors, spacing, typography } = useTheme();
  const now = useNow();
  const { supported, loaded, settings, permission, next, setEnabled, setTime } = useReminders();

  if (!supported) {
    return (
      <Section title={t.reminders.section}>
        <Text style={[typography.callout, { color: colors.textMuted }]} testID="reminders-web">
          {t.reminders.web}
        </Text>
      </Section>
    );
  }

  return (
    <Section title={t.reminders.section}>
      <SwitchRow
        label={t.reminders.toggle}
        help={t.reminders.toggleHelp}
        value={settings.enabled}
        onValueChange={(value) => void setEnabled(value)}
        disabled={!loaded}
        testID="reminders-toggle"
      />
      {settings.enabled ? (
        <>
          <View
            style={[
              styles.timeRow,
              { gap: spacing.md, borderTopColor: colors.border, paddingTop: spacing.sm },
            ]}
          >
            <Text style={[typography.body, styles.timeLabel, { color: colors.text }]}>{t.reminders.time}</Text>
            <TimeField
              value={settings.time}
              onChange={setTime}
              accessibilityLabel={t.reminders.timeLabel}
              testID="reminders-time"
            />
          </View>
          {permission === 'denied' ? (
            <View style={{ gap: spacing.sm }}>
              <Text
                style={[typography.callout, { color: colors.danger }]}
                accessibilityLiveRegion="polite"
                testID="reminders-denied"
              >
                {t.reminders.denied}
              </Text>
              <Button
                label={t.reminders.openSettings}
                variant="secondary"
                onPress={openNotificationSettings}
                testID="reminders-open-settings"
              />
            </View>
          ) : permission === 'undetermined' ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={[typography.callout, { color: colors.textMuted }]} testID="reminders-not-asked">
                {t.reminders.notAsked}
              </Text>
              <Button
                label={t.reminders.allow}
                variant="secondary"
                onPress={() => void setEnabled(true)}
                testID="reminders-allow"
              />
            </View>
          ) : next !== undefined ? (
            <Text style={[typography.callout, { color: colors.textMuted }]} testID="reminders-next">
              {next
                ? t.reminders.next(formatReminderWhen(next.at, now, t, dateLocale), reminderNames(next.gaugeNames, t))
                : t.reminders.nonePlanned(REMINDER_DAYS)}
            </Text>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timeLabel: {
    flex: 1,
  },
});
