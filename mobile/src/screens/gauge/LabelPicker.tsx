import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NAME_MAX_LENGTH } from '@/data';
import {
  DEFAULT_LABEL_EMOJI,
  findLabelByName,
  type Label,
  labelEmoji,
  normalizeForSearch,
  searchLabels,
  suggestEmoji,
} from '@/domain';
import { t } from '@/i18n';
import { Chip, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { type LabelChoice, MAX_LABELS } from './form';

export interface LabelPickerProps {
  value: LabelChoice[];
  onChange: (value: LabelChoice[]) => void;
  /** The labels of the user. */
  labels: readonly Label[];
}

/** The most suggestions under the field, so that the form stays short. */
const MAX_SUGGESTIONS = 8;

const sameName = (a: string, b: string) => normalizeForSearch(a.trim()) === normalizeForSearch(b.trim());

/**
 * The labels of a gauge as chips. The user types a name and presses Enter:
 * an existing label with that name is added, else the name becomes a new
 * label when the form saves. The field keeps the focus, so the user can type
 * the next name at once.
 */
export function LabelPicker({ value, onChange, labels }: LabelPickerProps) {
  const { colors, spacing, typography } = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const typed = text.trim();

  const isChosen = (choice: { id: string | null; name: string }) =>
    value.some((c) => (choice.id !== null && c.id === choice.id) || sameName(c.name, choice.name));

  const suggestions = searchLabels(
    labels.filter((l) => !value.some((c) => c.id === l.id || sameName(c.name, l.name))),
    text,
  ).slice(0, MAX_SUGGESTIONS);
  const canCreate =
    typed.length > 0 && !findLabelByName(labels, typed) && !value.some((c) => sameName(c.name, typed));

  const add = (choice: LabelChoice) => {
    setText('');
    if (isChosen(choice)) return;
    if (value.length >= MAX_LABELS) {
      setError(t.labels.formMax(MAX_LABELS));
      return;
    }
    setError(null);
    onChange([...value, choice]);
  };

  const submit = () => {
    if (!typed) return;
    const existing = findLabelByName(labels, typed);
    if (existing) {
      add({ id: existing.id, name: existing.name, emoji: existing.emoji });
      return;
    }
    const name = typed.slice(0, NAME_MAX_LENGTH);
    add({ id: null, name, emoji: suggestEmoji(name) ?? undefined });
  };

  const remove = (choice: LabelChoice) => {
    setError(null);
    onChange(value.filter((c) => c !== choice));
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {value.length > 0 ? (
        <View style={[styles.wrap, { columnGap: spacing.sm }]}>
          {value.map((choice) => (
            <Chip
              key={choice.id ?? `new:${choice.name}`}
              label={choice.name}
              emoji={choice.emoji ?? DEFAULT_LABEL_EMOJI}
              onRemove={() => remove(choice)}
              accessibilityLabel={t.labels.formRemove(choice.name)}
              testID={`label-chip-${choice.name}`}
            />
          ))}
        </View>
      ) : null}
      <TextField
        accessibilityLabel={t.labels.formPlaceholder}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setError(null);
        }}
        placeholder={t.labels.formPlaceholder}
        autoCapitalize="sentences"
        autoCorrect={false}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={submit}
        maxLength={NAME_MAX_LENGTH}
        error={error}
        testID="label-input"
      />
      {suggestions.length > 0 || canCreate ? (
        <View style={[styles.wrap, { columnGap: spacing.sm }]}>
          {suggestions.map((label) => (
            <Chip
              key={label.id}
              label={label.name}
              emoji={labelEmoji(label)}
              variant="suggestion"
              onPress={() => add({ id: label.id, name: label.name, emoji: label.emoji })}
              accessibilityLabel={t.labels.formAdd(label.name)}
              testID={`label-suggestion-${label.name}`}
            />
          ))}
          {canCreate ? (
            <Chip
              label={t.labels.formCreate(typed)}
              emoji={suggestEmoji(typed) ?? undefined}
              icon="plus"
              variant="suggestion"
              onPress={submit}
              testID="label-create"
            />
          ) : null}
        </View>
      ) : null}
      {value.length === 0 && labels.length === 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t.labels.formHelp}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
