import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { type Gauge, lastExecution, pausedSince } from '@/domain';
import { dateLocale, formatLastDone, formatShortDate, relativeFormatter, t } from '@/i18n';
import { useHomeView } from '@/state';
import { Icon } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { GaugeRow } from './GaugeRow';
import { useGaugeActions } from './useGaugeActions';
import { useMarkDone } from './useMarkDone';

export interface GaugeListProps {
  /** The rows in the order of the list. The paused gauges are last (see `compareRated`). */
  rows: readonly { gauge: Gauge; level: number }[];
  now: number;
  /**
   * `true` on the home list only: until the first swipe, a line above the
   * list explains the swipe, and the first row shows it.
   */
  hint?: boolean;
}

/** The first row opens a little one time in each app start, to show the swipe. */
let peekPlayed = false;

/** The second line of a row: "Done … ago", or "Paused since …" for a paused gauge. */
function rowText(gauge: Gauge, now: number): string {
  const since = pausedSince(gauge);
  if (since !== null) return t.home.pausedSince(formatShortDate(since, dateLocale, now));
  return formatLastDone(lastExecution(gauge.executions)?.at ?? null, now, t, relativeFormatter);
}

/**
 * The rows of gauges as one flat list with hairlines between the rows, as
 * in the old app. A swipe to the right marks a gauge done. A swipe to the
 * left shows Edit, Archive, and Delete. With `hint`, the list explains the
 * swipe until the first swipe. The paused gauges come last, under the
 * heading "Paused". The hint never plays on a paused row.
 *
 * Each row gets the level as a whole number and the last execution as text,
 * so that the clock of the app renders a row again only when its text or
 * its bar changes.
 */
export function GaugeList({ rows, now, hint = false }: GaugeListProps) {
  const { colors, spacing, typography } = useTheme();
  const markDone = useMarkDone();
  const actions = useGaugeActions();
  const { swipeLearned, learnSwipe } = useHomeView();
  const paused = rows.map(({ gauge }) => pausedSince(gauge) !== null);
  const firstActive = paused.indexOf(false);
  const showHint = hint && swipeLearned === false && firstActive !== -1;
  const [peekId] = useState(() => {
    if (peekPlayed || !showHint) return null;
    peekPlayed = true;
    return rows[firstActive]?.gauge.id ?? null;
  });

  return (
    <View>
      {showHint ? (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(200)}
          style={[styles.hint, { gap: spacing.sm, paddingHorizontal: spacing.page, paddingBottom: spacing.sm }]}
          testID="swipe-hint"
        >
          <Icon name="arrowRight" color={colors.textMuted} size={16} />
          <Text style={[typography.caption, styles.grow, { color: colors.textMuted }]}>{t.home.swipeHint}</Text>
        </Animated.View>
      ) : null}
      {rows.map(({ gauge, level }, index) => (
        // The move to a new place after "Done" is the only animation of a
        // row. There is no fade in: a list of 35 rows that all fade in at
        // the start of the app is slow on Android.
        <Animated.View key={gauge.id} layout={LinearTransition.duration(380)}>
          {paused[index] && !paused[index - 1] ? (
            <Text
              accessibilityRole="header"
              style={[
                typography.captionStrong,
                styles.heading,
                {
                  color: colors.textMuted,
                  borderTopColor: index > 0 ? colors.border : 'transparent',
                  paddingHorizontal: spacing.page,
                  paddingTop: index > 0 ? spacing.lg : spacing.xs,
                  paddingBottom: spacing.xs,
                },
              ]}
              testID="paused-heading"
            >
              {t.home.pausedSection}
            </Text>
          ) : index > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: spacing.page }]} />
          ) : null}
          <GaugeRow
            gauge={gauge}
            level={Math.round(level)}
            lastText={rowText(gauge, now)}
            paused={paused[index]}
            onDone={markDone}
            actions={actions}
            onSwiped={swipeLearned === false ? learnSwipe : undefined}
            peek={gauge.id === peekId}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grow: {
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  heading: {
    borderTopWidth: StyleSheet.hairlineWidth,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
