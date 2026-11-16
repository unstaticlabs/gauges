import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { type Curve, CURVES, sampleCurve } from '@/domain';
import { t } from '@/i18n';
import { Icon } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const W = 56;
const H = 32;
const PAD = 3;

/** Builds the SVG path of a curve: full at the top left, empty at the bottom right. */
export function curvePath(curve: Curve): { line: string; area: string } {
  const points = sampleCurve(curve, 25).map(
    (p) => [PAD + p.x * (W - 2 * PAD), PAD + (1 - p.y) * (H - 2 * PAD)] as const,
  );
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;
  return { line, area };
}

function CurveDrawing({ curve, color }: { curve: Curve; color: string }) {
  const { line, area } = curvePath(curve);
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} pointerEvents="none" aria-hidden>
      <Path d={area} fill={color} opacity={0.14} />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export interface CurvePickerProps {
  value: Curve;
  onChange: (curve: Curve) => void;
  /** A line below the options, for example when the gauge turns red. */
  footer?: string;
}

/**
 * The three curves as a list. Each row shows the drawn curve, the name, and
 * its own line of help. The selected row has a tinted background, an accent
 * drawing, and a check mark.
 */
export function CurvePicker({ value, onChange, footer }: CurvePickerProps) {
  const { colors, radius, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t.gauge.curve} style={{ gap: spacing.xs }}>
        {CURVES.map((curve) => {
          const selected = curve === value;
          const text = t.gauge.curves[curve];
          return (
            <Pressable
              key={curve}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${text.label}. ${text.help}`}
              onPress={() => onChange(curve)}
              testID={`curve-${curve}`}
              style={({ pressed }) => [
                styles.row,
                {
                  gap: spacing.md,
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.accentSoft : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <CurveDrawing curve={curve} color={selected ? colors.accent : colors.textMuted} />
              <View style={styles.text}>
                <Text style={[typography.bodyStrong, { color: selected ? colors.accent : colors.text }]}>
                  {text.label}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{text.help}</Text>
              </View>
              <View style={styles.mark}>
                {selected ? <Icon name="check" color={colors.accent} size={20} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {footer ? <Text style={[typography.caption, { color: colors.textMuted }]}>{footer}</Text> : null}
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
  mark: {
    width: 20,
    alignItems: 'center',
  },
});
