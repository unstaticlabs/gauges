import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_LABEL_EMOJI, lastEmoji, SUGGESTED_EMOJI } from '@/domain';
import { t } from '@/i18n';

import { useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Button';

export interface EmojiPickerProps {
  /** The picked emoji, or `null` for none: the label then shows the default. */
  value: string | null;
  onChange: (emoji: string | null) => void;
}

/**
 * A small grid of suggested emoji, and a field for any other emoji from the
 * emoji keyboard of the system. The field keeps one emoji only: the last
 * one that the user typed. It needs no emoji library.
 */
export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const own = value !== null && !SUGGESTED_EMOJI.includes(value) ? value : null;
  const [text, setText] = useState(own ?? '');
  const [error, setError] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t.labels.emoji}>
        {SUGGESTED_EMOJI.map((emoji) => {
          const selected = emoji === value;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={emoji}
              onPress={() => {
                setText('');
                setError(false);
                onChange(selected ? null : emoji);
              }}
              testID={`emoji-${emoji}`}
              style={({ pressed }) => [
                styles.cell,
                {
                  borderRadius: radius.md,
                  backgroundColor: selected ? colors.accentSoft : 'transparent',
                  borderColor: selected ? colors.accent : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.line, { gap: spacing.sm }]}>
        <TextInput
          value={text}
          onChangeText={(next) => {
            const emoji = lastEmoji(next);
            setText(emoji ?? '');
            setError(next.trim().length > 0 && emoji === null);
            if (emoji) onChange(emoji);
          }}
          placeholder={t.labels.emojiOther}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t.labels.emojiOther}
          autoCorrect={false}
          autoCapitalize="none"
          style={[
            typography.body,
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.field,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              borderColor: own ? colors.accent : 'transparent',
            },
          ]}
          testID="emoji-other"
        />
        {value !== null ? (
          <Button
            label={t.labels.emojiDefault(DEFAULT_LABEL_EMOJI)}
            variant="plain"
            onPress={() => {
              setText('');
              setError(false);
              onChange(null);
            }}
            testID="emoji-default"
          />
        ) : null}
      </View>
      {error ? (
        <Text style={[typography.caption, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {t.labels.emojiInvalid}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Six columns, so that the 24 emoji make four full rows on each width.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  cell: {
    width: '16.66%',
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  emoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    // On the web, an input has a default width. Without this, it pushes the button out.
    minWidth: 0,
    minHeight: TOUCH_TARGET,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
});
