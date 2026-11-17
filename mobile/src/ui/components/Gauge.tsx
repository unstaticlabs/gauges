import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GREEN_ABOVE, ORANGE_ABOVE } from '../../domain/tone';
import { useTheme } from '../theme';
import { clampLevel } from './gaugeTone';

/** The old app shows at least this much fill, so that an empty gauge still shows its red. */
const MIN_FILL = 3;

export interface GaugeProps {
  /** The fill level, from 0 (empty) to 100 (full). */
  level: number;
  /** The height of the track in points. The fill sits inside it with a small inset. */
  height?: number;
  /** The duration of the animation to a new level, in milliseconds. */
  duration?: number;
  /** The label that screen readers read. */
  accessibilityLabel?: string;
  /** A paused gauge: the fill is a neutral grey, not the color of its level. */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A horizontal bar that shows how full a gauge is, in the shape of the old
 * app: a rounded track, and a rounded fill inside it. A change of `level`
 * animates the bar and its color. The first render does not animate.
 */
export function Gauge({ level, height = 14, duration = 900, accessibilityLabel, paused = false, style }: GaugeProps) {
  const theme = useTheme();
  const value = clampLevel(level);
  const animated = useSharedValue(value);
  const { green, orange, red } = theme.colors.gauge;
  const grey = theme.colors.gaugePaused;
  const inset = height >= 10 ? 2 : 0;

  useEffect(() => {
    animated.value = withTiming(value, { duration, easing: Easing.inOut(Easing.cubic) });
  }, [animated, value, duration]);

  const fillStyle = useAnimatedStyle(() => {
    const v = animated.value;
    return {
      width: `${Math.max(MIN_FILL, v)}%`,
      backgroundColor: paused ? grey : v > GREEN_ABOVE ? green : v > ORANGE_ABOVE ? orange : red,
    };
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={[
        styles.track,
        { height, padding: inset, borderRadius: theme.radius.full, backgroundColor: theme.colors.gaugeTrack },
        style,
      ]}
    >
      <Animated.View testID="gauge-fill" style={[styles.fill, { borderRadius: theme.radius.full }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
