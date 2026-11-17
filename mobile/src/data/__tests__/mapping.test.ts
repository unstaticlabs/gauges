import { DataError } from '../repository';
import { checkAggregate, gaugeFromDoc, labelFromDoc, newGaugeDoc, pauseToDoc, readTime } from '../mapping';

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

  it('reads the pause fields, and ignores missing and invalid values', () => {
    const base = { name: 'Fertilize', executions: [{ at: ts(1000), by: 'bob' }] };
    expect(gaugeFromDoc('g1', { ...base, pausedAt: ts(2000), pausedMs: 300, pausedMsSince: ts(1000) })).toMatchObject({
      pausedAt: 2000,
      pausedMs: 300,
      pausedMsSince: 1000,
    });
    const missing = gaugeFromDoc('g1', base);
    expect('pausedAt' in missing || 'pausedMs' in missing || 'pausedMsSince' in missing).toBe(false);
    const invalid = gaugeFromDoc('g1', { ...base, pausedAt: 'soon', pausedMs: -5, pausedMsSince: {} });
    expect('pausedAt' in invalid || 'pausedMs' in invalid || 'pausedMsSince' in invalid).toBe(false);
    expect(gaugeFromDoc('g1', { ...base, pausedAt: null, pausedMs: '5', pausedMsSince: null })).not.toHaveProperty('pausedMs');
    expect(gaugeFromDoc('g1', { ...base, pausedMs: Number.POSITIVE_INFINITY })).not.toHaveProperty('pausedMs');
  });

  it('writes a pause and a resume with timestamps', () => {
    const stamp = (ms: number) => `ts:${ms}`;
    expect(pauseToDoc({ pausedAt: 5 }, stamp)).toEqual({ pausedAt: 'ts:5' });
    expect(pauseToDoc({ pausedAt: null, pausedMs: 7, pausedMsSince: 3 }, stamp)).toEqual({
      pausedAt: null,
      pausedMs: 7,
      pausedMsSince: 'ts:3',
    });
    expect(pauseToDoc({ pausedAt: null, pausedMs: 7, pausedMsSince: null }, stamp)).toMatchObject({ pausedMsSince: null });
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

  it('reads the level mode of a label only when it is a known mode', () => {
    for (const mode of ['worst', 'lowerHalf', 'median', 'average']) {
      expect(labelFromDoc('L1', { aggregate: mode }).aggregate).toBe(mode);
    }
    expect(labelFromDoc('L1', {})).not.toHaveProperty('aggregate');
    expect(labelFromDoc('L1', { aggregate: 'best' })).not.toHaveProperty('aggregate');
    expect(labelFromDoc('L1', { aggregate: null })).not.toHaveProperty('aggregate');
    expect(labelFromDoc('L1', { aggregate: 3 })).not.toHaveProperty('aggregate');
  });

  it('refuses an unknown level mode', () => {
    expect(checkAggregate('median')).toBe('median');
    expect(() => checkAggregate('best' as never)).toThrow(DataError);
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
