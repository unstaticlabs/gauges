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
  /** The aggregated level, or `null` when no gauge counts: no active gauge, or only paused gauges. */
  level: number | null;
  /** The number of active gauges, the paused ones included. */
  count: number;
  /** The number of paused gauges in `count`. */
  pausedCount?: number;
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
  pausedCount = 0,
  members,
  muted = false,
  onPress,
  testID,
}: LabelCardProps) {
  const { colors, spacing, typography } = useTheme();
  const allPaused = count > 0 && pausedCount >= count;
  const countText = count === 0 ? t.labels.noGauges : t.labels.gaugeCount(count);
  // "All paused · 2 gauges", or "3 gauges · 1 paused".
  const caption = allPaused
    ? `${t.labels.allPaused} · ${countText}`
    : pausedCount > 0
      ? `${countText} · ${t.labels.pausedCount(pausedCount)}`
      : countText;
  const spokenLevel = allPaused ? `, ${t.labels.allPaused}` : level === null ? '' : `, ${displayLevel(level)}%`;
  const spokenPaused = !allPaused && pausedCount > 0 ? `, ${t.labels.pausedCount(pausedCount)}` : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${spokenLevel}, ${countText}${spokenPaused}`}
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
        {/* A label whose gauges are all paused shows a full grey bar, with no level. */}
        <Gauge level={allPaused ? 100 : (level ?? 0)} paused={allPaused} />
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {caption}
        </Text>
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
