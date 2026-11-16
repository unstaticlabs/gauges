import type { Gauge } from './types';
import { gaugeLevel, lastExecutionAt } from './level';

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

/** A gauge with its level at one time and the time of its last execution. */
export interface RatedGauge<G> {
  gauge: G;
  level: number;
  lastAt: number;
}

/** Returns the gauge with its level at the time `now`. */
export function rateGauge<G extends Gauge>(gauge: G, now: number): RatedGauge<G> {
  return { gauge, level: gaugeLevel(gauge, now), lastAt: lastExecutionAt(gauge) };
}

/** Compares two rated gauges in the order of the home list. */
export function compareRated<G extends Pick<Gauge, 'id' | 'name'>>(
  a: RatedGauge<G>,
  b: RatedGauge<G>,
): number {
  if (a.level !== b.level) return a.level - b.level;
  if (a.lastAt !== b.lastAt) return a.lastAt < b.lastAt ? -1 : 1;
  const byName = a.gauge.name.localeCompare(b.gauge.name);
  if (byName !== 0) return byName;
  return a.gauge.id < b.gauge.id ? -1 : a.gauge.id > b.gauge.id ? 1 : 0;
}
