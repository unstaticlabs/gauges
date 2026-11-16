import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRepository, NAME_MAX_LENGTH } from '@/data';
import { archivedGauges, type Gauge, type Label, labelAvatarOrder, labelEmoji } from '@/domain';
import { errorMessage, formatRelative, relativeFormatter, t } from '@/i18n';
import { useGauges, useLabels, useMyName, useNow, useSession, useToast } from '@/state';
import { Button, Icon, IconButton, TextField } from '@/ui/components';
import { confirm } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { AccountSection } from '../account/AccountSection';
import { MemberAvatars } from '../labels/MemberAvatars';
import { Section } from '../Section';
import { WebsiteLinks } from '../WebsiteLinks';
import { RemindersSection } from './RemindersSection';

const MAX_WIDTH = 640;

/**
 * Settings, as one flat page: the name of the user, the labels, the
 * reminders, the archived gauges (only when there are some), the account,
 * and a footer with the legal links and the version.
 */
export function SettingsScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xxxl * 2,
          paddingLeft: insets.left + spacing.page,
          paddingRight: insets.right + spacing.page,
        },
      ]}
    >
      <View style={[styles.column, { gap: spacing.xxl }]}>
        <NameField />
        <LabelsSection />
        <RemindersSection />
        <ArchivedSection />
        <AccountSection />
        <Footer />
      </View>
    </ScrollView>
  );
}

/**
 * The links to the privacy policy, the legal notice, and the help page on
 * the website, and the version. A tap on the version copies a support code
 * with the user ID, so that support can find the account.
 */
function Footer() {
  const { colors, spacing, typography } = useTheme();
  const { user } = useSession();
  const showToast = useToast();
  const version = Constants.expoConfig?.version ?? '—';

  const copySupportCode = () => {
    if (!user) return;
    Clipboard.setStringAsync(t.settings.supportCode(version, Platform.OS, user.uid))
      .then(() => showToast({ message: t.settings.supportCodeCopied, durationMs: 3000 }))
      .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }));
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <WebsiteLinks />
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t.settings.versionHint}
        onPress={copySupportCode}
        style={({ pressed }) => [styles.version, { opacity: pressed ? 0.6 : 1 }]}
        testID="app-version"
      >
        <Text style={[typography.caption, styles.center, { color: colors.textMuted }]}>
          {t.settings.version(version)}
        </Text>
      </Pressable>
    </View>
  );
}

/** The name of the user. It saves when the user leaves the field or presses Enter. */
function NameField() {
  const showToast = useToast();
  const { name: saved, save: saveName } = useMyName();
  // `null` until the user types. Until then, the field shows the saved name.
  const [edited, setName] = useState<string | null>(null);
  const name = edited ?? saved ?? '';
  const trimmed = name.trim();

  const save = () => {
    if (saved === undefined || trimmed === (saved ?? '')) return;
    if (trimmed.length === 0 || trimmed.length > NAME_MAX_LENGTH) {
      setName(null);
      return;
    }
    saveName(trimmed)
      .then(() => {
        setName(null);
        showToast({ message: t.settings.nameSaved, durationMs: 2500 });
      })
      .catch((error) => showToast({ message: errorMessage(error, t), tone: 'error' }));
  };

  return (
    <TextField
      label={t.settings.myName}
      value={name}
      onChangeText={setName}
      onBlur={save}
      onSubmitEditing={save}
      placeholder={t.settings.myNamePlaceholder}
      help={t.settings.myNameHelp}
      autoCapitalize="words"
      autoComplete="name"
      returnKeyType="done"
      maxLength={NAME_MAX_LENGTH}
      testID="my-name"
    />
  );
}

