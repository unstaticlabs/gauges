import { labelAggregate, labelLevel } from './label';
import { isPaused } from './pause';
import { normalizeForSearch } from './search';
import { compareRated, rateGauge } from './sort';
import type { Gauge, Label, LabelId } from './types';

/** One label in the grouped home view. */
export interface LabelGroup {
  label: Label;
  /** The active gauges with this label, in the order of the home list. The paused gauges come last. */
  gauges: Gauge[];
  /**
   * The level of the label in its own mode (see `labelLevel`), or `null`
   * when no gauge counts: no active gauge, or only paused gauges.
   */
  level: number | null;
  /** The number of paused gauges in `gauges`. */
  pausedCount: number;
}

/** Gives the active gauges in the order of the home list. The paused gauges come last. */
function sortedActive(gauges: readonly Gauge[], now: number): Gauge[] {
  return gauges
    .filter((gauge) => gauge.archivedAt === null)
    .map((gauge) => rateGauge(gauge, now))
    .sort(compareRated)
    .map((rated) => rated.gauge);
}

/** Gives the active gauges that carry the label, in the order of the home list. */
export function gaugesOfLabel(labelId: LabelId, gauges: readonly Gauge[], now: number): Gauge[] {
  return sortedActive(
    gauges.filter((gauge) => gauge.labelIds.includes(labelId)),
    now,
  );
}

/** The place of a group in the list: 0 with a level, 1 with only paused gauges, 2 with no gauge. */
function groupRank(group: LabelGroup): number {
  if (group.level !== null) return 0;
  return group.gauges.length > 0 ? 1 : 2;
}

/**
 * Gives one group for each label, the worst level first. Each label uses
 * its own mode (see `aggregateLevels`). A label with only paused gauges
 * comes after the labels with a level, and a label with no active gauge
 * comes last. On a tie, the order is by name, then by ID. A gauge with
 * several labels is in each of their groups.
 */
export function groupByLabel(labels: readonly Label[], gauges: readonly Gauge[], now: number): LabelGroup[] {
  return labels
    .map((label) => {
      const own = gaugesOfLabel(label.id, gauges, now);
      return {
        label,
        gauges: own,
        level: labelLevel(own, now, labelAggregate(label)),
        pausedCount: own.filter(isPaused).length,
      };
    })
    .sort((a, b) => {
      const rank = groupRank(a) - groupRank(b);
      if (rank !== 0) return rank;
      if (a.level !== null && b.level !== null && a.level !== b.level) return a.level - b.level;
      const byName = a.label.name.localeCompare(b.label.name);
      if (byName !== 0) return byName;
      return a.label.id < b.label.id ? -1 : a.label.id > b.label.id ? 1 : 0;
    });
}

/**
 * Gives the active gauges that carry none of the labels in `labels`, in the
 * order of the home list. Give the labels of the user: a gauge can carry a
 * label of another member that the user cannot read. For the user, that
 * gauge has no label.
 */
export function gaugesWithoutLabel(labels: readonly Label[], gauges: readonly Gauge[], now: number): Gauge[] {
  const mine = new Set(labels.map((label) => label.id));
  return sortedActive(
    gauges.filter((gauge) => !gauge.labelIds.some((id) => mine.has(id))),
    now,
  );
}

/**
 * Gives the labels whose name contains the query, with no case and no
 * accents. An empty query gives all the labels.
 */
export function searchLabels<L extends Pick<Label, 'name'>>(labels: readonly L[], query: string): L[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === '') return [...labels];
  return labels.filter((label) => normalizeForSearch(label.name).includes(needle));
}

/**
 * Gives the label with the same name, with no case, no accents, and no
 * spaces around it. The form uses it, so that a typed name does not make a
 * second label with the same name.
 */
export function findLabelByName<L extends Pick<Label, 'name'>>(labels: readonly L[], name: string): L | undefined {
  const needle = normalizeForSearch(name.trim());
  if (needle === '') return undefined;
  return labels.find((label) => normalizeForSearch(label.name.trim()) === needle);
}
