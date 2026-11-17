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

function label(id: string, name = id, extra: Partial<Label> = {}): Label {
  return { id, name, members: ['u1'], gaugeIds: [], createdBy: 'u1', createdAt: 0, ...extra };
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

  it('computes and sorts each label with its own mode', () => {
    // home: dishes 20 and plants 80. garden: lawn 60 and plants 80.
    const byDefault = groupByLabel([label('garden'), label('home')], gauges, NOW);
    expect(byDefault.map((g) => g.label.id)).toEqual(['home', 'garden']);
    // With the average, home is 50. With the worst gauge, garden is 60.
    const own = groupByLabel(
      [label('garden', 'garden', { aggregate: 'worst' }), label('home', 'home', { aggregate: 'average' })],
      gauges,
      NOW,
    );
    expect(own.map((g) => g.label.id)).toEqual(['home', 'garden']);
    expect(own[0].level).toBeCloseTo(50, 6);
    expect(own[1].level).toBeCloseTo(60, 6);
    // A new garden gauge at 45: garden with the worst gauge (45) now comes before home (50).
    const lowGarden = [...gauges, gaugeAt('hedge', 45, ['garden'])];
    const swapped = groupByLabel(
      [label('garden', 'garden', { aggregate: 'worst' }), label('home', 'home', { aggregate: 'average' })],
      lowGarden,
      NOW,
    );
    expect(swapped.map((g) => g.label.id)).toEqual(['garden', 'home']);
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

describe('paused gauges in the groups', () => {
  const paused = (id: string, level: number, labelIds: string[]) => ({
    ...gaugeAt(id, level, labelIds),
    pausedAt: NOW - 1000,
  });

  it('puts the paused gauges last in a label, by name, and leaves them out of the level', () => {
    const gauges = [gaugeAt('dishes', 60, ['home']), paused('zinc', 5, ['home']), paused('fertilize', 0, ['home'])];
    const [home] = groupByLabel([label('home')], gauges, NOW);
    expect(home.gauges.map((g) => g.id)).toEqual(['dishes', 'fertilize', 'zinc']);
    expect(home.level).toBeCloseTo(60, 6);
    expect(home.pausedCount).toBe(2);
    expect(gaugesOfLabel('home', gauges, NOW).map((g) => g.id)).toEqual(['dishes', 'fertilize', 'zinc']);
  });

  it('puts a label with only paused gauges after the labels with a level, before the empty labels', () => {
    const gauges = [gaugeAt('lawn', 90, ['garden']), paused('fertilize', 0, ['winter'])];
    const groups = groupByLabel([label('empty'), label('winter'), label('garden')], gauges, NOW);
    expect(groups.map((g) => g.label.id)).toEqual(['garden', 'winter', 'empty']);
    expect(groups[1]).toMatchObject({ level: null, pausedCount: 1 });
  });

  it('puts the paused gauges with no label last', () => {
    const gauges = [paused('a', 0, []), gaugeAt('b', 90, [])];
    expect(gaugesWithoutLabel([], gauges, NOW).map((g) => g.id)).toEqual(['b', 'a']);
  });
});
