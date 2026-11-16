import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';
import { TOUCH_TARGET } from './Button';

export interface ToastProps {
  message: string;
  tone: 'normal' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

/** A short message at the bottom of the screen, with one optional button. */
export function Toast({ message, tone, actionLabel, onAction, onDismiss }: ToastProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.lg }]}
    >
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: tone === 'error' ? colors.danger : colors.inverse,
            borderRadius: radius.lg,
            paddingLeft: spacing.lg,
            paddingRight: onAction ? spacing.xs : spacing.lg,
          },
        ]}
      >
        <Pressable onPress={onDismiss} style={styles.message} accessibilityRole="text">
          <Text
            style={[typography.callout, { color: tone === 'error' ? '#FFFFFF' : colors.textOnInverse }]}
            numberOfLines={3}
          >
            {message}
          </Text>
        </Pressable>
        {onAction && actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={({ pressed }) => [
              styles.action,
              { paddingHorizontal: spacing.md, borderRadius: radius.md, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[typography.bodyStrong, { color: tone === 'error' ? '#FFFFFF' : colors.accentOnInverse }]}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 520,
    minHeight: 52,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: {
    flex: 1,
    paddingVertical: 14,
  },
  action: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
