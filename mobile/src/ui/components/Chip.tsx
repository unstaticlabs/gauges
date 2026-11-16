import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';
import { Icon, type IconName } from './Icon';

export interface ChipProps {
  label: string;
  /** `selected` is filled with the accent tint. `suggestion` has a dashed look. */
  variant?: 'selected' | 'suggestion';
  icon?: IconName;
  /** An emoji before the text, for example the emoji of a label. It replaces `icon`. */
  emoji?: string;
  /** Called when the user presses the chip. */
  onPress?: () => void;
  /** Shows a small close mark. Called when the user presses the chip. */
  onRemove?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** A small rounded tag, for example a label on a gauge. The touch target is 44 points high. */
export function Chip({
  label,
  variant = 'selected',
  icon,
  emoji,
  onPress,
  onRemove,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ChipProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const selected = variant === 'selected';
  const foreground = selected ? colors.accent : colors.text;
  const press = onRemove ?? onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      onPress={press}
      disabled={!press}
      testID={testID}
      style={({ pressed }) => [styles.target, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.chip,
          {
            backgroundColor: selected ? colors.accentSoft : colors.background,
            borderColor: selected ? colors.accentSoft : colors.border,
            borderRadius: radius.full,
            paddingLeft: spacing.md,
            paddingRight: onRemove ? spacing.sm : spacing.md,
            gap: spacing.xs,
          },
        ]}
      >
        {emoji ? (
          <Text style={styles.emoji} aria-hidden>
            {emoji}
          </Text>
        ) : icon ? (
          <Icon name={icon} color={foreground} size={14} strokeWidth={2.4} />
        ) : null}
        <Text style={[typography.callout, styles.text, { color: foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {onRemove ? <Icon name="close" color={foreground} size={14} strokeWidth={2.4} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    borderWidth: 1,
    maxWidth: '100%',
  },
  emoji: {
    fontSize: 15,
    lineHeight: 20,
  },
  text: {
    fontFamily: fonts.medium,
    flexShrink: 1,
  },
});
