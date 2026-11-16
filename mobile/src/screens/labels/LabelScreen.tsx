import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  gaugeLevel,
  gaugesOfLabel,
  gaugesWithoutLabel,
  type Gauge as GaugeData,
  type Label,
  labelAvatarOrder,
  labelAggregate,
  labelEmoji,
  labelLevel,
} from '@/domain';
import { t } from '@/i18n';
import { useGauges, useLabels, useNow, useToast } from '@/state';
import { Gauge, Icon, IconButton } from '@/ui/components';
import { useTheme } from '@/ui/theme';

import { AddGaugeRow } from '../home/AddGaugeRow';
import { EmptyState } from '../home/EmptyState';
import { GaugeList } from '../home/GaugeList';
import { closeOpenRow } from '../home/openRow';
import { ShareSheet } from '../share/ShareSheet';
import { useNameGate } from '../share/useNameGate';
import { StatusView } from '../StatusView';
import { LabelActionsSheet, type LabelSheetTab } from './LabelActionsSheet';
import { MemberAvatars } from './MemberAvatars';

const MAX_WIDTH = 640;
/** After a join, the label can take a moment to reach the live list. */
const JOIN_WAIT_MS = 15 * 1000;

/** The gauges of one label, with its aggregated gauge, its members, and the share action. */
export function LabelScreen({ id, justJoined = false }: { id: string; justJoined?: boolean }) {
  const labels = useLabels();
  const label = labels.items.find((l) => l.id === id);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!justJoined || label) return;
    const timer = setTimeout(() => setWaited(true), JOIN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [justJoined, label]);

  if (!label) {
    const waiting = labels.status === 'loading' || (justJoined && !waited);
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        {waiting ? (
          <StatusView kind="loading" title={justJoined ? t.labels.waitingForLabel : undefined} />
        ) : (
          <StatusView kind="message" title={t.labels.notFound} />
        )}
      </>
    );
  }
  return <LabelPage label={label} justJoined={justJoined} />;
}

function LabelPage({ label, justJoined }: { label: Label; justJoined: boolean }) {
  const router = useRouter();
  const showToast = useToast();

  useEffect(() => {
    if (justJoined) showToast({ message: t.join.joined(label.name) });
    // Greet one time, when the page opens after a join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const now = useNow();
  const gauges = useGauges();
  const [sharing, setSharing] = useState(false);
  /** The part of the edit sheet that is open, or `null` when it is closed. */
  const [managing, setManaging] = useState<LabelSheetTab | null>(null);
  const mode = labelAggregate(label);
  const { gate, sheet: nameSheet } = useNameGate();

  const own = useMemo(() => gaugesOfLabel(label.id, gauges.items, now), [label.id, gauges.items, now]);
  const members = useMemo(
    () => (label.members.length > 1 ? labelAvatarOrder(label, gauges.items) : []),
    [label, gauges.items],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: `${labelEmoji(label)} ${label.name}`,
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton
                icon="share"
                label={t.labels.shareLabel(label.name)}
                onPress={() => gate(() => setSharing(true))}
                testID="label-share"
              />
              <IconButton icon="edit" label={t.labels.edit(label.name)} onPress={() => setManaging('name')} testID="label-more" />
            </View>
          ),
        }}
      />
      <GaugesPage
        gauges={own}
        level={labelLevel(own, now, mode)}
        members={members}
        emptyTitle={t.labels.pageEmptyTitle}
        emptyBody={t.labels.pageEmptyBody}
        labelId={label.id}
        levelLine={t.labels.levelLine(t.labels.levelModes[mode].line)}
        onLevelLine={() => setManaging('level')}
      />
      {sharing ? <ShareSheet label={label} visible onClose={() => setSharing(false)} /> : null}
      {managing ? (
        <LabelActionsSheet
          label={label}
          visible
          initialTab={managing}
          onClose={() => setManaging(null)}
          onGone={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      ) : null}
      {nameSheet}
    </>
  );
}

/** The active gauges that carry none of the labels of the user. */
export function UnlabeledScreen() {
  const now = useNow();
  const gauges = useGauges();
  const labels = useLabels();
  const own = useMemo(() => gaugesWithoutLabel(labels.items, gauges.items, now), [labels.items, gauges.items, now]);
  return (
    <>
      <Stack.Screen options={{ title: t.labels.noLabel }} />
      <GaugesPage
        gauges={own}
        level={labelLevel(own, now)}
        members={[]}
        emptyTitle={t.labels.unlabeledEmpty}
        emptyBody=""
      />
    </>
  );
}

interface GaugesPageProps {
  gauges: GaugeData[];
  level: number | null;
  members: readonly string[];
  emptyTitle: string;
  emptyBody: string;
  /** The label that a new gauge from this page gets. */
  labelId?: string;
  /** A quiet line below the bar that names the level mode, and the action that opens it. */
  levelLine?: string;
  onLevelLine?: () => void;
}

/** The summary of a group of gauges, then its rows, then "Add a gauge". */
function GaugesPage({ gauges, level, members, emptyTitle, emptyBody, labelId, levelLine, onLevelLine }: GaugesPageProps) {
  const { colors, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const rows = useMemo(() => gauges.map((gauge) => ({ gauge, level: gaugeLevel(gauge, now) })), [gauges, now]);
  const page = { paddingLeft: insets.left + spacing.page, paddingRight: insets.right + spacing.page };
  // An open row closes when the user leaves the screen.
  useFocusEffect(useCallback(() => () => closeOpenRow(), []));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      onScrollBeginDrag={() => closeOpenRow()}
      contentContainerStyle={[
        styles.content,
        { paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.xxxl * 2 },
      ]}
    >
      <View style={[styles.column, { gap: spacing.lg }]}>
        <View style={[page, { gap: spacing.sm }]}>
          <View style={[styles.summaryLine, { gap: spacing.sm }]}>
            <Text style={[typography.callout, styles.flex, { color: colors.textMuted }]}>
              {gauges.length === 0 ? t.labels.noGauges : t.labels.gaugeCount(gauges.length)}
            </Text>
            {members.length > 0 ? (
              <MemberAvatars ids={members} size={26} ringColor={colors.background} testID="label-avatars" />
            ) : null}
          </View>
          <Gauge level={level ?? 0} height={18} />
          {levelLine && onLevelLine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t.labels.levelLineHint}
              onPress={onLevelLine}
              hitSlop={8}
              testID="label-level-line"
              style={({ pressed }) => [styles.levelLine, { gap: spacing.xxs, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[typography.caption, { color: colors.textMuted }]}>{levelLine}</Text>
              <Icon name="chevronRight" color={colors.textMuted} size={14} />
            </Pressable>
          ) : null}
        </View>

        {rows.length === 0 ? (
          <EmptyState title={emptyTitle} body={emptyBody} />
        ) : (
          <GaugeList rows={rows} now={now} />
        )}

        <AddGaugeRow labelId={labelId} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
  },
  levelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 24,
  },
});
