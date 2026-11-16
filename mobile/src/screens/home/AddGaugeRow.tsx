import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { t } from '@/i18n';
import { Icon } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface AddGaugeRowProps {
  /** A name for the new gauge, for example the text of a search. */
  name?: string;
  /** A label for the new gauge, on the page of a label. */
  labelId?: string;
}

/**
 * "Add a gauge" at the end of a list, as in the old app. During a search it
 * reads `Add “text”` and fills in the name of the new gauge.
 */
export function AddGaugeRow({ name, labelId }: AddGaugeRowProps) {
  const { colors, spacing, typography } = useTheme();
  const router = useRouter();
  const trimmed = name?.trim() ?? '';
  const label = trimmed ? t.home.addNamed(trimmed) : t.home.addGauge;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() =>
        router.push({
          pathname: '/gauge/new',
          params: { ...(trimmed ? { name: trimmed } : {}), ...(labelId ? { label: labelId } : {}) },
        })
      }
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.sm,
          paddingHorizontal: spacing.page,
          paddingVertical: spacing.md,
          minHeight: 56,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
      testID="add-gauge"
    >
      <Icon name="plus" color={colors.accent} size={22} />
      <Text style={[typography.bodyStrong, styles.text, { color: colors.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flexShrink: 1,
  },
});
