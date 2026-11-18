import { type Curve, curveFill, EMPTY_AFTER_FACTOR, type Gauge } from '@/domain';

/** The quick choices of the interval control, in days. */
export const INTERVAL_PRESETS: readonly number[] = [1, 2, 3, 7, 14, 30];

/** `true` when the interval control shows `days` as a quick choice. */
export function isPreset(days: number): boolean {
  return INTERVAL_PRESETS.includes(days);
}

/**
 * Reads the free number of days. Returns `null` unless the text is a whole
 * number from 1 to `max`. Spaces around the number are allowed.
 */
export function parseDays(text: string, max: number): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= 1 && days <= max ? days : null;
}

/** The values of the gauge form. `repeatDays` is `null` when the free number is not valid. */
export interface GaugeFormValues {
  name: string;
  repeatDays: number | null;
  curve: Curve;
}

export interface GaugeFormLimits {
  nameMax: number;
}

export type GaugeFormErrors = Partial<Record<'name' | 'repeatDays', 'required' | 'tooLong' | 'invalid'>>;

/** Checks the form. Returns an empty object when the values are valid. */
export function validateGaugeForm(values: GaugeFormValues, limits: GaugeFormLimits): GaugeFormErrors {
  const errors: GaugeFormErrors = {};
  const name = values.name.trim();
  if (name.length === 0) errors.name = 'required';
  else if (name.length > limits.nameMax) errors.name = 'tooLong';
  if (values.repeatDays === null) errors.repeatDays = 'invalid';
  return errors;
}

/** Gives the form values of an existing gauge. */
export function valuesFromGauge(gauge: Pick<Gauge, 'name' | 'repeatDays' | 'curve'>): GaugeFormValues {
  return { name: gauge.name, repeatDays: gauge.repeatDays, curve: gauge.curve };
}

/**
 * Gives the number of days after an execution until the level of a gauge
 * is `level` or lower, with the curve and the interval of the form. The
 * preview uses it to say when the gauge turns red.
 */
export function daysUntilLevel(curve: Curve, repeatDays: number, level: number): number {
  const target = level / 100;
  // `curveFill` goes down from 1 to 0, so a binary search finds the time.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (curveFill(curve, mid) > target) low = mid;
    else high = mid;
  }
  return high * Math.max(1, repeatDays) * EMPTY_AFTER_FACTOR;
}

/** A label in the form. `id` is `null` for a name that the user typed and that no label has yet. */
export interface LabelChoice {
  id: string | null;
  name: string;
  /** The emoji of the label, or the suggested emoji of a new name. */
  emoji?: string;
}

/** The most labels on one gauge. The same limit as `uniqueList(d.labelIds, 20)` in the rules. */
export const MAX_LABELS = 20;

/**
 * Gives the label choices of a gauge: the labels of the user that are on the
 * gauge. A label of another member that the user cannot read stays out of
 * the form, so the form does not change it.
 */
export function choicesFromGauge(
  gauge: { labelIds: readonly string[] } | null,
  labels: readonly { id: string; name: string; emoji?: string }[],
): LabelChoice[] {
  if (!gauge) return [];
  return labels
    .filter((l) => gauge.labelIds.includes(l.id))
    .map((l) => (l.emoji ? { id: l.id, name: l.name, emoji: l.emoji } : { id: l.id, name: l.name }));
}

/** Gives the labels to add and to remove. New names are in `create`. */
export function labelChanges(
  before: readonly LabelChoice[],
  after: readonly LabelChoice[],
): { add: string[]; remove: string[]; create: { name: string; emoji: string | null }[] } {
  const beforeIds = new Set(before.flatMap((c) => (c.id ? [c.id] : [])));
  const afterIds = new Set(after.flatMap((c) => (c.id ? [c.id] : [])));
  return {
    add: [...afterIds].filter((id) => !beforeIds.has(id)),
    remove: [...beforeIds].filter((id) => !afterIds.has(id)),
    create: after.filter((c) => c.id === null).map((c) => ({ name: c.name.trim(), emoji: c.emoji ?? null })),
  };
}

/** `true` when the form has a label change to save. */
export function hasLabelChanges(before: readonly LabelChoice[], after: readonly LabelChoice[]): boolean {
  const { add, remove, create } = labelChanges(before, after);
  return add.length + remove.length + create.length > 0;
}
