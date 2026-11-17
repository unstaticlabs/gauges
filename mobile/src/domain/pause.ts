import type { Execution, Gauge } from './types';

/**
 * The pause of a gauge. A paused gauge is a chore that does not apply for
 * now, for example out of season. It stays on the lists, but its time
 * stops: the level keeps its value from the start of the pause, and after a
 * resume the gauge empties again from that level.
 *
 * The gauge stores three optional fields (see `Gauge`):
 * - `pausedAt`: the start of the current pause, or `null`.
 * - `pausedMs`: the paused time of the earlier pauses since the last
 *   execution.
 * - `pausedMsSince`: the time of the last execution when the app wrote
 *   `pausedMs`.
 *
 * Two rules keep the fields safe when an app that does not know them
 * writes to the gauge:
 * - An execution after `pausedAt` ends the pause. The gauge is then active,
 *   as if it was resumed at that execution.
 * - `pausedMs` counts only while its execution is still the last one. A new
 *   execution, or a change or a removal of the last execution, drops it.
 */

/** The most paused time that counts: 20 years. `backend/firestore.rules` has the same limit. */
export const PAUSED_MS_MAX = 20 * 365 * 24 * 60 * 60 * 1000;

/** The fields that the pause rules read. */
export type PauseInput = Pick<Gauge, 'executions'> & Partial<Pick<Gauge, 'pausedAt' | 'pausedMs' | 'pausedMsSince'>>;

function lastAt(executions: readonly Execution[]): number | null {
  let last: number | null = null;
  for (const execution of executions) {
    if (last === null || execution.at > last) last = execution.at;
  }
  return last;
}

/**
 * `true` when the gauge is paused: it has a pause start, and no execution
 * is after it. A gauge with no execution can be paused too.
 */
export function isPaused(gauge: PauseInput): boolean {
  const start = gauge.pausedAt;
  if (start == null || !Number.isFinite(start)) return false;
  const last = lastAt(gauge.executions);
  return last === null || last <= start;
}

/** Gives the start of the current pause, or `null` when the gauge is not paused. */
export function pausedSince(gauge: PauseInput): number | null {
  return isPaused(gauge) ? (gauge.pausedAt as number) : null;
}

/**
 * Gives the paused time of the earlier pauses that still counts, in
 * milliseconds. It is 0 when the last execution is not the one that
 * `pausedMs` belongs to. The result is from 0 to `PAUSED_MS_MAX`.
 */
export function countedPausedMs(gauge: PauseInput): number {
  const ms = gauge.pausedMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 0;
  if ((gauge.pausedMsSince ?? null) !== lastAt(gauge.executions)) return 0;
  return Math.min(ms, PAUSED_MS_MAX);
}

/**
 * Gives the time since the last execution that empties the gauge, in
 * milliseconds: the time to `now`, or to the start of the pause, less the
 * paused time. It is never less than 0, also when the clocks of two devices
 * differ. Gives `null` for a gauge with no execution.
 */
export function activeElapsedMs(gauge: PauseInput, now: number): number | null {
  const last = lastAt(gauge.executions);
  if (last === null) return null;
  const end = pausedSince(gauge) ?? now;
  return Math.max(0, end - last - countedPausedMs(gauge));
}

/** The fields that a pause writes. */
export interface PauseChanges {
  pausedAt: number;
}

/** The fields that a resume writes. */
export interface ResumeChanges {
  pausedAt: null;
  pausedMs: number;
  pausedMsSince: number | null;
}

/** Gives the fields that pause the gauge at `now`, or `null` when it is paused already. */
export function pauseChanges(gauge: PauseInput, now: number): PauseChanges | null {
  if (isPaused(gauge)) return null;
  return { pausedAt: now };
}

/**
 * Gives the fields that resume the gauge at `now`, or `null` when it is not
 * paused. The paused time of this pause goes into `pausedMs`. A pause start
 * after `now` (a clock that is ahead on another device) adds nothing.
 */
export function resumeChanges(gauge: PauseInput, now: number): ResumeChanges | null {
  const start = pausedSince(gauge);
  if (start === null) return null;
  const pausedMs = Math.min(PAUSED_MS_MAX, countedPausedMs(gauge) + Math.max(0, now - start));
  return { pausedAt: null, pausedMs, pausedMsSince: lastAt(gauge.executions) };
}
