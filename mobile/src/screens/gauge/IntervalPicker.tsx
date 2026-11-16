import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { REPEAT_DAYS_MAX } from '@/data';
import { t } from '@/i18n';
import { Button, Segmented, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { INTERVAL_PRESETS, isPreset, parseDays } from './form';

export interface IntervalPickerProps {
  /** `null` when the free number is not valid. */
  value: number | null;
  onChange: (days: number | null) => void;
  /** `true` after the user tried to save, to show the error. */
  showError: boolean;
}

/** Quick choices for common intervals, in days, and a free number of days. */
export function IntervalPicker({ value, onChange, showError }: IntervalPickerProps) {
  const { spacing } = useTheme();
  const [custom, setCustom] = useState(value !== null && !isPreset(value));
  const [text, setText] = useState(value !== null && !isPreset(value) ? String(value) : '');
  // Focus the field only after a press on "Other". A gauge that opens with a
  // free number shows the field with no keyboard.
  const [focusField, setFocusField] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <Segmented
        options={INTERVAL_PRESETS.map((days) => ({
          value: days,
          label: String(days),
          accessibilityLabel: t.time.every(days),
          testID: `interval-${days}`,
        }))}
        value={custom ? null : value}
        onChange={(days) => {
          setCustom(false);
          onChange(days);
        }}
        accessibilityLabel={t.gauge.interval}
      />
      {custom ? (
        <TextField
          value={text}
          onChangeText={(next) => {
            setText(next);
            onChange(parseDays(next, REPEAT_DAYS_MAX));
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={t.gauge.intervalDaysInput}
          accessibilityLabel={t.gauge.intervalDaysInput}
          maxLength={4}
          autoFocus={focusField}
          testID="interval-input"
          error={showError && value === null ? t.gauge.intervalInvalid(REPEAT_DAYS_MAX) : null}
        />
      ) : (
        <Button
          label={t.gauge.intervalOther}
          variant="plain"
          onPress={() => {
            setCustom(true);
            setFocusField(true);
            onChange(parseDays(text, REPEAT_DAYS_MAX));
          }}
          style={styles.start}
          testID="interval-other"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  start: {
    alignSelf: 'flex-start',
  },
});
