import { clampLevel, gaugeTone, isRed } from '../tone';

describe('gaugeTone', () => {
  it('returns green above 50, orange above 25, and red for the rest', () => {
    expect(gaugeTone(50.1)).toBe('green');
    expect(gaugeTone(50)).toBe('orange');
    expect(gaugeTone(25.1)).toBe('orange');
    expect(gaugeTone(25)).toBe('red');
    expect(gaugeTone(0)).toBe('red');
  });

  it('clamps values outside 0 to 100', () => {
    expect(gaugeTone(150)).toBe('green');
    expect(gaugeTone(-10)).toBe('red');
    expect(clampLevel(Number.NaN)).toBe(0);
  });

  it('marks 25 and lower as red', () => {
    expect(isRed(25)).toBe(true);
    expect(isRed(25.01)).toBe(false);
  });
});
