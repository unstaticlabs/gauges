import { DataError } from '../repository';
import { gaugeFromDoc, labelFromDoc, newGaugeDoc, readTime } from '../mapping';

const ts = (ms: number) => ({ toMillis: () => ms });

describe('mapping', () => {
  it('reads a gauge document and converts timestamps to milliseconds', () => {
    const g = gaugeFromDoc('g1', {
      name: 'Plants',
      repeatDays: 3,
      curve: 'late',
      labelIds: ['L1'],
      members: ['alice', 'bob'],
      createdBy: 'alice',
      executions: [{ at: ts(1000), by: 'bob' }, { at: 'bad', by: 'x' }],
      archivedAt: null,
      mutedBy: ['bob'],
      createdAt: ts(500),
      joinVia: 'L1',
    });
    expect(g).toEqual({
      id: 'g1',
      name: 'Plants',
      repeatDays: 3,
      curve: 'late',
      labelIds: ['L1'],
      members: ['alice', 'bob'],
      createdBy: 'alice',
      executions: [{ at: 1000, by: 'bob' }],
      archivedAt: null,
      mutedBy: ['bob'],
      createdAt: 500,
    });
  });

  it('gives defaults for missing fields', () => {
    const l = labelFromDoc('L1', {});
    expect(l).toEqual({ id: 'L1', name: '', members: [], gaugeIds: [], createdBy: '', createdAt: 0 });
    expect(readTime(undefined)).toBeNull();
    expect(readTime(42)).toBe(42);
  });

  it('reads the emoji of a label only when it is one emoji', () => {
    expect(labelFromDoc('L1', { emoji: '🪴' }).emoji).toBe('🪴');
    expect(labelFromDoc('L1', { emoji: null })).not.toHaveProperty('emoji');
    expect(labelFromDoc('L1', { emoji: 'Home' })).not.toHaveProperty('emoji');
    expect(labelFromDoc('L1', { emoji: 5 })).not.toHaveProperty('emoji');
  });

  it('builds a new gauge with only the creator as member', () => {
    const doc = newGaugeDoc({ name: '  Plants ', repeatDays: 2, curve: 'ease' }, 'alice', 7, (ms) => ({ ms }));
    expect(doc).toMatchObject({ name: 'Plants', members: ['alice'], createdBy: 'alice', createdAt: { ms: 7 } });
  });

  it('refuses an invalid name, repeatDays, or curve', () => {
    const make = (input: object) => () =>
      newGaugeDoc({ name: 'A', repeatDays: 1, curve: 'linear', ...input }, 'u', 0, (ms) => ms);
    expect(make({ name: ' ' })).toThrow(DataError);
    expect(make({ name: 'x'.repeat(61) })).toThrow(DataError);
    expect(make({ repeatDays: 0 })).toThrow(DataError);
    expect(make({ curve: 'square' })).toThrow(DataError);
  });
});
