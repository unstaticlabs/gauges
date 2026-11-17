import type { Curve, Execution, Gauge } from './types';
import { activeElapsedMs, type PauseInput } from './pause';
import { clampLevel } from './tone';

/** The length of one day in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A gauge is empty at this multiple of its interval. The old app used 1.2,
 * so a gauge with `repeatDays: 10` is empty after 12 days.
 */
export const EMPTY_AFTER_FACTOR = 1.2;

/** The list of curves, in the order the edit screen shows them. */
export const CURVES: readonly Curve[] = ['linear', 'late', 'ease'];

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * Returns the part of the gauge that is empty, from 0 to 1, for a time
 * `x` from 0 (just done) to 1 (empty). Values of `x` outside 0 to 1 are
 * clamped.
 */
export function curveDrop(curve: Curve, x: number): number {
  const t = clamp01(x);
  switch (curve) {
    case 'linear':
      return t;
    case 'late':
      return t ** 4;
    case 'ease':
      return 3 * t ** 2 - 2 * t ** 3;
  }
}

/** Returns the part of the gauge that is full, from 0 to 1: `1 - drop`. */
export function curveFill(curve: Curve, x: number): number {
  return 1 - curveDrop(curve, x);
}

export interface CurvePoint {
  /** The time, from 0 (just done) to 1 (empty). */
  x: number;
  /** The fill, from 1 (full) to 0 (empty). */
  y: number;
}

/**
 * Returns `count` points of a curve at equal steps of `x` from 0 to 1.
 * The edit screen uses them to draw a small preview. `count` is 2 or more.
 */
export function sampleCurve(curve: Curve, count = 21): CurvePoint[] {
  const n = Math.max(2, Math.floor(count));
  const points: CurvePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = i / (n - 1);
    points.push({ x, y: curveFill(curve, x) });
  }
  return points;
}

/** Returns the execution with the highest `at`, or `null` if there is none. */
export function lastExecution(executions: readonly Execution[]): Execution | null {
  let last: Execution | null = null;
  for (const execution of executions) {
    if (last === null || execution.at > last.at) last = execution;
  }
  return last;
}

/**
 * Returns the time of the last execution, or `-Infinity` if there is none.
 * `-Infinity` sorts as the oldest time.
 */
export function lastExecutionAt(gauge: Pick<Gauge, 'executions'>): number {
  return lastExecution(gauge.executions)?.at ?? Number.NEGATIVE_INFINITY;
}

/**
 * Returns the level of a gauge at the time `now`, from 0 (empty) to 100
 * (full). The result is not rounded. A gauge with no execution has level 0.
 * A paused gauge keeps the level of the start of its pause, and the paused
 * time does not count after a resume (see `pause.ts`).
 */
export function gaugeLevel(gauge: Pick<Gauge, 'repeatDays' | 'curve'> & PauseInput, now: number): number {
  const elapsed = activeElapsedMs(gauge, now);
  if (elapsed === null) return 0;
  const emptyAfterMs = Math.max(1, gauge.repeatDays) * EMPTY_AFTER_FACTOR * DAY_MS;
  const x = clamp01(elapsed / emptyAfterMs);
  return 100 * curveFill(gauge.curve, x);
}

/** Rounds a level to a whole number from 0 to 100, for display. */
export function displayLevel(level: number): number {
  return Math.round(clampLevel(level));
}
