import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { dateLocale, formatClockTime } from '@/i18n';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import { timeFromDate, type TimeFieldProps } from './timeShared';

export type { TimeFieldProps } from './timeShared';

/**
 * A time of day input, the time-only partner of `DateTimeField`. iOS shows
 * the compact system picker. Android opens the system time dialog. The web
 * version is in `TimeField.web.tsx`.
 */
export function TimeField(props: TimeFieldProps) {
  return Platform.OS === 'android' ? <AndroidField {...props} /> : <IosField {...props} />;
}

function toDate({ hour, minute }: TimeFieldProps['value']): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function IosField({ value, onChange, accessibilityLabel, testID }: TimeFieldProps) {
  const theme = useTheme();
  return (
    <DateTimePicker
      testID={testID}
      value={toDate(value)}
      mode="time"
      display="compact"
      accentColor={theme.colors.accent}
      themeVariant={theme.scheme}
      accessibilityLabel={accessibilityLabel}
      onValueChange={(_, date) => onChange(timeFromDate(date))}
      style={styles.ios}
    />
  );
}

function AndroidField({ value, onChange, accessibilityLabel, testID }: TimeFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const text = formatClockTime(toDate(value).getTime(), dateLocale);

  const open = () => {
    DateTimePickerAndroid.open({
      value: toDate(value),
      mode: 'time',
      onValueChange: (_, date) => onChange(timeFromDate(date)),
    });
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text }}
      onPress={open}
      style={({ pressed }) => [
        styles.android,
        {
          backgroundColor: colors.field,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typography.body, { color: colors.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ios: {
    minHeight: TOUCH_TARGET,
  },
  android: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
});
