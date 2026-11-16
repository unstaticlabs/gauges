import { type ComponentRef, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { t } from '@/i18n';
import { Button, TOUCH_TARGET } from '@/ui/components';
import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Closes the search. The field then shows a "Cancel" button, and takes
   * the focus when it appears, so that the keyboard opens at once.
   */
  onCancel?: () => void;
}

/** A rounded search field with a clear button, in the style of the system search bars. */
export function SearchField({ value, onChange, onCancel }: SearchFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const focusOnMount = onCancel !== undefined;

  // `autoFocus` alone does not work here: the field appears inside an
  // entering animation, and an early focus call has no effect (no keyboard
  // on the phone, no caret on the web). So try again on the next frames
  // until the field has the focus, for at most about half a second.
  useEffect(() => {
    if (!focusOnMount) return;
    let tries = 0;
    let frame = 0;
    const tryFocus = () => {
      const field = input.current;
      field?.focus();
      tries += 1;
      if (!field?.isFocused() && tries < 30) frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [focusOnMount]);

  return (
    <View style={[styles.line, { gap: spacing.xs }]}>
      <View
        style={[
          styles.field,
          { backgroundColor: colors.field, borderRadius: radius.md, paddingLeft: spacing.sm, gap: spacing.xs },
        ]}
      >
        <Icon name="search" color={colors.textMuted} size={18} />
        <TextInput
          ref={input}
          value={value}
          onChangeText={onChange}
          placeholder={t.home.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t.home.searchPlaceholder}
          accessibilityRole="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
          returnKeyType="search"
          enterKeyHint="search"
          style={[typography.body, styles.input, { color: colors.text }]}
          testID="search"
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.home.clearSearch}
            onPress={() => onChange('')}
            style={styles.clear}
            hitSlop={4}
          >
            <View style={[styles.clearDot, { backgroundColor: colors.textMuted }]}>
              <Icon name="close" color={colors.field} size={12} strokeWidth={3} />
            </View>
          </Pressable>
        ) : null}
      </View>
      {onCancel ? <Button label={t.common.cancel} variant="plain" onPress={onCancel} testID="search-cancel" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET - 4,
  },
  input: {
    flex: 1,
    // On the web, an input has a default width. Without this, it pushes the buttons out.
    minWidth: 0,
    paddingVertical: 8,
    // Removes the focus ring of the browser. The field has its own background.
    outlineStyle: 'none',
  } as object,
  clear: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
