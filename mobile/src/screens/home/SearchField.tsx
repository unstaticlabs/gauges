import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { t } from '@/i18n';
import { Button, TOUCH_TARGET } from '@/ui/components';
import { Icon } from '@/ui/components/Icon';
import { useTheme } from '@/ui/theme';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Closes the search. The field then shows a "Cancel" button and takes the focus. */
  onCancel?: () => void;
}

/** A rounded search field with a clear button, in the style of the system search bars. */
export function SearchField({ value, onChange, onCancel }: SearchFieldProps) {
  const { colors, radius, spacing, typography } = useTheme();
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
          value={value}
          onChangeText={onChange}
          placeholder={t.home.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t.home.searchPlaceholder}
          accessibilityRole="search"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={onCancel !== undefined}
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
