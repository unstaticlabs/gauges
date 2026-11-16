import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useNow } from '@/state';
import { Button, DateTimeField, Sheet } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface ExecutionSheetProps {
  visible: boolean;
  title: string;
  /** The start value, in epoch milliseconds. */
  initial: number;
  onCancel: () => void;
  /** Resolves when the write is done. Rejects with the error text to show. */
  onSave: (at: number) => Promise<void>;
  /** Removes the execution. The sheet shows the button only when this is set. */
  onRemove?: () => void;
}

/** A sheet to pick the date and time of one execution. It refuses a time in the future. */
export function ExecutionSheet({ visible, title, initial, onCancel, onSave, onRemove }: ExecutionSheetProps) {
  const { colors, spacing, typography } = useTheme();
  const now = useNow();
  // The parent gives a new `key` for each opening, so the state starts fresh.
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (value > Date.now()) {
      setError(t.gauge.futureDate);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={title} onClose={onCancel}>
      <DateTimeField
        value={value}
        onChange={setValue}
        max={now}
        accessibilityLabel={t.gauge.executionDate}
        testID="execution-date"
      />
      {error ? (
        <Text style={[typography.callout, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={[styles.actions, { gap: spacing.sm }]}>
        <Button label={t.common.cancel} variant="secondary" onPress={onCancel} style={styles.action} />
        <Button label={t.common.save} onPress={save} busy={busy} style={styles.action} testID="execution-save" />
      </View>
      {onRemove ? (
        <Button
          label={t.gauge.removeExecution}
          variant="danger"
          onPress={onRemove}
          style={styles.start}
          testID="execution-remove"
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
  start: {
    alignSelf: 'flex-start',
  },
});
