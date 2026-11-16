import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';

import { useTheme } from '../theme';
import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Puts the content in a scroll view, for content that can be taller than the screen. */
  scrollable?: boolean;
  testID?: string;
  children: ReactNode;
}

/** A card that comes up from the bottom of the screen, above a dim layer. */
export function Sheet({ visible, title, onClose, scrollable = false, testID, children }: SheetProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.layer}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        />
        <View
          accessibilityViewIsModal
          testID={testID}
          style={[
            styles.card,
            scrollable && styles.tall,
            {
              backgroundColor: colors.surfaceRaised,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
              paddingBottom: insets.bottom + spacing.xl,
              gap: spacing.lg,
            },
          ]}
        >
          <View style={[styles.header, { gap: spacing.sm }]}>
            <Text style={[typography.heading, styles.title, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
            <IconButton
              icon="close"
              label={t.common.close}
              variant="tinted"
              onPress={onClose}
              style={styles.close}
              testID="sheet-close"
            />
          </View>
          {scrollable ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={{ gap: spacing.lg }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 560,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
  // The button keeps its 44 point target, but does not make the header taller.
  close: {
    marginVertical: -10,
    marginRight: -8,
  },
  tall: {
    maxHeight: '92%',
  },
  scroll: {
    flexGrow: 0,
  },
});
