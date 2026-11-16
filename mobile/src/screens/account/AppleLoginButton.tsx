import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { t } from '@/i18n';
import { BrandLogo } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { loginButtonStyles as styles } from './loginButtonStyles';

export interface AppleLoginButtonProps {
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

/**
 * The Apple button on Android and the web. It follows the rules of Apple
 * for a custom button: the Apple logo and "Continue with Apple", black in
 * light mode and white in dark mode. iOS uses the system button
 * (`AppleLoginButton.ios.tsx`).
 */
export function AppleLoginButton({ onPress, busy = false, disabled = false }: AppleLoginButtonProps) {
  const theme = useTheme();
  const { radius, spacing, typography } = theme;
  const dark = theme.scheme === 'dark';
  const background = dark ? '#FFFFFF' : '#000000';
  const foreground = dark ? '#000000' : '#FFFFFF';
  const label = t.account.continueWith(t.account.providers.apple);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID="login-apple"
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: radius.md,
          backgroundColor: background,
          borderColor: background,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={styles.logo}>
        {busy ? <ActivityIndicator color={foreground} /> : <BrandLogo brand="apple" size={18} color={foreground} />}
      </View>
      <Text style={[typography.bodyStrong, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
