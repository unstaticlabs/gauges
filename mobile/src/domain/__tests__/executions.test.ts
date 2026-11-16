import {
  FutureExecutionError,
  addExecution,
  changeExecutionDate,
  removeExecution,
  sortExecutionsNewestFirst,
} from '../executions';
import { DAY_MS } from '../level';

const NOW = Date.UTC(2026, 10, 14, 12);
const base = Object.freeze([
  Object.freeze({ at: NOW - 3 * DAY_MS, by: 'u1' }),
  Object.freeze({ at: NOW - DAY_MS, by: 'u2' }),
]);

describe('addExecution', () => {
  it('adds an execution in the past and does not change the input', () => {
    const result = addExecution(base, { at: NOW - DAY_MS, by: 'u1' }, NOW);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ at: NOW - DAY_MS, by: 'u1' });
    expect(base).toHaveLength(2);
  });

  it('accepts an execution at now', () => {
    expect(addExecution([], { at: NOW, by: 'u1' }, NOW)).toEqual([{ at: NOW, by: 'u1' }]);
  });

  it('refuses an execution in the future', () => {
    expect(() => addExecution(base, { at: NOW + 1, by: 'u1' }, NOW)).toThrow(FutureExecutionError);
  });

  it('does not add the same pair two times', () => {
    expect(addExecution(base, { ...base[0] }, NOW)).toEqual([...base]);
  });
});

describe('changeExecutionDate', () => {
  it('changes the time of one execution', () => {
    const result = changeExecutionDate(base, base[0], NOW - 2 * DAY_MS, NOW);
    expect(result).toEqual([{ at: NOW - 2 * DAY_MS, by: 'u1' }, base[1]]);
  });

  it('refuses a time in the future', () => {
    expect(() => changeExecutionDate(base, base[0], NOW + DAY_MS, NOW)).toThrow(RangeError);
  });

  it('returns an equal list when the execution is not there', () => {
    expect(changeExecutionDate(base, { at: 1, by: 'u9' }, NOW, NOW)).toEqual([...base]);
  });

  it('keeps one execution when the new pair exists already', () => {
    const list = [
      { at: 10, by: 'u1' },
      { at: 20, by: 'u1' },
    ];
    expect(changeExecutionDate(list, list[0], 20, NOW)).toEqual([{ at: 20, by: 'u1' }]);
  });
});

describe('removeExecution', () => {
  it('removes one execution and does not change the input', () => {
    expect(removeExecution(base, { at: base[1].at, by: 'u2' })).toEqual([base[0]]);
    expect(base).toHaveLength(2);
  });

  it('does not remove an execution with the same time by another user', () => {
    expect(removeExecution(base, { at: base[1].at, by: 'u1' })).toEqual([...base]);
  });
});

describe('sortExecutionsNewestFirst', () => {
  it('returns a new list, newest first', () => {
    expect(sortExecutionsNewestFirst(base)).toEqual([base[1], base[0]]);
  });
});
