import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { displayLevel, type Gauge as GaugeData, gaugeAvatarOrder } from '@/domain';
import { formatLastDone, relativeFormatter, t } from '@/i18n';
import { Gauge, Icon, IconButton, type IconName, Sheet } from '@/ui/components';
import { doneHaptic, selectionHaptic } from '@/ui/platform';
import { useTheme } from '@/ui/theme';

import { MemberAvatars } from '../labels/MemberAvatars';
import { DoneBurst } from './DoneBurst';
import { anyRowOpen, closeOpenRow, rowClosed, rowOpened } from './openRow';
import { type RowAction, rowMenuActions, swipeLeftActions, swipeRightAction } from './rowActions';
import {
  ACTION_BUTTON_WIDTH,
  DONE_BUTTON_WIDTH,
  fullSwipeDistance,
  restingOffset,
  settleSwipe,
  SWIPE_ACTIVE_X,
  SWIPE_FAIL_Y,
  type SwipeOutcome,
} from './swipe';
import type { GaugeActions } from './useGaugeActions';

/** The time of the fill animation before the app writes the execution. */
export const DONE_ANIMATION_MS = 700;
/** The time the row keeps the done look. Then it moves to its new place. */
const DONE_HOLD_MS = 1600;
const SNAP = { duration: 180 };
/**
 * The colors of the buttons that a swipe to the left shows. They are the
 * same in light and dark mode, so that the white text keeps a contrast of
 * 4.5:1 or more.
 */
const ACTION_COLORS = { delete: '#D92D50', pause: '#6B6B6B', archive: '#6B6B6B', edit: '#0A6FD6' } as const;
const IS_WEB = Platform.OS === 'web';

export interface GaugeRowProps {
  gauge: GaugeData;
  /** The level, rounded to a whole number, so that the row renders again only for a visible change. */
  level: number;
  /** The last execution as text, for example "Done 2 days ago", or "Paused since 3 Oct" for a paused gauge. */
  lastText: string;
  /**
   * `true` for a paused gauge: the row is grey, and the swipe to the right
   * resumes the gauge in place of "Done".
   */
  paused?: boolean;
  /** Called after the fill animation, with the time of the action. */
  onDone: (gauge: GaugeData, at: number) => void;
  actions: GaugeActions;
  /** Called after the first swipe that does something. The home screen then stops the hint. */
  onSwiped?: () => void;
  /** Plays the swipe hint one time: the row opens a little to the right, then to the left. */
  peek?: boolean;
}

/** The label and the icon of each action, for the swipe buttons, the menu, and screen readers. */
function actionLabel(action: RowAction): string {
  if (action === 'done') return t.home.markDone;
  if (action === 'resume') return t.home.resume;
  if (action === 'pause') return t.home.pause;
  if (action === 'edit') return t.home.edit;
  if (action === 'archive') return t.home.archive;
  return t.home.delete;
}

const ACTION_ICONS: Record<RowAction, IconName> = {
  done: 'check',
  resume: 'play',
  pause: 'pause',
  edit: 'edit',
  archive: 'archive',
  delete: 'trash',
};

/**
 * One gauge in a list: the name, the last execution and the interval, then
 * the bar. The swipe works as in a mail app (see `swipe.ts`): to the right
 * for "Done", to the left for Edit, Pause, and Delete. A tap on the row
 * does nothing, except that it closes an open row. Screen readers get the
 * same actions on the row (see `rowActions.ts`). The website also shows a
 * small menu button, for a mouse and a keyboard.
 *
 * A paused row is grey: a grey bar at its frozen level, a muted name, and
 * "Paused since …". It has no "Done": the swipe to the right resumes it.
 * Its swipe to the left shows Archive in place of Pause.
 */
