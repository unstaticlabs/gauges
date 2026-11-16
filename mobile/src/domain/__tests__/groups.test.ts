import { findLabelByName, gaugesOfLabel, gaugesWithoutLabel, groupByLabel, searchLabels } from '../groups';
import { DAY_MS } from '../level';
import { makeGauge } from '../__testSupport__/makeGauge';
import type { Label } from '../types';

const NOW = Date.UTC(2026, 10, 14, 12);

/** A linear gauge of 10 days with the given level at NOW. */
function gaugeAt(id: string, level: number, labelIds: string[], archivedAt: number | null = null) {
  const days = ((100 - level) / 100) * 12;
  return makeGauge({ id, name: id, labelIds, archivedAt, executions: [{ at: NOW - days * DAY_MS, by: 'u1' }] });
}

function label(id: string, name = id): Label {
  return { id, name, members: ['u1'], gaugeIds: [], createdBy: 'u1', createdAt: 0 };
}

describe('groupByLabel', () => {
  const gauges = [
    gaugeAt('dishes', 20, ['home']),
    gaugeAt('plants', 80, ['home', 'garden']),
    gaugeAt('lawn', 60, ['garden']),
    gaugeAt('old', 0, ['home'], NOW - DAY_MS),
    gaugeAt('free', 10, []),
  ];

  it('puts the worst label first and a gauge in each of its labels', () => {
    const groups = groupByLabel([label('garden'), label('home'), label('car')], gauges, NOW);
    expect(groups.map((g) => g.label.id)).toEqual(['home', 'garden', 'car']);
    expect(groups[0].gauges.map((g) => g.id)).toEqual(['dishes', 'plants']);
    expect(groups[0].level).toBeCloseTo(20, 6);
    expect(groups[1].gauges.map((g) => g.id)).toEqual(['lawn', 'plants']);
    expect(groups[1].level).toBeCloseTo(60, 6);
    // A label with no active gauge comes last, with no level.
    expect(groups[2]).toMatchObject({ gauges: [], level: null });
  });

  it('orders labels with the same level by name', () => {
    const groups = groupByLabel([label('b', 'Beta'), label('a', 'Alpha')], [], NOW);
    expect(groups.map((g) => g.label.name)).toEqual(['Alpha', 'Beta']);
  });

  it('gives the gauges of one label, worst first, without archived gauges', () => {
    expect(gaugesOfLabel('home', gauges, NOW).map((g) => g.id)).toEqual(['dishes', 'plants']);
  });

  it('counts a label that the user cannot read as no label', () => {
    const list = [...gauges, gaugeAt('bobs', 50, ['bob-label'])];
    expect(gaugesWithoutLabel([label('home'), label('garden')], list, NOW).map((g) => g.id)).toEqual([
      'free',
      'bobs',
    ]);
  });
});

describe('label names', () => {
  const labels = [label('1', 'Home'), label('2', 'Été'), label('3', 'Car')];

  it('searches without case and accents', () => {
    expect(searchLabels(labels, 'ete').map((l) => l.id)).toEqual(['2']);
    expect(searchLabels(labels, ' ')).toHaveLength(3);
  });

  it('finds a label with the same name', () => {
    expect(findLabelByName(labels, '  home ')?.id).toBe('1');
    expect(findLabelByName(labels, 'ETE')?.id).toBe('2');
    expect(findLabelByName(labels, 'Hom')).toBeUndefined();
    expect(findLabelByName(labels, '')).toBeUndefined();
  });
});
