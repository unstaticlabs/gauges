import { clampLevel, gaugeTone } from '../gaugeTone';

describe('gaugeTone', () => {
  it('returns green above 50', () => {
    expect(gaugeTone(100)).toBe('green');
    expect(gaugeTone(51)).toBe('green');
    expect(gaugeTone(50.1)).toBe('green');
  });

  it('returns orange above 25 up to 50', () => {
    expect(gaugeTone(50)).toBe('orange');
    expect(gaugeTone(26)).toBe('orange');
  });

  it('returns red at 25 and below', () => {
    expect(gaugeTone(25)).toBe('red');
    expect(gaugeTone(0)).toBe('red');
  });

  it('clamps values outside 0 to 100', () => {
    expect(gaugeTone(150)).toBe('green');
    expect(gaugeTone(-10)).toBe('red');
    expect(clampLevel(Number.NaN)).toBe(0);
  });
});
