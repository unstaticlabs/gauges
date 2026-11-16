import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '@/ui/theme';

export interface SectionProps {
  title?: string;
  children: ReactNode;
}

/**
 * A titled group of controls. The title is short and bold, as the questions
 * on the forms of the old app. There is no box around the group.
 */
export function Section({ title, children }: SectionProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <Text style={[typography.section, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
