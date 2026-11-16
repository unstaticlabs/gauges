import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';

export interface SegmentedOption<T> {
  value: T;
  label: string;
  /** The text that screen readers read, when `label` is too short, for example a number. */
  accessibilityLabel?: string;
  testID?: string;
}

export interface SegmentedProps<T> {
  options: readonly SegmentedOption<T>[];
  /** The selected value, or `null` when no option is selected. */
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** A row of choices in one rounded control. The selected choice is raised. */
export function Segmented<T extends string | number>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View
      style={[styles.row, { backgroundColor: colors.field, borderRadius: radius.md, padding: spacing.xxs }]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            testID={option.testID}
            style={({ pressed }) => [
              styles.segment,
              {
                borderRadius: radius.sm + 2,
                paddingHorizontal: spacing.xs,
                backgroundColor: selected ? colors.background : 'transparent',
                opacity: pressed ? 0.6 : 1,
              },
              selected && styles.selectedShadow,
            ]}
          >
            <Text
              style={[typography.bodyStrong, styles.text, { color: selected ? colors.text : colors.textMuted }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
  selectedShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
