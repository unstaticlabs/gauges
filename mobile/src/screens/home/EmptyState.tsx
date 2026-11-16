import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Gauge } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows three small sample bars above the text. */
  illustration?: boolean;
}

/** The message for an empty list. */
export function EmptyState({ title, body, actionLabel, onAction, illustration = false }: EmptyStateProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.box, { gap: spacing.md, padding: spacing.xl, marginTop: illustration ? spacing.xxxl : 0 }]}>
      {illustration ? (
        <View style={[styles.sample, { gap: spacing.sm, marginBottom: spacing.md }]} aria-hidden>
          <Gauge level={85} height={8} />
          <Gauge level={45} height={8} />
          <Gauge level={15} height={8} />
        </View>
      ) : null}
      <Text style={[typography.heading, styles.center, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[typography.callout, styles.center, { color: colors.textMuted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} icon="plus" style={{ marginTop: spacing.sm }} testID="empty-add" />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    maxWidth: 420,
    alignSelf: 'center',
  },
  sample: {
    width: 160,
  },
  center: {
    textAlign: 'center',
  },
});
