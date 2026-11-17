import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import {
  aggregateLevels,
  countedRange,
  displayLevel,
  gaugeTone,
  LABEL_AGGREGATES,
  type LabelAggregate,
  previewPositions,
} from '@/domain';
import { t } from '@/i18n';
import { Gauge, Icon } from '@/ui/components';
import { useTheme } from '@/ui/theme';

/** The most bars that one drawing shows. */
const ROOM = 8;
/** The levels of the example for a label with fewer than two gauges. */
const SAMPLE_LEVELS = [12, 40, 66, 85, 96];

const W = 64;
const H = 40;
const GAP = 2;
/** The space above the bars, so that a full bar and the line stay inside. */
const TOP = 3;

interface Drawing {
  /** The levels of the drawn gauges, from low to high. */
  bars: { level: number; counted: boolean }[];
  /** The level of the label in this mode. */
  result: number;
}

function ModeDrawing({ bars, result }: Drawing) {
  const { colors } = useTheme();
  const n = bars.length;
  const width = (W - GAP * (n - 1)) / n;
  const yOf = (level: number) => H - (Math.max(0, Math.min(100, level)) / 100) * (H - TOP);
  const lineY = yOf(result);
  const lineColor = colors.gauge[gaugeTone(result)];
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} pointerEvents="none" aria-hidden>
      {bars.map((bar, i) => {
        const y = Math.min(yOf(bar.level), H - 2);
        return (
          <Rect
            key={i}
            x={i * (width + GAP)}
            y={y}
            width={width}
            height={H - y}
            rx={Math.min(2, width / 2)}
            fill={bar.counted ? colors.gauge[gaugeTone(bar.level)] : colors.textMuted}
            opacity={bar.counted ? 1 : 0.28}
          />
        );
      })}
      {/* The level of the label: a line with a halo, so that it shows on a bar of the same color. */}
      <Line x1={0} x2={W} y1={lineY} y2={lineY} stroke={colors.surfaceRaised} strokeWidth={4} />
      <Line x1={0} x2={W} y1={lineY} y2={lineY} stroke={lineColor} strokeWidth={2} strokeDasharray="4 2" />
    </Svg>
  );
}

export interface LevelModePickerProps {
  /** The levels of the gauges that count for the label (not archived, not paused), in any order. */
  levels: readonly number[];
  value: LabelAggregate;
  onChange: (mode: LabelAggregate) => void;
}

/**
 * The modes of a label level as a list. Each row draws the gauges of the
 * label from low to high, with the gauges that count in their color and
 * the others grey, and a line at the level that the mode gives. Then the
 * name, the level, a line of help, and the bar of the label in that mode.
 * A label with fewer than two gauges shows an example instead.
 */
export function LevelModePicker({ levels, value, onChange }: LevelModePickerProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const example = levels.length < 2;

  const { options, shown, total } = useMemo(() => {
    const sorted = [...(example ? SAMPLE_LEVELS : levels)].sort((a, b) => a - b);
    const positions = previewPositions(sorted.length, ROOM);
    return {
      shown: positions.length,
      total: sorted.length,
      options: LABEL_AGGREGATES.map((mode) => {
        const range = countedRange(sorted.length, mode);
        return {
          mode,
          result: aggregateLevels(sorted, mode) ?? 0,
          bars: positions.map((p) => ({ level: sorted[p], counted: p >= range.start && p < range.end })),
        };
      }),
    };
  }, [example, levels]);
  const note = example ? t.labels.levelSample : shown < total ? t.labels.levelShown(shown, total) : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{t.labels.levelIntro}</Text>
      {note ? (
        <Text style={[typography.caption, { color: colors.textMuted }]} testID="level-mode-note">
          {note}
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={t.labels.levelTitle} style={{ gap: spacing.xs }}>
        {options.map(({ mode, result, bars }) => {
          const selected = mode === value;
          const text = t.labels.levelModes[mode];
          const percent = displayLevel(result);
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              accessibilityLabel={t.labels.levelOption(text.label, percent, text.help)}
              onPress={() => onChange(mode)}
              testID={`level-mode-${mode}`}
              style={({ pressed }) => [
                {
                  gap: spacing.xs,
                  padding: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.accentSoft : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <View style={[styles.row, { gap: spacing.md }]}>
                <ModeDrawing bars={bars} result={result} />
                <View style={[styles.text, { gap: spacing.xs }]}>
                  <View style={[styles.titleLine, { gap: spacing.sm }]}>
                    <Text
                      style={[typography.bodyStrong, styles.grow, { color: selected ? colors.accent : colors.text }]}
                    >
                      {text.label}
                    </Text>
                    <Text style={[typography.bodyStrong, { color: colors.text }]} testID={`level-mode-${mode}-value`}>
                      {`${percent}%`}
                    </Text>
                  </View>
                  <Gauge level={result} height={8} duration={0} />
                </View>
                <View style={styles.mark}>
                  {selected ? <Icon name="check" color={colors.accent} size={20} /> : null}
                </View>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{text.help}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  grow: {
    flex: 1,
  },
  mark: {
    width: 20,
    alignItems: 'center',
  },
});
