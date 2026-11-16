import type { Gauge } from './types';
import { gaugeLevel } from './level';

/**
 * Combines the levels of the gauges of one label into one level.
 * The rule: the mean of the worse half, that is the `ceil(n / 2)` lowest
 * levels. Returns `null` for an empty list.
 *
 * Keep this rule in this one function, so that a change of the rule is one edit.
 */
export function aggregateLevels(levels: readonly number[]): number | null {
  if (levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  const worse = sorted.slice(0, Math.ceil(sorted.length / 2));
  return worse.reduce((sum, level) => sum + level, 0) / worse.length;
}

/**
 * Returns the level of a label at the time `now`. Give the gauges of the
 * label. Archived gauges do not count. Returns `null` when no active gauge
 * is left.
 */
export function labelLevel(
  gauges: readonly Pick<Gauge, 'executions' | 'repeatDays' | 'curve' | 'archivedAt'>[],
  now: number,
): number | null {
  const levels = gauges
    .filter((gauge) => gauge.archivedAt === null)
    .map((gauge) => gaugeLevel(gauge, now));
  return aggregateLevels(levels);
}
