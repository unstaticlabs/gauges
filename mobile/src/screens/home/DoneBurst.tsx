import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/ui/theme';

/** The number of sparks, and how far they fly in points. */
const SPARKS = 10;
const DISTANCE = 34;
/** The burst starts when the fill of the bar reaches the end. */
const DELAY_MS = 520;
const DURATION_MS = 620;

/**
 * A short burst of small sparks from the right end of the bar, when the user
 * marks a gauge done. The row renders it only for the done moment, so a long
 * list pays nothing for it. With "reduce motion" on, it shows nothing.
 */
export function DoneBurst() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const { colors } = useTheme();
  const palette = [colors.gauge.green, colors.gauge.orange, colors.accent];

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withDelay(DELAY_MS, withTiming(1, { duration: DURATION_MS, easing: Easing.out(Easing.cubic) }));
  }, [progress, reduceMotion]);

  if (reduceMotion) return null;
  return (
    <View style={styles.origin} pointerEvents="none" aria-hidden>
      {Array.from({ length: SPARKS }, (_, index) => (
        <Spark
          key={index}
          progress={progress}
          // Half a circle that opens up, left, and down, away from the edge of the screen.
          angle={Math.PI / 2 + (Math.PI * index) / (SPARKS - 1)}
          distance={DISTANCE * (index % 2 === 0 ? 1 : 0.7)}
          color={palette[index % palette.length]}
        />
      ))}
    </View>
  );
}

function Spark({
  progress,
  angle,
  distance,
  color,
}: {
  progress: SharedValue<number>;
  angle: number;
  distance: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p === 0 ? 0 : 1 - p,
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: -Math.sin(angle) * distance * p },
        { scale: 1 - 0.5 * p },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  origin: {
    position: 'absolute',
    right: 4,
    top: '50%',
    width: 0,
    height: 0,
  },
  spark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    left: -3,
    top: -3,
  },
});