export const GaugeRow = memo(function GaugeRow({
  gauge,
  level,
  lastText,
  paused = false,
  onDone,
  actions,
  onSwiped,
  peek = false,
}: GaugeRowProps) {
  const { colors, spacing, typography } = useTheme();
  const id = useId();
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const offset = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const width = useSharedValue(0);
  const pastFull = useSharedValue(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!peek) return;
    offset.set(
      withDelay(
        700,
        withSequence(
          withTiming(DONE_BUTTON_WIDTH, { duration: 380 }),
          withDelay(600, withTiming(0, { duration: 300 })),
          withDelay(250, withTiming(-ACTION_BUTTON_WIDTH * 2, { duration: 380 })),
          withDelay(600, withTiming(0, { duration: 300 })),
        ),
      ),
    );
  }, [peek, offset]);

  const close = useCallback(() => {
    offset.set(withTiming(0, SNAP));
    rowClosed(id);
  }, [id, offset]);

  const markDone = () => {
    if (doneAt !== null) return;
    const at = Date.now();
    setDoneAt(at);
    doneHaptic();
    timers.current.push(
      setTimeout(() => onDone(gauge, at), DONE_ANIMATION_MS),
      setTimeout(() => setDoneAt(null), DONE_HOLD_MS),
    );
  };

  const run = (action: RowAction) => {
    close();
    if (action === 'done') markDone();
    else if (action === 'resume') actions.resume(gauge);
    else if (action === 'pause') actions.pause(gauge);
    else if (action === 'edit') actions.edit(gauge);
    else if (action === 'archive') actions.archive(gauge);
    else void actions.remove(gauge);
  };

  // The gesture runs on the UI thread. It calls back into React through this
  // one stable function, which reads the newest props from a ref.
  const latest = useRef({ run, close, onSwiped, gauge, actions, paused });
  useLayoutEffect(() => {
    latest.current = { run, close, onSwiped, gauge, actions, paused };
  });
  const onGesture = useCallback(
    (event: 'dragStart' | SwipeOutcome) => {
      const current = latest.current;
      if (event === 'dragStart') {
        closeOpenRow(id);
        return;
      }
      if (event !== 'close') current.onSwiped?.();
      if (event === 'showDone' || event === 'showActions') rowOpened(id, current.close);
      else if (event === 'close') rowClosed(id);
      else if (event === 'done') {
        // A full swipe to the right: "Done", or "Resume" on a paused row.
        rowClosed(id);
        current.run(swipeRightAction(current.paused));
      } else {
        // A full swipe to the left: the row slides out, the gauge page opens,
        // and the row comes back while the page covers it.
        rowClosed(id);
        current.actions.edit(current.gauge);
        setTimeout(() => offset.set(0), 450);
      }
    },
    [id, offset],
  );

  const pan = usePanGesture(
    useMemo(
      () => ({
        // The website: the browser keeps the vertical pan, so the list scrolls.
        // The detector prop alone is not enough: in gesture-handler 3.3 on the
        // web, the hook sets the config again after the detector attaches, and
        // that reset drops the `touchAction` of the detector ('none' then).
        touchAction: 'pan-y' as const,
        activeOffsetX: [-SWIPE_ACTIVE_X, SWIPE_ACTIVE_X] as [number, number],
        failOffsetY: [-SWIPE_FAIL_Y, SWIPE_FAIL_Y] as [number, number],
        onActivate: () => {
          'worklet';
          dragStart.set(offset.get());
          scheduleOnRN(onGesture, 'dragStart');
        },
        onUpdate: (event: { translationX: number }) => {
          'worklet';
          const w = width.get();
          const next = Math.max(-w, Math.min(w, dragStart.get() + event.translationX));
          offset.set(next);
          const past = next >= fullSwipeDistance(w, 'right') || -next >= fullSwipeDistance(w, 'left');
          if (past !== pastFull.get()) {
            pastFull.set(past);
            if (past) scheduleOnRN(selectionHaptic);
          }
        },
        onDeactivate: (event: { translationX: number; velocityX: number; canceled: boolean }) => {
          'worklet';
          pastFull.set(false);
          // The end event has the whole move. Under load, the first gesture
          // after the start of the app lost its update events on the Android
          // emulator, so the row then read an offset of about 0.
          const w = width.get();
          const end = Math.max(-w, Math.min(w, dragStart.get() + event.translationX));
          const outcome: SwipeOutcome = event.canceled ? 'close' : settleSwipe(end, event.velocityX, w);
          if (outcome === 'edit') {
            offset.set(withTiming(-width.get(), { duration: 160 }));
          } else {
            offset.set(withTiming(restingOffset(outcome), SNAP));
          }
          scheduleOnRN(onGesture, outcome);
        },
      }),
      [dragStart, offset, onGesture, pastFull, width],
    ),
  );

  // While a row is open, a tap on any row closes it. The tap is off while no
  // row is open, so that it costs nothing.
  const tap = useTapGesture(
    useMemo(
      () => ({
        touchAction: 'pan-y' as const,
        enabled: anyRowOpen,
        onActivate: () => {
          'worklet';
          scheduleOnRN(closeOpenRow);
        },
      }),
      [],
    ),
  );

  const done = doneAt !== null;
  const shownLevel = done ? 100 : level;
  const shownLast = done ? formatLastDone(doneAt, doneAt, t, relativeFormatter) : lastText;
  const members = useMemo(() => (gauge.members.length > 1 ? gaugeAvatarOrder(gauge) : []), [gauge]);

  const frontStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));

  const rowActions = rowMenuActions(paused).map((name) => ({ name, label: actionLabel(name) }));

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
    >
      <DonePanel offset={offset} resume={paused} onPress={() => run(swipeRightAction(paused))} />
      <ActionsPanel offset={offset} width={width} paused={paused} onAction={run} />
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={[styles.front, { backgroundColor: colors.background }, frontStyle]}>
          <GestureDetector gesture={tap} touchAction="pan-y">
            <View
              accessible
              accessibilityLabel={`${gauge.name}, ${displayLevel(shownLevel)}%, ${shownLast}, ${t.time.every(gauge.repeatDays)}`}
              accessibilityHint={IS_WEB ? undefined : paused ? t.home.rowHintPaused : t.home.rowHint}
              accessibilityActions={rowActions}
              onAccessibilityAction={(event) => {
                const name = event.nativeEvent.actionName;
                const action = rowActions.find((item) => item.name === name);
                if (action) run(action.name);
              }}
              style={{ paddingHorizontal: spacing.page, paddingVertical: spacing.md, gap: spacing.xs }}
              testID={`gauge-row-${gauge.name}`}
            >
              <View style={[styles.line, { gap: spacing.sm }]}>
                <Text
                  style={[typography.name, styles.grow, { color: paused ? colors.textMuted : colors.text }]}
                  numberOfLines={2}
                >
                  {gauge.name}
                </Text>
                {members.length > 0 ? (
                  <MemberAvatars ids={members} size={22} ringColor={colors.background} testID={`avatars-${gauge.name}`} />
                ) : null}
                {done ? (
                  <Animated.View
                    entering={ZoomIn.springify().damping(12)}
                    exiting={ZoomOut.duration(160)}
                    style={[styles.badge, { backgroundColor: colors.gauge.green }]}
                    testID={`done-badge-${gauge.name}`}
                  >
                    <Icon name="check" color={colors.textOnGreen} size={15} strokeWidth={3} />
                  </Animated.View>
                ) : null}
              </View>
              <View style={[styles.line, { gap: spacing.sm }]}>
                <Text style={[typography.caption, styles.grow, { color: colors.textMuted }]} numberOfLines={1}>
                  {shownLast}
                </Text>
                <View style={[styles.line, { gap: spacing.xxs }]}>
                  <Icon name="repeat" color={colors.textMuted} size={13} />
                  <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {t.time.days(gauge.repeatDays)}
                  </Text>
                </View>
              </View>
              <View style={[styles.barLine, { gap: spacing.xs, marginTop: spacing.xs }]}>
                <View style={styles.grow}>
                  <Gauge level={shownLevel} paused={paused && !done} />
                  {done ? <DoneBurst /> : null}
                </View>
                {IS_WEB ? (
                  <IconButton
                    icon="more"
                    label={t.home.rowActions(gauge.name)}
                    color={colors.textMuted}
                    onPress={() => setMenuOpen(true)}
                    style={styles.more}
                    testID={`row-menu-${gauge.name}`}
                  />
                ) : null}
              </View>
            </View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
      {menuOpen ? (
        <RowMenu
          title={gauge.name}
          paused={paused}
          onClose={() => setMenuOpen(false)}
          onAction={(action) => {
            setMenuOpen(false);
            run(action);
          }}
        />
      ) : null}
    </View>
  );
});

