import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';

export interface SwitchRowProps {
  label: string;
  /** A short line below the label. */
  help?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** A label, an optional help line, and an on/off switch at the end of the row. */
export function SwitchRow({ label, help, value, onValueChange, disabled = false, testID }: SwitchRowProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View style={styles.text}>
        <Text style={[typography.body, { color: colors.text }]}>{label}</Text>
        {help ? <Text style={[typography.caption, { color: colors.textMuted }]}>{help}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={help}
        trackColor={{ true: colors.accent, false: colors.field }}
        // iOS draws a white thumb by default. Android needs a color for each state.
        thumbColor={Platform.OS === 'android' ? (value ? colors.textOnAccent : '#FFFFFF') : undefined}
        ios_backgroundColor={colors.field}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
  },
  text: {
    flex: 1,
  },
});
