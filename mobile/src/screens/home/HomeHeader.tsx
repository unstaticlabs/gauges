import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { Icon, IconButton, type IconName, TOUCH_TARGET } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export interface HomeHeaderProps {
  /** The name of the user, or `null` when they have none. */
  name: string | null;
  /** The number of active gauges, and of gauges that are red. */
  total: number;
  low: number;
  /** `true` when the home screen shows one row for each label. */
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
  searching: boolean;
  onSearch: () => void;
  onSettings: () => void;
}

/**
 * The top of the home screen: small actions at the top right, then the big
 * greeting of the old app. The greeting states a fact, for example "Hey
 * Sam, 2 gauges are low." The name opens Settings, as in the old app.
 */
export function HomeHeader({
  name,
  total,
  low,
  grouped,
  onGroupedChange,
  searching,
  onSearch,
  onSettings,
}: HomeHeaderProps) {
  const { colors, spacing, typography } = useTheme();
  const status = total === 0 ? null : t.home.lowStatus(low);
  return (
    <View style={{ gap: spacing.sm }}>
      {/*
        The parent leaves 8 pt at the sides, so that a plain icon lines up
        with the text. "Add a gauge" is at the end of the list.
      */}
      <View style={[styles.actions, { gap: spacing.xxs }]}>
        {total > 0 ? (
          <IconButton
            icon="search"
            label={t.home.search}
            selected={searching}
            onPress={onSearch}
            testID="open-search"
          />
        ) : null}
        <View style={styles.grow} />
        {total > 0 ? <ViewToggle grouped={grouped} onChange={onGroupedChange} /> : null}
        <IconButton icon="settings" label={t.home.settings} onPress={onSettings} testID="open-settings" />
      </View>
      {status ? (
        <Text style={[typography.greeting, styles.greeting, { color: colors.text }]} accessibilityRole="header" testID="greeting">
          {name ? (
            <>
              {t.home.hey}{' '}
              <Text style={{ color: colors.accent }} onPress={onSettings} accessibilityRole="link">
                {name}
              </Text>
              , {status}
            </>
          ) : (
            t.home.statusAlone(status)
          )}
        </Text>
      ) : null}
    </View>
  );
}

/** The small switch between all gauges and the labels, at the top right. */
function ViewToggle({ grouped, onChange }: { grouped: boolean; onChange: (grouped: boolean) => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[styles.toggle, { backgroundColor: colors.field, borderRadius: radius.full, padding: spacing.xxs, marginRight: spacing.xs }]}
      accessibilityRole="toolbar"
      accessibilityLabel={t.home.viewLabel}
    >
      <Segment icon="list" label={t.home.viewAll} selected={!grouped} onPress={() => onChange(false)} testID="view-all" />
      <Segment icon="group" label={t.home.viewLabels} selected={grouped} onPress={() => onChange(true)} testID="group-toggle" />
    </View>
  );
}

function Segment({
  icon,
  label,
  selected,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={onPress}
      testID={testID}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.segment,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colors.background : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
        selected && styles.selectedShadow,
      ]}
    >
      <Icon name={icon} color={selected ? colors.accent : colors.textMuted} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
  },
  grow: {
    flex: 1,
  },
  greeting: {
    maxWidth: 380,
    paddingHorizontal: 12,
  },
  toggle: {
    flexDirection: 'row',
  },
  segment: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
