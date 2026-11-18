import {
  choicesFromGauge,
  daysUntilLevel,
  hasLabelChanges,
  isPreset,
  labelChanges,
  parseDays,
  validateGaugeForm,
} from '../form';

describe('parseDays', () => {
  it('reads a whole number in the range', () => {
    expect(parseDays('7', 3650)).toBe(7);
    expect(parseDays(' 45 ', 3650)).toBe(45);
    expect(parseDays('3650', 3650)).toBe(3650);
  });

  it('refuses empty, zero, too large, decimal, and negative values', () => {
    for (const text of ['', ' ', '0', '3651', '1.5', '-2', '7d', '1e3']) {
      expect(parseDays(text, 3650)).toBeNull();
    }
  });
});

describe('isPreset', () => {
  it('knows the quick choices', () => {
    expect(isPreset(7)).toBe(true);
    expect(isPreset(10)).toBe(false);
  });
});

describe('validateGaugeForm', () => {
  const limits = { nameMax: 5 };

  it('accepts valid values', () => {
    expect(validateGaugeForm({ name: ' Bins ', repeatDays: 7, curve: 'linear' }, limits)).toEqual({});
  });

  it('reports each problem', () => {
    expect(validateGaugeForm({ name: '  ', repeatDays: null, curve: 'late' }, limits)).toEqual({
      name: 'required',
      repeatDays: 'invalid',
    });
    expect(validateGaugeForm({ name: 'Too long', repeatDays: 1, curve: 'ease' }, limits)).toEqual({
      name: 'tooLong',
    });
  });
});

describe('daysUntilLevel', () => {
  it('finds the day a gauge reaches a level', () => {
    // Linear, 10 days: empty after 12 days, so 25 % after 9 days.
    expect(daysUntilLevel('linear', 10, 25)).toBeCloseTo(9, 3);
    // Late: 1 - x^4 = 0.25 at x = 0.75^(1/4).
    expect(daysUntilLevel('late', 10, 25)).toBeCloseTo(12 * 0.75 ** 0.25, 3);
    expect(daysUntilLevel('ease', 10, 50)).toBeCloseTo(6, 3);
  });
});

describe('label choices', () => {
  const labels = [
    { id: 'home', name: 'Home' },
    { id: 'car', name: 'Car' },
  ];

  it('keeps only the labels of the user that are on the gauge', () => {
    expect(choicesFromGauge({ labelIds: ['car', 'not-mine'] }, labels)).toEqual([{ id: 'car', name: 'Car' }]);
    expect(choicesFromGauge(null, labels)).toEqual([]);
  });

  it('gives the labels to add, to remove, and to create', () => {
    const before = [{ id: 'home', name: 'Home' }];
    const after = [
      { id: 'car', name: 'Car' },
      { id: null, name: ' Plants ', emoji: '🪴' },
      { id: null, name: 'Misc' },
    ];
    expect(labelChanges(before, after)).toEqual({
      add: ['car'],
      remove: ['home'],
      create: [
        { name: 'Plants', emoji: '🪴' },
        { name: 'Misc', emoji: null },
      ],
    });
    expect(hasLabelChanges(before, before)).toBe(false);
    expect(hasLabelChanges(before, after)).toBe(true);
  });
});
