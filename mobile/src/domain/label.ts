import type { Gauge, Label, LabelAggregate } from './types';
import { gaugeLevel } from './level';
import { isPaused, type PauseInput } from './pause';

/** The modes of a label level, in the order of the picker. */
export const LABEL_AGGREGATES: readonly LabelAggregate[] = ['worst', 'lowerHalf', 'median', 'average'];

/** The mode of a label with no `aggregate` field. */
export const DEFAULT_LABEL_AGGREGATE: LabelAggregate = 'lowerHalf';

/** Gives the mode of the label. A label with no mode uses the default. */
export function labelAggregate(label: Pick<Label, 'aggregate'>): LabelAggregate {
  return label.aggregate ?? DEFAULT_LABEL_AGGREGATE;
}

/**
 * Gives the levels that count for a mode, as a range of positions in the
 * levels sorted from low to high: `start` is included, `end` is not. Each
 * mode is the mean of one such range.
 * - `worst`: the lowest level.
 * - `lowerHalf`: the `ceil(n / 2)` lowest levels.
 * - `median`: the middle level, or the two middle levels for an even count.
 * - `average`: all levels.
 *
 * For `count` 0, the range is empty.
 */
export function countedRange(count: number, mode: LabelAggregate): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 };
  switch (mode) {
    case 'worst':
      return { start: 0, end: 1 };
    case 'lowerHalf':
      return { start: 0, end: Math.ceil(count / 2) };
    case 'median':
      return count % 2 === 1
        ? { start: (count - 1) / 2, end: (count + 1) / 2 }
        : { start: count / 2 - 1, end: count / 2 + 1 };
    case 'average':
      return { start: 0, end: count };
  }
}

/**
 * Combines the levels of the gauges of one label into one level, with the
 * mode of the label (see `countedRange`). The default mode is `lowerHalf`.
 * Returns `null` for an empty list.
 *
 * The result is not rounded. The screens round it with `displayLevel`.
 * The function does not change the input list.
 */
export function aggregateLevels(
  levels: readonly number[],
  mode: LabelAggregate = DEFAULT_LABEL_AGGREGATE,
): number | null {
  if (levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  const { start, end } = countedRange(sorted.length, mode);
  const counted = sorted.slice(start, end);
  return counted.reduce((sum, level) => sum + level, 0) / counted.length;
}

/**
 * Picks the gauges that a small drawing of a label shows, when the label
 * has more gauges than the drawing has room for. Give the number of gauges
 * and the room. Gives positions in the levels sorted from low to high, in
 * order. The same positions serve all modes, so that the drawings of the
 * modes are easy to compare.
 *
 * The positions always include the lowest and the highest level, the middle
 * levels (for `median`), and the two sides of the lower half (for
 * `lowerHalf`). Evenly spaced positions fill the rest of the room.
 */
export function previewPositions(count: number, room: number): number[] {
  if (count <= room) return Array.from({ length: Math.max(0, count) }, (_, i) => i);
  const half = Math.ceil(count / 2);
  const median = countedRange(count, 'median');
  const picked = new Set<number>([0, count - 1, half - 1, half]);
  for (let i = median.start; i < median.end; i += 1) picked.add(i);
  for (let i = 0; i < room && picked.size < room; i += 1) {
    picked.add(Math.round((i * (count - 1)) / (room - 1)));
  }
  for (let i = 0; i < count && picked.size < room; i += 1) picked.add(i);
  return [...picked].sort((a, b) => a - b);
}

/** The fields of a gauge that the level of a label reads. */
export type LabelLevelInput = Pick<Gauge, 'repeatDays' | 'curve' | 'archivedAt'> & PauseInput;

/**
 * Gives the levels of the gauges that count for the level of a label, in
 * the same order: archived and paused gauges do not count.
 */
export function countedLevels(gauges: readonly LabelLevelInput[], now: number): number[] {
  return gauges
    .filter((gauge) => gauge.archivedAt === null && !isPaused(gauge))
    .map((gauge) => gaugeLevel(gauge, now));
}

/**
 * Returns the level of a label at the time `now`. Give the gauges of the
 * label and the mode of the label. Archived and paused gauges do not count.
 * Returns `null` when no such gauge is left, for example when all gauges
 * are paused.
 */
export function labelLevel(
  gauges: readonly LabelLevelInput[],
  now: number,
  mode: LabelAggregate = DEFAULT_LABEL_AGGREGATE,
): number | null {
  return aggregateLevels(countedLevels(gauges, now), mode);
}
