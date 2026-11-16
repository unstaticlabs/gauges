import type { Execution, UserId } from './types';

/**
 * Identifies one execution by the pair `at` + `by`. Two executions by the
 * same user at the same millisecond count as one execution. The helpers
 * below never create such a pair.
 */
export type ExecutionRef = Pick<Execution, 'at' | 'by'>;

/** The error for an execution time after `now`. */
export class FutureExecutionError extends RangeError {
  constructor(at: number, now: number) {
    super(`The execution time ${at} is after now (${now}).`);
    this.name = 'FutureExecutionError';
  }
}

function sameExecution(a: ExecutionRef, b: ExecutionRef): boolean {
  return a.at === b.at && a.by === b.by;
}

function checkNotFuture(at: number, now: number): void {
  if (!Number.isFinite(at) || at > now) throw new FutureExecutionError(at, now);
}

/** Returns a new list, newest first. The function does not change the input. */
export function sortExecutionsNewestFirst(executions: readonly Execution[]): Execution[] {
  return [...executions].sort((a, b) => b.at - a.at || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0));
}

/**
 * Returns a new list with one more execution at the time `at` by `by`.
 * Use a time in the past for "done yesterday".
 * - Throws `FutureExecutionError` when `at` is after `now`.
 * - Returns a copy of the list without a change when the same pair exists.
 */
export function addExecution(
  executions: readonly Execution[],
  execution: { at: number; by: UserId },
  now: number,
): Execution[] {
  checkNotFuture(execution.at, now);
  if (executions.some((item) => sameExecution(item, execution))) return [...executions];
  return [...executions, { at: execution.at, by: execution.by }];
}

/**
 * Returns a new list where the execution `ref` has the time `at`.
 * - Throws `FutureExecutionError` when `at` is after `now`.
 * - Returns a copy without a change when `ref` is not in the list. The data
 *   can change on another device before the user acts.
 * - When the new pair exists already, the result keeps one of the two.
 */
export function changeExecutionDate(
  executions: readonly Execution[],
  ref: ExecutionRef,
  at: number,
  now: number,
): Execution[] {
  checkNotFuture(at, now);
  const index = executions.findIndex((item) => sameExecution(item, ref));
  if (index === -1) return [...executions];
  const moved: Execution = { at, by: ref.by };
  const rest = executions.filter((_, i) => i !== index);
  if (rest.some((item) => sameExecution(item, moved))) return rest;
  return executions.map((item, i) => (i === index ? moved : item));
}

/**
 * Returns a new list without the execution `ref`. Returns a copy without a
 * change when `ref` is not in the list.
 */
export function removeExecution(executions: readonly Execution[], ref: ExecutionRef): Execution[] {
  return executions.filter((item) => !sameExecution(item, ref));
}
