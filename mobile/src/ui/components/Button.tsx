import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { Icon, type IconName } from './Icon';

/** The minimum size of a touch target, in points. */
export const TOUCH_TARGET = 44;

export type ButtonVariant = 'primary' | 'success' | 'secondary' | 'danger' | 'plain';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A text button. `primary` is filled with the accent color, `success` with
 * the green of a full gauge, for "Done". `plain` and
 * `danger` have no background, as the clear buttons of the old app.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  busy = false,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const background = {
    primary: colors.accent,
    success: colors.gauge.green,
    secondary: colors.field,
    danger: 'transparent',
    plain: 'transparent',
  }[variant];
  const foreground = {
    primary: colors.textOnAccent,
    success: colors.textOnGreen,
    secondary: colors.text,
    danger: colors.danger,
    plain: colors.accent,
  }[variant];
  const inactive = disabled || busy;
  // A disabled button is grey, so that it does not look like a pale accent.
  const textOnly = variant === 'plain' || variant === 'danger';
  const shownBackground = disabled && !textOnly ? colors.field : background;
  const shownForeground = disabled ? colors.textMuted : foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: shownBackground,
          borderRadius: radius.md,
          paddingHorizontal: textOnly ? spacing.sm : spacing.lg,
          opacity: disabled ? 0.7 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <View style={[styles.content, { gap: spacing.sm }]}>
        {busy ? (
          <ActivityIndicator color={shownForeground} />
        ) : icon ? (
          <Icon name={icon} color={shownForeground} size={20} />
        ) : null}
        <Text style={[typography.bodyStrong, { color: shownForeground }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
