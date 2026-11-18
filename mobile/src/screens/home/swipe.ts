/**
 * The rules of the swipe on a gauge row, as in a mail app. The functions are
 * worklets, so that the gesture runs them on the UI thread. They are pure,
 * so that the unit tests can call them.
 *
 * - A short swipe to the right shows the "Done" button. A full swipe to the
 *   right marks the gauge done.
 * - A short swipe to the left shows Pause and Edit (Archive in place of
 *   Pause on a paused row, see `rowActions.ts`). A full swipe to the left
 *   opens the gauge page. Delete is on the gauge page only.
 */

/** The width of the "Done" button that a short swipe to the right shows. */
export const DONE_BUTTON_WIDTH = 96;
/** The width of each of the two buttons that a short swipe to the left shows. */
export const ACTION_BUTTON_WIDTH = 76;
export const ACTIONS_WIDTH = ACTION_BUTTON_WIDTH * 2;

/**
 * A horizontal move of this many points starts the swipe. A vertical move of
 * `SWIPE_FAIL_Y` points before that gives the touch to the list, so that a
 * vertical drag always scrolls, also when it is a little diagonal.
 */
export const SWIPE_ACTIVE_X = 14;
export const SWIPE_FAIL_Y = 10;

/** The time that the release speed adds to the position, in seconds. A flick then counts as a longer swipe. */
const TOSS_SECONDS = 0.08;

export type SwipeSide = 'right' | 'left';

/** What a release does with the row. */
export type SwipeOutcome = 'done' | 'showDone' | 'edit' | 'showActions' | 'close';

/** The distance of a full swipe to one side, for a row of `width` points. */
export function fullSwipeDistance(width: number, side: SwipeSide): number {
  'worklet';
  return side === 'right'
    ? Math.max(width * 0.5, DONE_BUTTON_WIDTH + 72)
    : Math.max(width * 0.65, ACTIONS_WIDTH + 48);
}

/**
 * Gives the result of a release. `offset` is the position of the row (more
 * than 0 is to the right), and `velocity` its speed in points per second.
 */
export function settleSwipe(offset: number, velocity: number, width: number): SwipeOutcome {
  'worklet';
  const projected = offset + velocity * TOSS_SECONDS;
  if (projected > 0) {
    if (projected >= fullSwipeDistance(width, 'right')) return 'done';
    return projected > DONE_BUTTON_WIDTH / 2 ? 'showDone' : 'close';
  }
  if (-projected >= fullSwipeDistance(width, 'left')) return 'edit';
  // Half of the two buttons (one button of travel) opens them, as half of
  // the "Done" button opens it on the other side.
  return -projected > ACTIONS_WIDTH / 2 ? 'showActions' : 'close';
}

/** The resting position of the row for an outcome. */
export function restingOffset(outcome: SwipeOutcome): number {
  'worklet';
  if (outcome === 'showDone') return DONE_BUTTON_WIDTH;
  if (outcome === 'showActions') return -ACTIONS_WIDTH;
  return 0;
}
