import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildInviteUrl, getRepository, parseInviteUrl } from '@/data';
import { labelEmoji } from '@/domain';
import { errorMessage, t } from '@/i18n';
import { useLabels } from '@/state';
import { Button, Icon, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { Section } from '../Section';
import { QrScanner } from './QrScanner';
import { SERVER_WAIT_MS, withTimeout } from './timeout';
import { useNameGate } from './useNameGate';

const MAX_WIDTH = 640;

type Invite = { labelId: string; code: string };

type Phase =
  | { kind: 'enter' }
  | { kind: 'scan' }
  | { kind: 'confirm'; invite: Invite }
  | { kind: 'joining'; invite: Invite }
  | { kind: 'error'; invite: Invite; title: string; body: string };

/** Reads the invite from the route parameters of a deep link, or gives `null`. */
function inviteFromParams(labelId?: string, code?: string): Invite | null {
  if (!labelId || !code) return null;
  return parseInviteUrl(buildInviteUrl(labelId, code));
}

/** Gives the title and the text of a join error. */
function joinError(error: unknown): { title: string; body: string } {
  const code = error != null && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'permission-denied' || code === 'not-found' || code === 'invalid-argument') {
    return { title: t.join.invalidTitle, body: t.join.invalidBody };
  }
  if (code === 'unavailable') return { title: t.join.offlineTitle, body: t.join.offlineBody };
  return { title: t.join.errorTitle, body: errorMessage(error, t) };
}

/**
 * Joins a shared label. The screen opens from an invite link with the label
 * and the code, or from Settings, where the user scans a QR code (native
 * only) or pastes the link. A user who is not a member cannot read the label,
 * so the confirmation does not show its name.
 */
export function JoinScreen({ labelId, code }: { labelId?: string; code?: string }) {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const labels = useLabels();
  const { gate, sheet: nameSheet } = useNameGate();
  const fromLink = useMemo(() => inviteFromParams(labelId, code), [labelId, code]);
  const [phase, setPhase] = useState<Phase>(fromLink ? { kind: 'confirm', invite: fromLink } : { kind: 'enter' });
  const [text, setText] = useState('');
  const [textError, setTextError] = useState<string | null>(null);

  const current = 'invite' in phase ? phase.invite : null;
  // During the join, the label reaches the live list before the join ends.
  // So "already a member" shows only before a join.
  const member =
    current && phase.kind !== 'joining' ? labels.items.find((l) => l.id === current.labelId) : undefined;

  const readLink = (value: string) => {
    const invite = parseInviteUrl(value);
    if (!invite) {
      setTextError(t.join.notALink);
      return;
    }
    setTextError(null);
    setPhase({ kind: 'confirm', invite });
  };

  const paste = async () => {
    const value = await Clipboard.getStringAsync().catch(() => '');
    setText(value);
    if (value) readLink(value);
  };

  const join = (invite: Invite) =>
    gate(async () => {
      setPhase({ kind: 'joining', invite });
      try {
        await withTimeout(getRepository().joinByInvite(invite), SERVER_WAIT_MS);
        // The label page waits for the label in the live list, and greets the user.
        router.replace({ pathname: '/label/[id]', params: { id: invite.labelId, joined: '1' } });
      } catch (error) {
        setPhase({ kind: 'error', invite, ...joinError(error) });
      }
    });

  return (
    <>
      <Stack.Screen options={{ title: t.join.title }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.xxxl,
            paddingLeft: insets.left + spacing.page,
            paddingRight: insets.right + spacing.page,
          },
        ]}
      >
        <View style={[styles.column, { gap: spacing.xl }]}>
          {phase.kind === 'enter' ? (
            <>
              <Text style={[typography.callout, { color: colors.textMuted }]}>{t.join.intro}</Text>
              {Platform.OS !== 'web' ? (
                <Button label={t.join.scan} icon="scan" onPress={() => setPhase({ kind: 'scan' })} testID="join-scan" />
              ) : null}
              <Section title={t.join.pasteLabel}>
                <TextField
                  accessibilityLabel={t.join.pasteLabel}
                  value={text}
                  onChangeText={(value) => {
                    setText(value);
                    setTextError(null);
                  }}
                  placeholder={t.join.pastePlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={() => readLink(text)}
                  error={textError}
                  testID="join-link"
                />
                <View style={[styles.row, { gap: spacing.sm }]}>
                  <Button label={t.join.paste} icon="copy" variant="secondary" onPress={paste} style={styles.flex} />
                  <Button
                    label={t.join.next}
                    onPress={() => readLink(text)}
                    disabled={text.trim().length === 0}
                    style={styles.flex}
                    testID="join-next"
                  />
                </View>
              </Section>
            </>
          ) : null}

          {phase.kind === 'scan' ? (
            <QrScanner onScan={readLink} onCancel={() => setPhase({ kind: 'enter' })} />
          ) : null}

          {current && member ? (
            <Message icon="check" title={t.join.alreadyMember}>
              <Button
                label={`${labelEmoji(member)} ${member.name}`}
                onPress={() => router.replace({ pathname: '/label/[id]', params: { id: member.id } })}
                testID="join-open-label"
              />
            </Message>
          ) : null}

          {phase.kind === 'confirm' && !member ? (
            <Message icon="tag" title={t.join.confirmTitle} body={t.join.confirmBody}>
              <Button label={t.join.confirm} onPress={() => join(phase.invite)} testID="join-confirm" />
              <Button label={t.common.cancel} variant="plain" onPress={() => setPhase({ kind: 'enter' })} />
            </Message>
          ) : null}

          {phase.kind === 'joining' ? (
            <View style={[styles.center, { gap: spacing.md, paddingVertical: spacing.xxl }]}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={[typography.callout, { color: colors.textMuted }]}>{t.join.joining}</Text>
            </View>
          ) : null}

          {phase.kind === 'error' && !member ? (
            <Message icon="close" title={phase.title} body={phase.body} tone="error">
              <Button label={t.common.retry} onPress={() => join(phase.invite)} testID="join-retry" />
              <Button
                label={t.join.otherLink}
                testID="join-other"
                variant="plain"
                onPress={() => {
                  setText('');
                  setPhase({ kind: 'enter' });
                }}
              />
            </Message>
          ) : null}
        </View>
      </ScrollView>
      {nameSheet}
    </>
  );
}

interface MessageProps {
  icon: 'check' | 'tag' | 'close';
  title: string;
  body?: string;
  tone?: 'normal' | 'error';
  children?: React.ReactNode;
}

/** A centered message with an icon, a title, a text, and buttons. */
function Message({ icon, title, body, tone = 'normal', children }: MessageProps) {
  const { colors, spacing, typography } = useTheme();
  const tint = tone === 'error' ? colors.danger : colors.accent;
  return (
    <View
      style={[
        styles.message,
        { paddingVertical: spacing.lg, gap: spacing.md },
      ]}
      testID="join-message"
    >
      <View style={[styles.badge, { backgroundColor: tone === 'error' ? colors.field : colors.accentSoft }]}>
        <Icon name={icon} color={tint} size={26} />
      </View>
      <Text
        style={[typography.heading, styles.textCenter, { color: colors.text }]}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
      >
        {title}
      </Text>
      {body ? <Text style={[typography.callout, styles.textCenter, { color: colors.textMuted }]}>{body}</Text> : null}
      <View style={[styles.stretch, { gap: spacing.sm, marginTop: spacing.sm }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
  },
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  message: {
    alignItems: 'center',
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCenter: {
    textAlign: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
});
