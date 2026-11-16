import { Text, View } from 'react-native';

import type { DeviceData, MergeChoice } from '@/data';
import { t } from '@/i18n';
import { Button, Sheet } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface MergeSheetProps {
  data: DeviceData | null;
  onChoose: (choice: MergeChoice) => void;
}

/** The one question before a login to an existing account, when the phone has data. */
export function MergeSheet({ data, onChoose }: MergeSheetProps) {
  const { colors, spacing, typography } = useTheme();
  const title = data && data.gauges > 0 ? t.account.mergeTitle(data.gauges) : t.account.mergeTitleLabels;
  return (
    <Sheet visible={data !== null} title={title} onClose={() => onChoose('cancel')} testID="merge-sheet">
      <Text style={[typography.callout, { color: colors.textMuted }]}>{t.account.mergeBody}</Text>
      <View style={{ gap: spacing.sm }}>
        <Button label={t.account.mergeAdd} onPress={() => onChoose('merge')} testID="merge-add" />
        <Button
          label={t.account.mergeDiscard}
          variant="danger"
          onPress={() => onChoose('discard')}
          accessibilityHint={t.account.mergeDiscardHelp}
          testID="merge-discard"
        />
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          {t.account.mergeDiscardHelp}
        </Text>
        <Button label={t.common.cancel} variant="plain" onPress={() => onChoose('cancel')} testID="merge-cancel" />
      </View>
    </Sheet>
  );
}