/** The labels of the user. A row opens the label page, where the user shares and edits it. */
function LabelsSection() {
  const { colors, spacing, typography } = useTheme();
  const router = useRouter();
  const labels = useLabels();
  const sorted = useMemo(() => [...labels.items].sort((a, b) => a.name.localeCompare(b.name)), [labels.items]);

  return (
    <Section title={t.settings.labels}>
      {sorted.length === 0 ? (
        <Text style={[typography.callout, { color: colors.textMuted }]}>{t.settings.labelsEmpty}</Text>
      ) : (
        <View>
          {sorted.map((label, index) => (
            <LabelRow
              key={label.id}
              label={label}
              first={index === 0}
              onOpen={() => router.push(`/label/${label.id}`)}
            />
          ))}
        </View>
      )}
      <Button
        label={t.join.menu}
        icon="scan"
        variant="plain"
        onPress={() => router.push('/invite')}
        style={[styles.start, { marginLeft: -spacing.sm }]}
        testID="open-join"
      />
    </Section>
  );
}

function LabelRow({ label, first, onOpen }: { label: Label; first: boolean; onOpen: () => void }) {
  const { colors, spacing, typography } = useTheme();
  const gauges = useGauges();
  const shared = label.members.length > 1;
  const members = useMemo(() => (shared ? labelAvatarOrder(label, gauges.items) : []), [shared, label, gauges.items]);
  const who = shared ? t.labels.members(label.members.length) : t.labels.onlyYou;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label.name}, ${who}`}
      accessibilityHint={t.settings.labelRowHint}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.6 : 1 },
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}
      testID={`settings-label-${label.name}`}
    >
      <Text style={styles.emoji} aria-hidden>
        {labelEmoji(label)}
      </Text>
      <View style={styles.grow}>
        <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
          {label.name}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{who}</Text>
      </View>
      {shared ? <MemberAvatars ids={members} size={22} ringColor={colors.background} /> : null}
      <Icon name="chevronRight" color={colors.textMuted} size={18} />
    </Pressable>
  );
}

/** The archived gauges. The section shows only when there is one. */
function ArchivedSection() {
  const { colors, spacing, typography } = useTheme();
  const gauges = useGauges();
  const now = useNow();
  const showToast = useToast();
  const archived = useMemo(
    () => archivedGauges(gauges.items).sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    [gauges.items],
  );

  const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });

  const restore = (gauge: Gauge) => {
    getRepository().unarchiveGauge(gauge.id).catch(fail);
    showToast({ message: t.settings.restoredToast(gauge.name) });
  };

  const remove = async (gauge: Gauge) => {
    const ok = await confirm({
      title: t.gauge.deleteConfirmTitle(gauge.name),
      message: t.gauge.deleteConfirmBody,
      confirmLabel: t.common.delete,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (ok) getRepository().deleteGauge(gauge.id).catch(fail);
  };

  if (archived.length === 0) return null;

  return (
    <Section title={t.settings.archived}>
      <View>
        {archived.map((gauge, index) => (
          <Animated.View
            key={gauge.id}
            layout={LinearTransition.duration(250)}
            exiting={FadeOut.duration(150)}
            style={[
              styles.row,
              { gap: spacing.xs, paddingVertical: spacing.xs },
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <View style={styles.grow}>
              <Text style={[typography.body, { color: colors.text }]} numberOfLines={2}>
                {gauge.name}
              </Text>
              {gauge.archivedAt !== null ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {t.settings.archivedAgo(formatRelative(gauge.archivedAt, now, t, relativeFormatter))}
                </Text>
              ) : null}
            </View>
            <Button
              label={t.settings.restore}
              variant="plain"
              onPress={() => restore(gauge)}
              testID={`restore-${gauge.name}`}
            />
            <IconButton
              icon="trash"
              label={`${t.common.delete}: ${gauge.name}`}
              color={colors.danger}
              onPress={() => remove(gauge)}
              testID={`delete-${gauge.name}`}
            />
          </Animated.View>
        ))}
      </View>
    </Section>
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
    alignItems: 'center',
    minHeight: 48,
  },
  grow: {
    flex: 1,
  },
  emoji: {
    fontSize: 24,
    lineHeight: 30,
    width: 32,
    textAlign: 'center',
  },
  start: {
    alignSelf: 'flex-start',
  },
  center: {
    textAlign: 'center',
  },
  version: {
    alignSelf: 'center',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
