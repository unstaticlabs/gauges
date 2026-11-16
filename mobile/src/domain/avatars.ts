import type { Execution, Gauge, Label, UserId } from './types';

/**
 * Orders the members by their most recent execution, the most recent first.
 * Each member is in the result one time. Members with no execution come
 * last, in the order of `members`. Executions by users that are not members
 * do not count.
 */
export function orderMembersByRecentExecution(
  members: readonly UserId[],
  executions: readonly Execution[],
): UserId[] {
  const latest = new Map<UserId, number>();
  for (const execution of executions) {
    const previous = latest.get(execution.by);
    if (previous === undefined || execution.at > previous) latest.set(execution.by, execution.at);
  }
  const unique = [...new Set(members)];
  const position = new Map(unique.map((member, index) => [member, index]));
  return unique.sort((a, b) => {
    const atA = latest.get(a) ?? Number.NEGATIVE_INFINITY;
    const atB = latest.get(b) ?? Number.NEGATIVE_INFINITY;
    if (atA !== atB) return atB > atA ? 1 : -1;
    return (position.get(a) ?? 0) - (position.get(b) ?? 0);
  });
}

/** Returns the members of a gauge in the order of the avatars. */
export function gaugeAvatarOrder(gauge: Pick<Gauge, 'members' | 'executions'>): UserId[] {
  return orderMembersByRecentExecution(gauge.members, gauge.executions);
}

/**
 * Returns the members of a label in the order of the avatars. The order
 * uses the executions of each gauge that has this label. Other gauges in
 * the list do not count.
 */
export function labelAvatarOrder(
  label: Pick<Label, 'id' | 'members'>,
  gauges: readonly Pick<Gauge, 'labelIds' | 'executions'>[],
): UserId[] {
  const executions = gauges
    .filter((gauge) => gauge.labelIds.includes(label.id))
    .flatMap((gauge) => gauge.executions);
  return orderMembersByRecentExecution(label.members, executions);
}
