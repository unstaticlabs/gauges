import { reuseUnchanged, sameGauge, sameLabel } from '../same';
import type { Gauge, Label } from '../types';

const gauge = (id: string, extra: Partial<Gauge> = {}): Gauge => ({
  id,
  name: `Gauge ${id}`,
  repeatDays: 7,
  curve: 'linear',
  labelIds: ['l1'],
  members: ['u1'],
  createdBy: 'u1',
  executions: [{ at: 1000, by: 'u1' }],
  archivedAt: null,
  mutedBy: [],
  createdAt: 1,
  ...extra,
});

describe('sameGauge', () => {
  it('compares the values, not the objects', () => {
    expect(sameGauge(gauge('a'), gauge('a'))).toBe(true);
    expect(sameGauge(gauge('a'), gauge('a', { name: 'Other' }))).toBe(false);
    expect(sameGauge(gauge('a'), gauge('a', { executions: [{ at: 2000, by: 'u1' }] }))).toBe(false);
    expect(sameGauge(gauge('a'), gauge('a', { mutedBy: ['u1'] }))).toBe(false);
    expect(sameGauge(gauge('a'), gauge('a', { members: ['u1', 'u2'] }))).toBe(false);
  });
});

describe('sameLabel', () => {
  const label: Label = { id: 'l1', name: 'Home', members: ['u1'], gaugeIds: ['a'], createdBy: 'u1', createdAt: 1 };
  it('compares the values, also the emoji and the mode', () => {
    expect(sameLabel(label, { ...label })).toBe(true);
    expect(sameLabel(label, { ...label, emoji: '🏠' })).toBe(false);
    expect(sameLabel(label, { ...label, aggregate: 'worst' })).toBe(false);
    expect(sameLabel(label, { ...label, gaugeIds: ['a', 'b'] })).toBe(false);
  });
});

describe('reuseUnchanged', () => {
  it('keeps the old object of each item that did not change', () => {
    const previous = [gauge('a'), gauge('b')];
    const next = [gauge('a'), gauge('b', { name: 'New' })];
    const result = reuseUnchanged(previous, next, sameGauge);
    expect(result[0]).toBe(previous[0]);
    expect(result[1]).toBe(next[1]);
  });

  it('gives the old list when nothing changed', () => {
    const previous = [gauge('a'), gauge('b')];
    expect(reuseUnchanged(previous, [gauge('a'), gauge('b')], sameGauge)).toBe(previous);
  });

  it('gives a new list after a move, an add, or a removal', () => {
    const previous = [gauge('a'), gauge('b')];
    const moved = reuseUnchanged(previous, [gauge('b'), gauge('a')], sameGauge);
    expect(moved).not.toBe(previous);
    expect(moved[0]).toBe(previous[1]);
    expect(reuseUnchanged(previous, [gauge('a')], sameGauge)).toEqual([previous[0]]);
    expect(reuseUnchanged(previous, [...previous, gauge('c')], sameGauge)).toHaveLength(3);
  });
});
