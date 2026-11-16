import { useState } from 'react';
import { Text } from 'react-native';

import { NAME_MAX_LENGTH } from '@/data';
import { errorMessage, t } from '@/i18n';
import { Button, Sheet, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface NameSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}

/**
 * Asks for the name of the user before a share or a join, because other
 * members see it. Mount it when it opens, so that it starts empty.
 */
export function NameSheet({ visible, onClose, onSave }: NameSheetProps) {
  const { colors, typography } = useTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title={t.name.title} onClose={onClose} testID="name-sheet">
      <Text style={[typography.callout, { color: colors.textMuted }]}>{t.name.bodyShare}</Text>
      <TextField
        label={t.name.field}
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="words"
        autoComplete="name"
        maxLength={NAME_MAX_LENGTH}
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
        testID="name-sheet-field"
      />
      <Button label={t.name.save} onPress={save} disabled={!valid} busy={busy} testID="name-sheet-save" />
    </Sheet>
  );
}
