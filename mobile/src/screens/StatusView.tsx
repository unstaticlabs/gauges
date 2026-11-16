import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface StatusViewProps {
  kind: 'loading' | 'error' | 'message';
  title?: string;
  body?: string;
  onRetry?: () => void;
}

/** A full-screen view for loading, an error, or a plain message. */
export function StatusView({ kind, title, body, onRetry }: StatusViewProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.background, gap: spacing.md, padding: spacing.xl }]}>
      {kind === 'loading' ? <ActivityIndicator color={colors.textMuted} accessibilityLabel={t.app.loading} /> : null}
      {title ? (
        <Text style={[typography.heading, styles.center, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {body ? <Text style={[typography.callout, styles.center, { color: colors.textMuted }]}>{body}</Text> : null}
      {onRetry ? <Button label={t.common.retry} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
    maxWidth: 420,
  },
});
