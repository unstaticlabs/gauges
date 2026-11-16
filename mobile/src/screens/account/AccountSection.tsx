import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getRepository, type Login, type LoginProvider, loginProviders } from '@/data';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/state';
import { BrandLogo, Button } from '@/ui/components';
import { confirm } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { Section } from '../Section';
import { LoginButton } from './LoginButton';
import { useLogIn } from './useLogIn';

/**
 * Settings, "Account": an anonymous user links a login here, or logs in to
 * an existing account. A user with a login sees the logins, adds another
 * one, logs out, or deletes the account.
 */
export function AccountSection() {
  const { colors, spacing, typography } = useTheme();
  const { user } = useSession();
  const { logIn, busy, sheet } = useLogIn();
  if (!user) return null;
  const missing = loginProviders.filter((p) => !user.logins.some((l) => l.provider === p));

  const buttons = (
    <View style={{ gap: spacing.sm }}>
      {missing.map((provider) => (
        <LoginButton
          key={provider}
          provider={provider}
          busy={busy === provider}
          disabled={busy !== null}
          onPress={() => logIn(provider)}
        />
      ))}
    </View>
  );

  return (
    <Section title={t.account.section}>
      {user.isAnonymous ? (
        <>
          <Text style={[typography.callout, { color: colors.textMuted }]}>{t.account.anonymousBody}</Text>
          {buttons}
        </>
      ) : (
        <>
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t.account.loggedInWith}</Text>
          {user.logins.map((login, index) => (
            <LoginRow key={login.provider} login={login} first={index === 0} canRemove={user.logins.length > 1} />
          ))}
          {missing.length > 0 ? (
            <>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t.account.addLogin}</Text>
              {buttons}
            </>
          ) : null}
          <View style={styles.start}>
            <SignOutButton />
          </View>
        </>
      )}
      <View style={styles.start}>
        <DeleteAccountButton anonymous={user.isAnonymous} reauthProvider={user.logins[0]?.provider ?? null} />
      </View>
      {sheet}
    </Section>
  );
}

function LoginRow({ login, first, canRemove }: { login: Login; first: boolean; canRemove: boolean }) {
  const { colors, spacing, typography } = useTheme();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const name = t.account.providers[login.provider];

  const remove = async () => {
    const ok = await confirm({
      title: t.account.unlinkConfirmTitle(name),
      message: t.account.unlinkConfirmBody,
      confirmLabel: t.account.unlink,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    getRepository()
      .unlinkLogin(login.provider)
      .then(() => showToast({ message: t.account.unlinked(name) }))
      .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }))
      .finally(() => setBusy(false));
  };

  return (
    <View
      style={[
        styles.row,
        { gap: spacing.md },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
      ]}
      accessible={!canRemove}
      accessibilityLabel={t.account.loginRow(name, login.email ?? t.account.noEmail)}
      testID={`login-row-${login.provider}`}
    >
      <BrandLogo brand={login.provider} size={20} color={colors.text} />
      <View style={styles.rowText}>
        <Text style={[typography.body, { color: colors.text }]}>{name}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
          {login.email ?? t.account.noEmail}
        </Text>
      </View>
      {canRemove ? (
        <Button
          label={t.account.unlink}
          variant="plain"
          onPress={remove}
          busy={busy}
          accessibilityHint={t.account.unlinkLabel(name)}
          testID={`unlink-${login.provider}`}
        />
      ) : null}
    </View>
  );
}

function SignOutButton() {
  const { signOut } = useSession();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const press = async () => {
    const ok = await confirm({
      title: t.account.signOutConfirmTitle,
      message: t.account.signOutConfirmBody,
      confirmLabel: t.account.signOut,
      cancelLabel: t.common.cancel,
    });
    if (!ok) return;
    setBusy(true);
    signOut()
      .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }))
      .finally(() => setBusy(false));
  };

  return <Button label={t.account.signOut} icon="leave" variant="plain" onPress={press} busy={busy} testID="sign-out" />;
}

function DeleteAccountButton({ anonymous, reauthProvider }: { anonymous: boolean; reauthProvider: LoginProvider | null }) {
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    const repository = getRepository();
    try {
      await repository.deleteAccount();
      showToast({ message: t.account.deleted });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code !== 'requires-recent-login' || !reauthProvider) throw error;
      const again = await confirm({
        title: t.account.deleteReauthTitle,
        message: t.account.deleteReauthBody,
        confirmLabel: t.common.continue,
        cancelLabel: t.common.cancel,
      });
      if (!again) return;
      await repository.reauthenticate(reauthProvider);
      await repository.deleteAccount();
      showToast({ message: t.account.deleted });
    }
  };

  const press = async () => {
    const ok = await confirm({
      title: t.account.deleteConfirmTitle,
      message: anonymous ? t.account.deleteConfirmBodyAnonymous : t.account.deleteConfirmBody,
      confirmLabel: t.common.delete,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    run()
      .catch((error) => {
        const code = (error as { code?: string } | null)?.code;
        if (code !== 'cancelled') showToast({ message: errorMessage(error, t), tone: 'error' });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Button label={t.account.deleteAccount} variant="danger" onPress={press} busy={busy} testID="delete-account" />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  rowText: {
    flex: 1,
  },
  // The text buttons line up with the text above them.
  start: {
    alignItems: 'flex-start',
    marginLeft: -8,
  },
});
