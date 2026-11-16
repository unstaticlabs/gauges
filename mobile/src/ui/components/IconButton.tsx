import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  /** The label that screen readers read. Required, because the button has no text. */
  label: string;
  onPress?: () => void;
  /** `filled` uses the accent color as background. */
  variant?: 'plain' | 'filled' | 'tinted';
  color?: string;
  disabled?: boolean;
  /** Shows the button as a toggle that is on. */
  selected?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** A round icon button with a touch target of 44 points. */
export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  color,
  disabled = false,
  selected,
  accessibilityHint,
  testID,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const background = selected
    ? colors.accentSoft
    : { plain: 'transparent', filled: colors.accent, tinted: colors.field }[variant];
  const foreground = selected ? colors.accent : color ?? (variant === 'filled' ? colors.textOnAccent : colors.text);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
        style,
      ]}
    >
      <Icon name={icon} color={foreground} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
