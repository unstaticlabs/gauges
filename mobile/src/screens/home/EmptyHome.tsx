import { Text, View } from 'react-native';

import { loginProviders } from '@/data';
import { t } from '@/i18n';
import { useSession } from '@/state';
import { useTheme } from '@/ui/theme';

import { LoginButton } from '../account/LoginButton';
import { useLogIn } from '../account/useLogIn';
import { EmptyState } from './EmptyState';

/**
 * The home screen with no active gauge. It offers the first gauge. A user
 * with no login (an anonymous user on the phone) also gets the Google and
 * Apple buttons, because a login brings back the gauges of an account.
 */
export function EmptyHome({ onAdd }: { onAdd: () => void }) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useSession();
  const { logIn, busy, sheet } = useLogIn();
  const anonymous = user?.isAnonymous === true;

  return (
    <View style={{ gap: spacing.lg }}>
      <EmptyState
        illustration
        title={t.home.emptyTitle}
        body={t.home.emptyBody}
        actionLabel={t.home.emptyAction}
        onAction={onAdd}
      />
      {anonymous ? (
        <View
          style={{ gap: spacing.sm, paddingHorizontal: spacing.xl, maxWidth: 420, width: '100%', alignSelf: 'center' }}
          testID="empty-login"
        >
          <Text style={[typography.section, { color: colors.text, textAlign: 'center' }]} accessibilityRole="header">
            {t.home.loginTitle}
          </Text>
          <Text style={[typography.callout, { color: colors.textMuted, textAlign: 'center' }]}>{t.home.loginBody}</Text>
          {loginProviders.map((provider) => (
            <LoginButton
              key={provider}
              provider={provider}
              busy={busy === provider}
              disabled={busy !== null}
              onPress={() => logIn(provider)}
            />
          ))}
        </View>
      ) : null}
      {sheet}
    </View>
  );
}
