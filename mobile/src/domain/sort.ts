import type { Gauge } from './types';
import { gaugeLevel, lastExecutionAt } from './level';
import { isPaused } from './pause';
import { isRed } from './tone';

/** Returns the gauges that are not archived, in the same order. */
export function activeGauges<G extends Pick<Gauge, 'archivedAt'>>(gauges: readonly G[]): G[] {
  return gauges.filter((gauge) => gauge.archivedAt === null);
}

/** Returns the archived gauges, in the same order. */
export function archivedGauges<G extends Pick<Gauge, 'archivedAt'>>(gauges: readonly G[]): G[] {
  return gauges.filter((gauge) => gauge.archivedAt !== null);
}

/** Splits the gauges into active and archived gauges, in the same order. */
export function splitByArchive<G extends Pick<Gauge, 'archivedAt'>>(
  gauges: readonly G[],
): { active: G[]; archived: G[] } {
  return { active: activeGauges(gauges), archived: archivedGauges(gauges) };
}

/**
 * Returns a new list of the gauges in the order of the home list:
 * - the active gauges first, then the paused gauges by name;
 * - the lowest level first;
 * - on a tie, the oldest last execution first (no execution is oldest);
 * - on a tie, by name, then by ID, so that the order is stable.
 *
 * The function does not change the input list.
 */
export function sortGaugesForHome<G extends Gauge>(gauges: readonly G[], now: number): G[] {
  return gauges
    .map((gauge) => rateGauge(gauge, now))
    .sort(compareRated)
    .map((entry) => entry.gauge);
}

/** A gauge with its level at one time, the time of its last execution, and its pause. */
export interface RatedGauge<G> {
  gauge: G;
  level: number;
  lastAt: number;
  /** `true` when the gauge is paused. A list shows the paused gauges last. */
  paused: boolean;
}

/** Returns the gauge with its level at the time `now`. */
export function rateGauge<G extends Gauge>(gauge: G, now: number): RatedGauge<G> {
  return { gauge, level: gaugeLevel(gauge, now), lastAt: lastExecutionAt(gauge), paused: isPaused(gauge) };
}

/**
 * Compares two rated gauges in the order of the home list. The paused
 * gauges come after all active gauges, in the order of their names.
 */
export function compareRated<G extends Pick<Gauge, 'id' | 'name'>>(
  a: RatedGauge<G>,
  b: RatedGauge<G>,
): number {
  if (a.paused !== b.paused) return a.paused ? 1 : -1;
  if (!a.paused) {
    if (a.level !== b.level) return a.level - b.level;
    if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? -1 : 1;
  }
  const byName = a.gauge.name.localeCompare(b.gauge.name);
  if (byName !== 0) return byName;
  return a.gauge.id < b.gauge.id ? -1 : a.gauge.id > b.gauge.id ? 1 : 0;
}

/**
 * Gives the number of gauges that are low at the time `now`, for the
 * greeting of the home screen: active gauges that are red. Archived and
 * paused gauges do not count.
 */
export function lowCount(gauges: readonly Gauge[], now: number): number {
  const counts = (gauge: Gauge) => gauge.archivedAt === null && !isPaused(gauge) && isRed(gaugeLevel(gauge, now));
  return gauges.filter(counts).length;
}
