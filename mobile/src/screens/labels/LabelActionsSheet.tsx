import { useState } from 'react';
import { Text, View } from 'react-native';

import { getRepository, NAME_MAX_LENGTH } from '@/data';
import { type Label, labelEmoji } from '@/domain';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/state';
import { Button, EmojiPicker, Sheet, TextField } from '@/ui/components';
import { confirm } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { Section } from '../Section';
import { labelPermissions } from './permissions';

export interface LabelActionsSheetProps {
  label: Label;
  visible: boolean;
  onClose: () => void;
  /** Called after a leave or a delete, for example to close the label page. */
  onGone?: () => void;
}

/**
 * Edits a label: its emoji and its name, with one Save. Below, the user
 * leaves or deletes the label. Mount it when it opens, so that the fields
 * start with the current values.
 */
export function LabelActionsSheet({ label, visible, onClose, onGone }: LabelActionsSheetProps) {
  const { colors, spacing, typography } = useTheme();
  const { user } = useSession();
  const showToast = useToast();
  const [name, setName] = useState(label.name);
  const [emoji, setEmoji] = useState<string | null>(label.emoji ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { shared, canLeave, canDelete } = labelPermissions(label, user?.uid);
  const trimmed = name.trim();
  const nameValid = trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;
  const nameChanged = trimmed !== label.name;
  const emojiChanged = emoji !== (label.emoji ?? null);
  const canSave = nameValid && (nameChanged || emojiChanged);

  const fail = (e: unknown) => showToast({ message: errorMessage(e, t), tone: 'error' });

  const save = () => {
    if (!canSave) return;
    // The local cache shows the change at once. An error comes back as a toast.
    const repository = getRepository();
    if (nameChanged) repository.renameLabel(label.id, trimmed).catch(fail);
    if (emojiChanged) repository.setLabelEmoji(label.id, emoji).catch(fail);
    onClose();
    showToast({ message: t.labels.saved });
  };

  const leave = async () => {
    const ok = await confirm({
      title: t.labels.leaveConfirmTitle(label.name),
      message: t.labels.leaveConfirmBody,
      confirmLabel: t.labels.leave,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    await runAndClose(() => getRepository().leaveLabel(label.id), t.labels.left(label.name));
  };

  const remove = async () => {
    const ok = await confirm({
      title: t.labels.deleteConfirmTitle(label.name),
      message: shared ? t.labels.deleteConfirmShared : t.labels.deleteConfirmPrivate,
      confirmLabel: t.common.delete,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (!ok) return;
    await runAndClose(() => getRepository().deleteLabel(label.id), t.labels.deleted(label.name));
  };

  /** A leave and a delete read the label first, so the sheet waits for them and shows the error. */
  const runAndClose = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
      onGone?.();
      showToast({ message: done });
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={`${labelEmoji({ emoji: emoji ?? undefined })} ${trimmed || label.name}`}
      onClose={onClose}
      scrollable
      testID="label-actions"
    >
      <Section title={t.labels.emoji}>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </Section>
      <TextField
        label={t.labels.renameField}
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX_LENGTH}
        returnKeyType="done"
        onSubmitEditing={save}
        testID="label-rename-field"
      />
      <Button label={t.common.save} onPress={save} disabled={!canSave} testID="label-save" />
      {error ? (
        <Text style={[typography.callout, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={[styles.end, { gap: spacing.xs }]}>
        {canLeave ? (
          <Button label={t.labels.leave} variant="danger" onPress={leave} busy={busy} testID="label-leave" />
        ) : null}
        {canDelete ? (
          <Button label={t.labels.deleteLabel} variant="danger" onPress={remove} busy={busy} testID="label-delete" />
        ) : (
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t.labels.deleteHelpCreator}</Text>
        )}
      </View>
    </Sheet>
  );
}

const styles = {
  end: { alignItems: 'flex-start' as const },
};
