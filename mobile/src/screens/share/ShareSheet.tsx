import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';

import { getRepository, type InvitePayload } from '@/data';
import { type Label, labelEmoji } from '@/domain';
import { errorMessage, dateLocale, formatDateTime, t } from '@/i18n';
import {
  getStoredInvite,
  isUsable,
  newInviteExpiry,
  setStoredInvite,
  useNow,
  useReloadProfiles,
  useSession,
} from '@/state';
import { AvatarStack, avatarColors, Button, QrCode, Sheet } from '@/ui/components';
import { confirm } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { useAvatarPeople } from '../labels/useAvatarPeople';
import { SERVER_WAIT_MS, withTimeout } from './timeout';

export interface ShareSheetProps {
  label: Label;
  visible: boolean;
  onClose: () => void;
}

type InviteState =
  | { status: 'loading' }
  | { status: 'ready'; invite: InvitePayload }
  | { status: 'error'; message: string };

/** The system share sheet exists on native, and on the web only in some browsers. */
const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/**
 * The QR code and the link of an invite to a label, and its members. The
 * device keeps one invite for each label until it expires, so the QR code
 * stays the same. "Reset link" revokes it and makes a new one. Mount it when
 * it opens: it loads the invite on mount.
 */
export function ShareSheet({ label, visible, onClose }: ShareSheetProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const { user } = useSession();
  const [state, setState] = useState<InviteState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const reloadProfiles = useReloadProfiles();
  const run = useRef(0);
  const now = useNow();
  const uid = user?.uid;

  /** Makes a new invite and stores it on the device. */
  const createInvite = useCallback(async (): Promise<InvitePayload> => {
    if (!uid) throw new Error('No user');
    const invite = await withTimeout(
      getRepository().createInvite(label.id, { expiresAt: newInviteExpiry(Date.now()) }),
      SERVER_WAIT_MS,
    );
    await setStoredInvite(uid, label.id, invite, Date.now());
    return invite;
  }, [label.id, uid]);

  /** Gives the stored invite while it is usable, or a new one. */
  const resolveInvite = useCallback(async (): Promise<InvitePayload> => {
    if (!uid) throw new Error('No user');
    const stored = await getStoredInvite(uid, label.id);
    return isUsable(stored, Date.now()) ? stored : createInvite();
  }, [createInvite, label.id, uid]);

  const load = useCallback(() => {
    const current = ++run.current;
    resolveInvite().then(
      (invite) => current === run.current && setState({ status: 'ready', invite }),
      (error) => current === run.current && setState({ status: 'error', message: errorMessage(error, t) }),
    );
  }, [resolveInvite]);

  useEffect(() => {
    load();
    reloadProfiles(label.members);
    // Load one time on mount. A new member does not need a new code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    setState({ status: 'loading' });
    load();
  };

  const copy = async () => {
    if (state.status !== 'ready') return;
    await Clipboard.setStringAsync(state.invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = () => {
    if (state.status !== 'ready') return;
    Share.share({ message: t.share.shareMessage(label.name, state.invite.url) }).catch(() => {});
  };

  const reset = async () => {
    if (state.status !== 'ready' || !uid) return;
    const ok = await confirm({
      title: t.share.resetConfirmTitle,
      message: t.share.resetHelp,
      confirmLabel: t.share.reset,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    const old = state.invite;
    try {
      // A failed revoke must not leave the old link working, so it comes first.
      await withTimeout(getRepository().revokeInvite(label.id, old.code), SERVER_WAIT_MS);
      await setStoredInvite(uid, label.id, null, Date.now());
      const invite = await createInvite();
      setState({ status: 'ready', invite });
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error, t) });
    } finally {
      setResetting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t.share.title(`${labelEmoji(label)} ${label.name}`)}
      onClose={onClose}
      scrollable
      testID="share-sheet"
    >
      <Text style={[typography.callout, { color: colors.textMuted }]}>{t.share.intro}</Text>

      <View style={[styles.qrBox, { backgroundColor: '#FFFFFF', borderRadius: radius.lg, borderColor: colors.border }]}>
        {state.status === 'ready' ? (
          <QrCode value={state.invite.url} size={QR_SIZE} accessibilityLabel={t.share.qrLabel} testID="invite-qr" />
        ) : state.status === 'loading' || resetting ? (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator color="#5D6472" accessibilityLabel={t.share.creating} />
          </View>
        ) : (
          <View style={[styles.qrPlaceholder, { padding: spacing.lg, gap: spacing.md }]}>
            <Text style={[typography.callout, styles.center, { color: '#5D6472' }]}>
              {t.share.createError} {state.message}
            </Text>
            <Button label={t.common.retry} variant="secondary" onPress={retry} />
          </View>
        )}
      </View>

      {state.status === 'ready' ? (
        <>
          {state.invite.expiresAt !== null ? (
            <Text style={[typography.caption, styles.center, { color: colors.textMuted }]}>
              {t.share.expires(formatDateTime(state.invite.expiresAt, dateLocale, now))}
            </Text>
          ) : null}
          <View style={[styles.actions, { gap: spacing.sm }]}>
            <Button
              label={copied ? t.share.copied : t.share.copy}
              icon={copied ? 'check' : 'copy'}
              variant="secondary"
              onPress={copy}
              style={styles.action}
              testID="invite-copy"
            />
            {canShare ? (
              <Button label={t.share.shareLink} icon="share" onPress={share} style={styles.action} testID="invite-share" />
            ) : null}
          </View>
        </>
      ) : null}

      <MembersList label={label} />

      {state.status === 'ready' ? (
        <Button
          label={t.share.reset}
          icon="refresh"
          variant="plain"
          onPress={reset}
          busy={resetting}
          style={styles.start}
          testID="invite-reset"
        />
      ) : null}
    </Sheet>
  );
}

/** The members of the label, each with an avatar and a name. */
function MembersList({ label }: { label: Label }) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useSession();
  const { people } = useAvatarPeople(label.members);
  const memberColors = avatarColors(label.members);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.section, { color: colors.text }]} accessibilityRole="header">
        {t.share.membersTitle}
      </Text>
      {people.map((person) => {
        const name = person.name ?? t.labels.someone;
        const shown = person.id === user?.uid ? `${name} (${t.labels.you.toLowerCase()})` : name;
        return (
          <View key={person.id} style={[styles.member, { gap: spacing.md }]} testID={`member-${name}`}>
            <AvatarStack
              people={[{ ...person, color: memberColors.get(person.id) }]}
              accessibilityLabel=""
              size={28}
              ringColor={colors.surfaceRaised}
            />
            <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
              {shown}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const QR_SIZE = 220;

const styles = StyleSheet.create({
  qrBox: {
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  qrPlaceholder: {
    width: QR_SIZE,
    height: QR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  start: {
    alignSelf: 'flex-start',
    marginLeft: -8,
  },
});
