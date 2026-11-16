import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { getRepository } from '@/data';
import { type Execution, type Gauge, sortExecutionsNewestFirst } from '@/domain';
import { errorMessage, dateLocale, formatDateTime, formatRelative, relativeFormatter, t } from '@/i18n';
import { useProfileNames, useToast } from '@/state';
import { Button, Icon } from '@/ui/components';
import { confirm } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { ExecutionSheet } from './ExecutionSheet';

/** The number of executions the list shows at first, as the old app: the 5 most recent. */
export const HISTORY_FIRST = 5;
/** The number of executions that each "show more" adds. */
export const HISTORY_PAGE = 20;

type SheetState = { kind: 'add'; start: number } | { kind: 'change'; execution: Execution } | null;

export interface HistorySectionProps {
  gauge: Gauge;
  myUid: string;
  now: number;
}

/**
 * The executions of a gauge, the newest first: the 5 most recent, then more
 * on request. The user adds one in the past, or presses one to change its
 * time or to remove it. Each change writes at once.
 */
export function HistorySection({ gauge, myUid, now }: HistorySectionProps) {
  const { colors, spacing, typography } = useTheme();
  const showToast = useToast();
  const [limit, setLimit] = useState(HISTORY_FIRST);
  const [sheet, setSheet] = useState<SheetState>(null);

  const all = sortExecutionsNewestFirst(gauge.executions);
  // The history names the other members, for example "Sam", when their name is known.
  const names = useProfileNames(gauge.members.length > 1 ? gauge.members : []);
  const shown = all.slice(0, limit);
  const hidden = all.length - shown.length;

  const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });

  /** Asks first, then removes the execution. Gives `true` after a removal. */
  const remove = async (execution: Execution): Promise<boolean> => {
    const ok = await confirm({
      title: t.gauge.removeExecutionConfirm,
      message: formatDateTime(execution.at, dateLocale, now),
      confirmLabel: t.gauge.removeExecution,
      cancelLabel: t.common.cancel,
      destructive: true,
    });
    if (ok) getRepository().removeExecution(gauge.id, execution).catch(fail);
    return ok;
  };

  const save = async (at: number) => {
    const repository = getRepository();
    if (sheet?.kind === 'change') {
      // A transaction: it needs a connection, so wait for it and show the error in the sheet.
      try {
        await repository.editExecution(gauge.id, sheet.execution, at);
      } catch (error) {
        throw new Error(errorMessage(error, t, { transaction: true }));
      }
    } else {
      // A plain write: the local cache shows it at once, also offline.
      repository.markDone(gauge.id, at).catch(fail);
    }
    setSheet(null);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text style={[typography.section, styles.title, { color: colors.text }]} accessibilityRole="header">
          {t.gauge.history}
        </Text>
        <Button
          label={t.gauge.addPast}
          variant="plain"
          icon="plus"
          onPress={() => setSheet({ kind: 'add', start: Date.now() })}
          testID="history-add"
        />
      </View>

      <View>
        {shown.length === 0 ? (
          <Text style={[typography.callout, { color: colors.textMuted }]}>{t.gauge.historyEmpty}</Text>
        ) : (
          shown.map((execution, index) => (
            // No fade in or out: a fade starts at opacity 0, and on a slow
            // Android device the row stayed invisible when the fade did not
            // run. The move to a new place is safe: it ends at the layout.
            <Animated.View
              key={`${execution.at}-${execution.by}`}
              layout={LinearTransition.duration(250)}
              style={[
                styles.item,
                { gap: spacing.sm },
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={formatDateTime(execution.at, dateLocale, now)}
                accessibilityHint={t.gauge.changeDateHint}
                onPress={() => setSheet({ kind: 'change', execution })}
                style={({ pressed }) => [styles.itemMain, { paddingVertical: spacing.sm, opacity: pressed ? 0.6 : 1 }]}
                testID={`history-item-${index}`}
              >
                <Text style={[typography.body, { color: colors.text }]}>
                  {formatDateTime(execution.at, dateLocale, now)}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {formatRelative(execution.at, now, t, relativeFormatter)} ·{' '}
                  {execution.by === myUid ? t.gauge.byMe : (names.get(execution.by) ?? t.gauge.bySomeone)}
                </Text>
              </Pressable>
              <Icon name="chevronRight" color={colors.textMuted} size={18} />
            </Animated.View>
          ))
        )}
      </View>

      {hidden > 0 ? (
        <Button
          label={t.gauge.showMore(Math.min(hidden, HISTORY_PAGE))}
          variant="plain"
          style={styles.start}
          onPress={() => setLimit((n) => n + HISTORY_PAGE)}
        />
      ) : null}

      <ExecutionSheet
        key={sheet === null ? 'closed' : sheet.kind === 'change' ? `change-${sheet.execution.at}` : `add-${sheet.start}`}
        visible={sheet !== null}
        title={sheet?.kind === 'change' ? t.gauge.changeDate : t.gauge.addPast}
        initial={sheet === null ? 0 : sheet.kind === 'change' ? sheet.execution.at : sheet.start}
        onCancel={() => setSheet(null)}
        onSave={save}
        onRemove={
          sheet?.kind === 'change'
            ? async () => {
                const removed = await remove(sheet.execution);
                if (removed) setSheet(null);
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
  },
  start: {
    alignSelf: 'flex-start',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemMain: {
    flex: 1,
    gap: 2,
  },
});
