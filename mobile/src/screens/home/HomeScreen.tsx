import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  activeGauges,
  compareRated,
  gaugesWithoutLabel,
  type Gauge,
  groupByLabel,
  isPaused,
  labelAvatarOrder,
  labelEmoji,
  labelLevel,
  type LabelGroup,
  lowCount,
  NO_LABEL_EMOJI,
  rateGauge,
  searchGauges,
  searchLabels,
} from '@/domain';
import { t } from '@/i18n';
import { useGauges, useHomeView, useLabels, useMyName, useNow } from '@/state';
import { useAndroidKeyboardHeight } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { LabelCard } from '../labels/LabelCard';
import { StatusView } from '../StatusView';
import { AddGaugeRow } from './AddGaugeRow';
import { EmptyHome } from './EmptyHome';
import { EmptyState } from './EmptyState';
import { GaugeList } from './GaugeList';
import { HomeHeader } from './HomeHeader';
import { closeOpenRow } from './openRow';
import { SearchField } from './SearchField';

/** The widest the list gets on a large screen, so that the rows stay readable. */
const MAX_WIDTH = 640;

type Row = { gauge: Gauge; level: number };

/** Gives the active gauges as rows, the worst first and the paused gauges last, filtered by the query. */
function rowsFor(gauges: readonly Gauge[], now: number, query: string): Row[] {
  const rated = activeGauges(gauges).map((gauge) => rateGauge(gauge, now));
  rated.sort(compareRated);
  const visible = new Set(searchGauges(rated.map((r) => r.gauge), query).map((g) => g.id));
  return rated.filter((r) => visible.has(r.gauge.id));
}

/**
 * The home screen. It shows all active gauges, the worst first, or one row
 * for each label. The toggle at the top right switches the view, and the
 * device remembers it. The search opens from the icon at the top left.
 * "Add a gauge" is at the end of the list, also during a search.
 *
 * The two views stay mounted after the first time they show, and the
 * toggle only hides one. A new mount of 35 gauge rows took 2 seconds on the
 * Android emulator.
 */
