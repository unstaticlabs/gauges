import { labelLevel } from './label';
import { normalizeForSearch } from './search';
import { compareRated, rateGauge } from './sort';
import type { Gauge, Label, LabelId } from './types';

/** One label in the grouped home view. */
export interface LabelGroup {
  label: Label;
  /** The active gauges with this label, in the order of the home list. */
  gauges: Gauge[];
  /** The level of the label (see `labelLevel`), or `null` with no active gauge. */
  level: number | null;
}

/** Gives the active gauges in the order of the home list. */
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

/**
 * Gives one group for each label, the worst level first. A label with no
 * active gauge comes last. On a tie, the order is by name, then by ID.
 * A gauge with several labels is in each of their groups.
 */
export function groupByLabel(labels: readonly Label[], gauges: readonly Gauge[], now: number): LabelGroup[] {
  return labels
    .map((label) => {
      const own = gaugesOfLabel(label.id, gauges, now);
      return { label, gauges: own, level: labelLevel(own, now) };
    })
    .sort((a, b) => {
      if (a.level !== b.level) {
        if (a.level === null) return 1;
        if (b.level === null) return -1;
        return a.level - b.level;
      }
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
