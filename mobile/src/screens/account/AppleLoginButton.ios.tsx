import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { ActivityIndicator, View } from 'react-native';

import { TOUCH_TARGET } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import type { AppleLoginButtonProps } from './AppleLoginButton';

/**
 * The system "Sign in with Apple" button on iOS, as the rules of Apple ask.
 * The system draws its text, logo, and accessibility label.
 */
export function AppleLoginButton({ onPress, busy = false, disabled = false }: AppleLoginButtonProps) {
  const theme = useTheme();
  const dark = theme.scheme === 'dark';
  return (
    <View
      pointerEvents={disabled || busy ? 'none' : 'auto'}
      style={{ opacity: disabled ? 0.5 : 1, justifyContent: 'center' }}
      testID="login-apple"
    >
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={dark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={theme.radius.md}
        onPress={onPress}
        style={{ width: '100%', height: TOUCH_TARGET + 4 }}
      />
      {busy ? <ActivityIndicator style={{ position: 'absolute', right: 16 }} color={dark ? '#000' : '#FFF'} /> : null}
    </View>
  );
}
