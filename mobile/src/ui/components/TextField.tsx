import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'ref'> {
  label?: string;
  help?: string;
  error?: string | null;
}

/** A text input with an optional label, help text, and error text. */
export function TextField({ label, help, error, accessibilityLabel, ...input }: TextFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text style={[typography.section, { color: colors.text }]} aria-hidden>
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={colors.textMuted}
        style={[
          typography.body,
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.field,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            borderColor: error ? colors.danger : 'transparent',
          },
        ]}
        {...input}
      />
      {error ? (
        <Text style={[typography.caption, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : help ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{help}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH_TARGET,
    paddingVertical: 10,
    borderWidth: 1.5,
  },
});
