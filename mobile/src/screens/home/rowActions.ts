/**
 * The actions that a gauge row offers, by the state of the gauge. They are
 * pure, so that the unit tests can call them.
 *
 * - An active gauge has "Pause" and no "Archive". A pause keeps the gauge
 *   in the lists, so the user does not lose it by mistake.
 * - A paused gauge has "Archive". The user archives a gauge that stays
 *   paused, and the archive moves it out of the lists.
 */

/** An action of a row. "Done" and "Pause" are for an active gauge, "Resume" and "Archive" for a paused gauge. */
export type RowAction = 'done' | 'resume' | 'pause' | 'edit' | 'archive' | 'delete';

/** The action of a swipe to the right: "Done", or "Resume" on a paused row. */
export function swipeRightAction(paused: boolean): 'done' | 'resume' {
  return paused ? 'resume' : 'done';
}

/** The three buttons of a short swipe to the left, from left to right. */
export function swipeLeftActions(paused: boolean): readonly ['delete', 'pause' | 'archive', 'edit'] {
  return ['delete', paused ? 'archive' : 'pause', 'edit'];
}

/**
 * All the actions of a row, in the order of the menu on the website. The
 * screen reader actions of the row use the same list.
 */
export function rowMenuActions(paused: boolean): RowAction[] {
  return paused ? ['resume', 'edit', 'archive', 'delete'] : ['done', 'pause', 'edit', 'delete'];
}
