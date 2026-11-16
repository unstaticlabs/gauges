/** The color group of a gauge level. */
export type Tone = 'green' | 'orange' | 'red';

/** A level above this value is green. */
export const GREEN_ABOVE = 50;
/** A level above this value, and not green, is orange. The rest is red. */
export const ORANGE_ABOVE = 25;

/** Limits a gauge level to the range 0 to 100. `NaN` becomes 0. */
export function clampLevel(level: number): number {
  if (Number.isNaN(level)) return 0;
  return Math.min(100, Math.max(0, level));
}

/**
 * Returns the tone for a gauge level.
 * Above 50 is green, above 25 is orange, and the rest is red.
 */
export function gaugeTone(level: number): Tone {
  const value = clampLevel(level);
  if (value > GREEN_ABOVE) return 'green';
  if (value > ORANGE_ABOVE) return 'orange';
  return 'red';
}

/** Returns `true` when the level is red, that is 25 or lower. */
export function isRed(level: number): boolean {
  return gaugeTone(level) === 'red';
}
