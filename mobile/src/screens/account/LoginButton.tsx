import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { LoginProvider } from '@/data';
import { t } from '@/i18n';
import { BrandLogo } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { AppleLoginButton } from './AppleLoginButton';
import { loginButtonStyles as styles } from './loginButtonStyles';

export interface LoginButtonProps {
  provider: LoginProvider;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

/**
 * The button of one login provider. Apple uses its own button (see
 * `AppleLoginButton`). Google follows the colors of its brand rules.
 */
export function LoginButton({ provider, onPress, busy = false, disabled = false }: LoginButtonProps) {
  if (provider === 'apple') return <AppleLoginButton onPress={onPress} busy={busy} disabled={disabled} />;
  return <GoogleLoginButton onPress={onPress} busy={busy} disabled={disabled} />;
}

function GoogleLoginButton({ onPress, busy, disabled }: Omit<LoginButtonProps, 'provider'>) {
  const theme = useTheme();
  const { radius, spacing, typography } = theme;
  const dark = theme.scheme === 'dark';
  const label = t.account.continueWith(t.account.providers.google);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      testID="login-google"
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: radius.md,
          backgroundColor: dark ? '#131314' : '#FFFFFF',
          borderColor: dark ? '#8E918F' : '#747775',
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          gap: spacing.sm,
        },
      ]}
    >
      <View style={styles.logo}>
        {busy ? <ActivityIndicator color={dark ? '#E3E3E3' : '#1F1F1F'} /> : <BrandLogo brand="google" size={18} />}
      </View>
      <Text style={[typography.bodyStrong, { color: dark ? '#E3E3E3' : '#1F1F1F' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
