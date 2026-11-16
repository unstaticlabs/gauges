import type { Execution, Gauge, Label } from './types';

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameExecutions(a: readonly Execution[], b: readonly Execution[]): boolean {
  return a.length === b.length && a.every((value, index) => value.at === b[index].at && value.by === b[index].by);
}

/** `true` when two gauges have the same values. */
export function sameGauge(a: Gauge, b: Gauge): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.repeatDays === b.repeatDays &&
    a.curve === b.curve &&
    a.createdBy === b.createdBy &&
    a.archivedAt === b.archivedAt &&
    a.createdAt === b.createdAt &&
    sameStrings(a.labelIds, b.labelIds) &&
    sameStrings(a.members, b.members) &&
    sameStrings(a.mutedBy, b.mutedBy) &&
    sameExecutions(a.executions, b.executions)
  );
}

/** `true` when two labels have the same values. */
export function sameLabel(a: Label, b: Label): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.emoji === b.emoji &&
    a.aggregate === b.aggregate &&
    a.createdBy === b.createdBy &&
    a.createdAt === b.createdAt &&
    sameStrings(a.members, b.members) &&
    sameStrings(a.gaugeIds, b.gaugeIds)
  );
}

/**
 * Gives `next`, but with the objects of `previous` for each item that did
 * not change. Each snapshot of the database makes new objects for all
 * items. With the old objects, a memoized row renders again only when its
 * own gauge changed. Gives `previous` itself when nothing changed.
 */
export function reuseUnchanged<T extends { id: string }>(
  previous: readonly T[],
  next: readonly T[],
  same: (a: T, b: T) => boolean,
): T[] {
  const old = new Map(previous.map((item) => [item.id, item]));
  let changed = previous.length !== next.length;
  const result = next.map((item, index) => {
    const before = old.get(item.id);
    if (before && same(before, item)) {
      if (previous[index] !== before) changed = true;
      return before;
    }
    changed = true;
    return item;
  });
  return changed ? result : (previous as T[]);
}
