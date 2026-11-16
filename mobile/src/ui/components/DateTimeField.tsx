import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { dateLocale, formatDateTime } from '@/i18n';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import { clampToNow, type DateTimeFieldProps, MAX_SLACK_MS } from './dateTimeShared';

export type { DateTimeFieldProps } from './dateTimeShared';



/**
 * A date and time input. iOS shows the compact system picker. Android opens
 * the system date dialog, then the time dialog. The web version is in
 * `DateTimeField.web.tsx`.
 */
export function DateTimeField(props: DateTimeFieldProps) {
  return Platform.OS === 'android' ? <AndroidField {...props} /> : <IosField {...props} />;
}

function IosField({ value, onChange, max, accessibilityLabel, testID }: DateTimeFieldProps) {
  const theme = useTheme();
  return (
    <DateTimePicker
      testID={testID}
      value={new Date(value)}
      mode="datetime"
      display="compact"
      maximumDate={new Date(max + MAX_SLACK_MS)}
      accentColor={theme.colors.accent}
      themeVariant={theme.scheme}
      accessibilityLabel={accessibilityLabel}
      onValueChange={(_, date) => onChange(clampToNow(date.getTime()))}
      style={styles.ios}
    />
  );
}

function AndroidField({ value, onChange, max, accessibilityLabel, testID }: DateTimeFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();

  const open = () => {
    DateTimePickerAndroid.open({
      value: new Date(value),
      mode: 'date',
      maximumDate: new Date(max + MAX_SLACK_MS),
      onValueChange: (_, day) => {
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          onValueChange: (__, time) => onChange(clampToNow(time.getTime())),
        });
      },
    });
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: formatDateTime(value, dateLocale, max) }}
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
      <Text style={[typography.body, { color: colors.text }]}>{formatDateTime(value, dateLocale, max)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ios: {
    alignSelf: 'flex-start',
    minHeight: TOUCH_TARGET,
  },
  android: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