/**
 * The panel behind the row, on the left. A short swipe leaves its button
 * open: a green "Done", or a blue "Resume" on a paused row.
 */
function DonePanel({ offset, resume, onPress }: { offset: SharedValue<number>; resume: boolean; onPress: () => void }) {
  const { colors, spacing, typography } = useTheme();
  const style = useAnimatedStyle(() => ({
    opacity: offset.get() > 0.5 ? 1 : 0,
    width: Math.max(0, offset.get()),
  }));
  const background = resume ? colors.accent : colors.gauge.green;
  const foreground = resume ? colors.textOnAccent : colors.textOnGreen;
  return (
    <Animated.View style={[styles.leftPanel, { backgroundColor: background }, style]}>
      <Pressable
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={onPress}
        style={[styles.doneButton, { gap: spacing.xs }]}
        testID={resume ? 'row-resume' : 'row-done'}
      >
        {resume ? (
          <Icon name="play" color={foreground} size={22} strokeWidth={2.25} />
        ) : (
          <Icon name="check" color={foreground} size={22} strokeWidth={2.75} />
        )}
        <Text style={[typography.captionStrong, { color: foreground }]}>
          {resume ? t.home.swipeResume : t.home.swipeDone}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The three buttons behind the row, on the right: Delete, Pause, and Edit,
 * or Delete, Archive, and Edit on a paused row. They grow with the swipe.
 * Past the full swipe, Edit takes the whole width, to show that the
 * release opens the gauge page.
 */
function ActionsPanel({
  offset,
  width,
  paused,
  onAction,
}: {
  offset: SharedValue<number>;
  width: SharedValue<number>;
  paused: boolean;
  onAction: (action: RowAction) => void;
}) {
  const [, middle] = swipeLeftActions(paused);
  const full = useDerivedValue(() =>
    withTiming(-offset.get() >= fullSwipeDistance(width.get(), 'left') ? 1 : 0, { duration: 140 }),
  );
  const panelStyle = useAnimatedStyle(() => ({
    opacity: offset.get() < -0.5 ? 1 : 0,
    width: Math.max(0, -offset.get()),
  }));
  const sideStyle = useAnimatedStyle(() => ({ flexGrow: 1 - full.get(), opacity: 1 - full.get() }));
  const editStyle = useAnimatedStyle(() => ({ flexGrow: 1 + 2 * full.get() }));
  return (
    <Animated.View style={[styles.rightPanel, panelStyle]}>
      <ActionButton icon="trash" label={t.home.delete} color={ACTION_COLORS.delete} style={sideStyle} onPress={() => onAction('delete')} testID="row-delete" />
      <ActionButton icon={ACTION_ICONS[middle]} label={actionLabel(middle)} color={ACTION_COLORS[middle]} style={sideStyle} onPress={() => onAction(middle)} testID={`row-${middle}`} />
      <ActionButton icon="edit" label={t.home.edit} color={ACTION_COLORS.edit} style={editStyle} onPress={() => onAction('edit')} testID="row-edit" />
    </Animated.View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  style,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  color: string;
  style: ReturnType<typeof useAnimatedStyle>;
  onPress: () => void;
  testID: string;
}) {
  const { spacing, typography } = useTheme();
  return (
    <Animated.View style={[styles.actionCell, { backgroundColor: color }, style]}>
      <Pressable
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPress={onPress}
        style={[styles.actionButton, { gap: spacing.xs }]}
        testID={testID}
      >
        <Icon name={icon} color="#FFFFFF" size={20} />
        <Text style={[typography.captionStrong, styles.actionText]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The menu of a row on the website: the same actions as the swipe, and
 * "Mark as done" or "Resume", for a mouse and a keyboard. An active row has
 * "Pause". A paused row has "Resume" and "Archive".
 */
function RowMenu({
  title,
  paused,
  onClose,
  onAction,
}: {
  title: string;
  paused: boolean;
  onClose: () => void;
  onAction: (action: RowAction) => void;
}) {
  const { colors, spacing, typography } = useTheme();
  const items = rowMenuActions(paused).map((action) => ({
    action,
    icon: ACTION_ICONS[action],
    label: actionLabel(action),
    color: action === 'delete' ? colors.danger : colors.text,
  }));
  return (
    <Sheet visible title={title} onClose={onClose} testID="row-menu">
      <View>
        {items.map((item) => (
          <Pressable
            key={item.action}
            accessibilityRole="button"
            onPress={() => onAction(item.action)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
              styles.menuItem,
              { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : hovered ? 0.8 : 1 },
            ]}
            testID={`row-menu-${item.action}`}
          >
            <Icon name={item.icon} color={item.color} size={20} />
            <Text style={[typography.body, { color: item.color }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  front: {
    zIndex: 1,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grow: {
    flex: 1,
  },
  more: {
    // The button keeps its 44 pt target, but it takes no extra height in the row.
    marginVertical: -15,
    marginRight: -12,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  doneButton: {
    width: DONE_BUTTON_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightPanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  actionCell: {
    flexBasis: 0,
    overflow: 'hidden',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