export function HomeScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow();
  const gauges = useGauges();
  const { name } = useMyName();
  const { view, setView } = useHomeView();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const grouped = view === 'labels';
  const [labelsMounted, setLabelsMounted] = useState(grouped);
  if (grouped && !labelsMounted) setLabelsMounted(true);

  const rows = useMemo(() => rowsFor(gauges.items, now, query), [gauges.items, now, query]);
  const allRows = useMemo(() => rowsFor(gauges.items, now, ''), [gauges.items, now]);
  // The greeting counts the red gauges. Paused gauges do not count.
  const low = useMemo(() => lowCount(gauges.items, now), [gauges.items, now]);

  const addGauge = useCallback(() => router.push('/gauge/new'), [router]);
  const openSettings = useCallback(() => router.push('/settings'), [router]);
  const toggleSearch = useCallback(() => {
    // A close also closes the keyboard. On Android, the keyboard can stay
    // open after its field goes away.
    if (searchOpen) Keyboard.dismiss();
    setSearchOpen((open) => !open);
    setQuery('');
  }, [searchOpen]);
  const keyboardHeight = useAndroidKeyboardHeight();
  // An open row closes when the user leaves the screen.
  useFocusEffect(useCallback(() => () => closeOpenRow(), []));

  if (gauges.status === 'loading') return <StatusView kind="loading" />;
  if (gauges.status === 'error' && gauges.items.length === 0) {
    return <StatusView kind="error" title={t.app.loadError} onRetry={gauges.retry} />;
  }

  const hasActive = allRows.length > 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // With the search keyboard open, the user can still scroll to the end
      // of the list and to "Add a gauge". iOS adds the inset itself. Android
      // draws edge to edge, so it gets the keyboard height as padding.
      automaticallyAdjustKeyboardInsets
      onScrollBeginDrag={() => closeOpenRow()}
      contentContainerStyle={[
        styles.content,
        // Room for the toast below the last row.
        { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xxxl * 2 + keyboardHeight },
      ]}
    >
      <View style={[styles.column, { gap: spacing.lg }]}>
        {/* The icon buttons have a 44 pt target, so the edge is closer: the icons line up with the text below. */}
        <View style={{ gap: spacing.md, paddingLeft: insets.left + spacing.sm, paddingRight: insets.right + spacing.sm }}>
          <HomeHeader
            name={name ?? null}
            total={allRows.length}
            low={low}
            grouped={grouped}
            onGroupedChange={(next) => setView(next ? 'labels' : 'all')}
            searching={searchOpen}
            onSearch={toggleSearch}
            onSettings={openSettings}
          />
          {searchOpen && hasActive ? (
            <Animated.View entering={FadeIn.duration(180)} style={{ paddingHorizontal: spacing.md }}>
              <SearchField value={query} onChange={setQuery} onCancel={toggleSearch} />
            </Animated.View>
          ) : null}
        </View>

        {!hasActive ? (
          <EmptyHome onAdd={addGauge} />
        ) : (
          <View>
            <View style={grouped ? styles.hidden : undefined}>
              {rows.length === 0 ? (
                <EmptyState title={t.home.noResultTitle} body={t.home.noResultBody(query.trim())} />
              ) : (
                <GaugeList rows={rows} now={now} hint />
              )}
            </View>
            {labelsMounted ? (
              <View style={grouped ? undefined : styles.hidden}>
                <LabelView query={query} rows={rows} now={now} onShowAll={() => setView('all')} />
              </View>
            ) : null}
            <AddGaugeRow name={query} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

interface LabelViewProps {
  query: string;
  /** The gauge rows that match the query, for a search in this view. */
  rows: Row[];
  now: number;
  onShowAll: () => void;
}

/**
 * The view by label: one row for each label, the worst first, and a last
 * row for the gauges with no label. A search shows the labels whose name
 * matches, then the gauges whose name matches.
 */
function LabelView({ query, rows, now, onShowAll }: LabelViewProps) {
  const { colors, spacing, typography } = useTheme();
  const router = useRouter();
  const gauges = useGauges();
  const labels = useLabels();

  const groups = useMemo(() => groupByLabel(labels.items, gauges.items, now), [labels.items, gauges.items, now]);
  const unlabeled = useMemo(
    () => gaugesWithoutLabel(labels.items, gauges.items, now),
    [labels.items, gauges.items, now],
  );
  const searching = query.trim().length > 0;
  const shownGroups = useMemo(
    () => (searching ? searchLabels(groups.map((g) => ({ ...g, name: g.label.name })), query) : groups),
    [groups, query, searching],
  );

  if (labels.status === 'loading') return null;
  if (labels.items.length === 0 && !searching) {
    return (
      <EmptyState
        title={t.home.noLabelsTitle}
        body={t.home.noLabelsBody}
        actionLabel={t.home.noLabelsAction}
        onAction={onShowAll}
      />
    );
  }

  const separator = <View style={[styles.separator, { backgroundColor: colors.border, marginLeft: spacing.page + 52 }]} />;
  const cards = (
    <View>
      {shownGroups.map((group, index) => (
        <View key={group.label.id}>
          {index > 0 ? separator : null}
          <GroupCard group={group} onOpen={() => router.push(`/label/${group.label.id}`)} />
        </View>
      ))}
      {!searching && unlabeled.length > 0 ? (
        <>
          {shownGroups.length > 0 ? separator : null}
          <LabelCard
            name={t.labels.noLabel}
            emoji={NO_LABEL_EMOJI}
            level={labelLevel(unlabeled, now)}
            count={unlabeled.length}
            pausedCount={unlabeled.filter(isPaused).length}
            members={[]}
            muted
            onPress={() => router.push('/unlabeled')}
            testID="label-card-none"
          />
        </>
      ) : null}
    </View>
  );

  if (!searching) return cards;
  if (shownGroups.length === 0 && rows.length === 0) {
    return <EmptyState title={t.home.noResultTitle} body={t.home.noResultBodyLabels(query.trim())} />;
  }
  const title = (text: string) => (
    <Text
      style={[typography.section, { color: colors.textMuted, paddingHorizontal: spacing.page, paddingBottom: spacing.xs }]}
      accessibilityRole="header"
    >
      {text}
    </Text>
  );
  return (
    <View style={{ gap: spacing.lg }}>
      {shownGroups.length > 0 ? (
        <View>
          {title(t.home.labelsSection)}
          {cards}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View>
          {title(t.home.gaugesSection)}
          <GaugeList rows={rows} now={now} />
        </View>
      ) : null}
    </View>
  );
}

function GroupCard({ group, onOpen }: { group: LabelGroup; onOpen: () => void }) {
  const gauges = useGauges();
  const members = useMemo(
    () => (group.label.members.length > 1 ? labelAvatarOrder(group.label, gauges.items) : []),
    [group.label, gauges.items],
  );
  return (
    <LabelCard
      name={group.label.name}
      emoji={labelEmoji(group.label)}
      level={group.level}
      count={group.gauges.length}
      pausedCount={group.pausedCount}
      members={members}
      onPress={onOpen}
      testID={`label-card-${group.label.name}`}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: MAX_WIDTH,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  hidden: {
    display: 'none',
  },
});
