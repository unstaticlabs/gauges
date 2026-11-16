import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { displayLevel, type UserId } from '@/domain';
import { t } from '@/i18n';
import { Gauge, Icon } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { MemberAvatars } from './MemberAvatars';

export interface LabelCardProps {
  name: string;
  emoji: string;
  /** The aggregated level, or `null` when the label has no active gauge. */
  level: number | null;
  count: number;
  /** The members in avatar order. The row shows avatars only for more than one. */
  members: readonly UserId[];
  /** The row for gauges with no label has a muted name. */
  muted?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * One label on the home screen, as the need bars of a Sim: the emoji of the
 * label, its name, one bar for all its gauges, and the members.
 */
export const LabelCard = memo(function LabelCard({
  name,
  emoji,
  level,
  count,
  members,
  muted = false,
  onPress,
  testID,
}: LabelCardProps) {
  const { colors, spacing, typography } = useTheme();
  const countText = count === 0 ? t.labels.noGauges : t.labels.gaugeCount(count);
  const spokenLevel = level === null ? '' : `, ${displayLevel(level)}%`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${spokenLevel}, ${countText}`}
      accessibilityHint={t.labels.cardHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.field : colors.background,
          paddingHorizontal: spacing.page,
          paddingVertical: spacing.md,
          gap: spacing.md,
        },
      ]}
    >
      <Text style={styles.emoji} aria-hidden>
        {emoji}
      </Text>
      <View style={[styles.main, { gap: spacing.xs }]}>
        <View style={[styles.line, { gap: spacing.sm }]}>
          <Text
            style={[typography.name, styles.grow, { color: muted ? colors.textMuted : colors.text }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          {members.length > 1 ? <MemberAvatars ids={members} size={22} ringColor={colors.background} /> : null}
          <Icon name="chevronRight" color={colors.textMuted} size={18} />
        </View>
        <Gauge level={level ?? 0} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>{countText}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 30,
    lineHeight: 38,
    width: 40,
    textAlign: 'center',
  },
  main: {
    flex: 1,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grow: {
    flex: 1,
  },
});
