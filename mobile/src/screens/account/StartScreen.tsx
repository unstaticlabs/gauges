import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loginProviders } from '@/data';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/state';
import { Button, Gauge } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { WebsiteLinks } from '../WebsiteLinks';
import { LoginButton } from './LoginButton';
import { useLogIn } from './useLogIn';

const MAX_WIDTH = 400;

/**
 * The screen with no user. On the web, it is the login gate: the website
 * needs a login. On the phone, it comes after a log-out: log in, or
 * continue without an account.
 *
 * The footer links to the privacy policy, the legal notice, and the help
 * page. On the web, this screen is the home page at `/`. The legal notice
 * must be easy to reach, and Google asks that a home page is more than a
 * login and links to the privacy policy
 * (https://support.google.com/cloud/answer/13464321).
 */
export function StartScreen() {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const showToast = useToast();
  const { logIn, busy, sheet } = useLogIn();
  const [starting, setStarting] = useState(false);
  const web = Platform.OS === 'web';

  const withoutAccount = () => {
    setStarting(true);
    session
      .continueWithoutAccount()
      .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }))
      .finally(() => setStarting(false));
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { padding: spacing.xl, paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={[styles.column, styles.main, { gap: spacing.xl }]}>
        <View style={{ gap: spacing.sm }} aria-hidden importantForAccessibility="no-hide-descendants">
          <Gauge level={88} height={12} />
          <Gauge level={42} height={12} />
          <Gauge level={18} height={12} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text style={[typography.title, { color: colors.text }]} accessibilityRole="header">
            {t.account.startTitle}
          </Text>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {web && !session.anonymousAllowed ? `${t.account.startBody} ${t.account.startBodyWeb}` : t.account.startBody}
          </Text>
        </View>
        <View style={{ gap: spacing.md }}>
          {loginProviders.map((provider) => (
            <LoginButton
              key={provider}
              provider={provider}
              busy={busy === provider}
              disabled={busy !== null || starting}
              onPress={() => logIn(provider)}
            />
          ))}
        </View>
        {session.anonymousAllowed ? (
          <View style={{ gap: spacing.xs }}>
            <Button
              label={t.account.withoutAccount}
              variant="secondary"
              onPress={withoutAccount}
              busy={starting}
              disabled={busy !== null}
              testID="continue-without-account"
            />
            {web ? null : (
              <Text style={[typography.caption, styles.center, { color: colors.textMuted }]}>
                {t.account.withoutAccountHelp}
              </Text>
            )}
          </View>
        ) : null}
      </View>
      <View style={[styles.column, { paddingTop: spacing.xxl }]}>
        <WebsiteLinks />
      </View>
      {sheet}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  main: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
  },
  center: {
    textAlign: 'center',
  },
});
