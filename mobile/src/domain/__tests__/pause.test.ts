import { DAY_MS, gaugeLevel } from '../level';
import {
  activeElapsedMs,
  countedPausedMs,
  isPaused,
  PAUSED_MS_MAX,
  pauseChanges,
  pausedSince,
  resumeChanges,
} from '../pause';
import { sameGauge } from '../same';
import type { Gauge } from '../types';
import { makeGauge } from '../__testSupport__/makeGauge';

const NOW = Date.UTC(2026, 9, 3, 12);
const at = (days: number) => NOW + days * DAY_MS;
const done = (days: number, by = 'u1') => ({ at: at(days), by });

/** A gauge of 10 days, linear: empty after 12 days, so 1 day is 100 / 12 points. */
function gauge(overrides: Partial<Gauge> = {}): Gauge {
  return makeGauge({ repeatDays: 10, curve: 'linear', ...overrides });
}

/** Applies the fields of a pause or a resume, as the repository writes them. */
function apply(g: Gauge, changes: Partial<Gauge> | null): Gauge {
  return changes ? { ...g, ...changes } : g;
}

const levelAfterDays = (days: number) => 100 - (100 * days) / 12;

describe('isPaused and pausedSince', () => {
  it('reads a gauge with no pause fields as active', () => {
    const g = gauge({ executions: [done(-2)] });
    expect(isPaused(g)).toBe(false);
    expect(pausedSince(g)).toBeNull();
  });

  it('reads a pause start after the last execution as paused', () => {
    const g = gauge({ executions: [done(-2)], pausedAt: at(-1) });
    expect(isPaused(g)).toBe(true);
    expect(pausedSince(g)).toBe(at(-1));
  });

  it('pauses a gauge with no execution', () => {
    const g = gauge({ pausedAt: at(-1) });
    expect(isPaused(g)).toBe(true);
    expect(gaugeLevel(g, NOW)).toBe(0);
    expect(activeElapsedMs(g, NOW)).toBeNull();
  });

  it('ends the pause at an execution after its start, from any app version', () => {
    const g = gauge({ executions: [done(-5), done(-1)], pausedAt: at(-3), pausedMs: 2 * DAY_MS, pausedMsSince: at(-5) });
    expect(isPaused(g)).toBe(false);
    expect(pausedSince(g)).toBeNull();
    // The gauge empties from that execution, and the old paused time does not count.
    expect(gaugeLevel(g, NOW)).toBeCloseTo(levelAfterDays(1));
  });

  it('ignores a pause start that is not a number', () => {
    expect(isPaused(gauge({ pausedAt: Number.NaN }))).toBe(false);
    expect(isPaused(gauge({ pausedAt: null }))).toBe(false);
  });
});

describe('gaugeLevel with a pause', () => {
  it('keeps the level of the start of the pause', () => {
    const g = gauge({ executions: [done(-6)], pausedAt: at(-3) });
    expect(gaugeLevel(g, NOW)).toBeCloseTo(levelAfterDays(3));
    expect(gaugeLevel(g, at(100))).toBeCloseTo(levelAfterDays(3));
  });

  it('continues from the same level after a resume', () => {
    const paused = gauge({ executions: [done(-6)], pausedAt: at(-3) });
    const before = gaugeLevel(paused, NOW);
    const resumed = apply(paused, resumeChanges(paused, NOW));
    expect(isPaused(resumed)).toBe(false);
    expect(resumed.pausedMs).toBe(3 * DAY_MS);
    expect(resumed.pausedMsSince).toBe(at(-6));
    expect(gaugeLevel(resumed, NOW)).toBeCloseTo(before);
    expect(gaugeLevel(resumed, at(2))).toBeCloseTo(levelAfterDays(5));
  });

  it('adds up pause, resume, and pause again before an execution', () => {
    let g = gauge({ executions: [done(-10)] });
    g = apply(g, pauseChanges(g, at(-8)));
    g = apply(g, resumeChanges(g, at(-5)));
    expect(g.pausedMs).toBe(3 * DAY_MS);
    g = apply(g, pauseChanges(g, at(-4)));
    // Active: from day -10 to -8 and from -5 to -4. That is 3 days.
    expect(gaugeLevel(g, NOW)).toBeCloseTo(levelAfterDays(3));
    g = apply(g, resumeChanges(g, NOW));
    expect(g.pausedMs).toBe(7 * DAY_MS);
    expect(gaugeLevel(g, at(1))).toBeCloseTo(levelAfterDays(4));
  });

  it('drops the paused time after a new execution', () => {
    let g = gauge({ executions: [done(-10)] });
    g = apply(g, pauseChanges(g, at(-8)));
    g = apply(g, resumeChanges(g, at(-5)));
    g = { ...g, executions: [...g.executions, done(-1)] };
    expect(countedPausedMs(g)).toBe(0);
    expect(gaugeLevel(g, NOW)).toBeCloseTo(levelAfterDays(1));
  });

  it('drops the paused time when the last execution changes or goes', () => {
    const base = gauge({ executions: [done(-20), done(-10)], pausedMs: 3 * DAY_MS, pausedMsSince: at(-10) });
    expect(countedPausedMs(base)).toBe(3 * DAY_MS);
    const moved = { ...base, executions: [done(-20), done(-9)] };
    expect(countedPausedMs(moved)).toBe(0);
    const removed = { ...base, executions: [done(-20)] };
    expect(countedPausedMs(removed)).toBe(0);
    expect(gaugeLevel(removed, NOW)).toBe(0);
  });

  it('keeps the paused time when an older execution changes', () => {
    const base = gauge({ executions: [done(-20), done(-10)], pausedMs: 3 * DAY_MS, pausedMsSince: at(-10) });
    const older = { ...base, executions: [done(-15), done(-10)] };
    expect(countedPausedMs(older)).toBe(3 * DAY_MS);
  });

  it('keeps the pause for "I did it on…" before the pause, from that date', () => {
    const paused = gauge({ executions: [done(-10)], pausedAt: at(-4), pausedMs: DAY_MS, pausedMsSince: at(-10) });
    const added = { ...paused, executions: [...paused.executions, done(-6)] };
    expect(isPaused(added)).toBe(true);
    // The new last execution drops the old paused time: 2 days from -6 to -4.
    expect(gaugeLevel(added, NOW)).toBeCloseTo(levelAfterDays(2));
  });

  it('ignores paused time with no matching execution, a negative value, or a missing link', () => {
    expect(countedPausedMs(gauge({ executions: [done(-1)], pausedMs: DAY_MS }))).toBe(0);
    expect(countedPausedMs(gauge({ executions: [done(-1)], pausedMs: -DAY_MS, pausedMsSince: at(-1) }))).toBe(0);
    expect(countedPausedMs(gauge({ executions: [done(-1)], pausedMs: Number.NaN, pausedMsSince: at(-1) }))).toBe(0);
    expect(countedPausedMs(gauge({ executions: [done(-1)], pausedMs: 1e20, pausedMsSince: at(-1) }))).toBe(PAUSED_MS_MAX);
  });

  it('never gives a level above 100 when the clocks of two devices differ', () => {
    // The pause starts on a device whose clock is behind the execution.
    const behind = gauge({ executions: [done(0)], pausedAt: at(0) - 60_000 });
    expect(isPaused(behind)).toBe(false);
    // A paused time longer than the time since the execution.
    const tooLong = gauge({ executions: [done(-1)], pausedMs: 5 * DAY_MS, pausedMsSince: at(-1) });
    expect(activeElapsedMs(tooLong, NOW)).toBe(0);
    expect(gaugeLevel(tooLong, NOW)).toBe(100);
  });
});

describe('pauseChanges and resumeChanges', () => {
  it('makes a pause of a paused gauge and a resume of an active gauge no-ops', () => {
    const active = gauge({ executions: [done(-1)] });
    const paused = gauge({ executions: [done(-1)], pausedAt: at(-0.5) });
    expect(pauseChanges(paused, NOW)).toBeNull();
    expect(resumeChanges(active, NOW)).toBeNull();
    expect(pauseChanges(active, NOW)).toEqual({ pausedAt: NOW });
  });

  it('pauses again a gauge whose old pause an execution ended', () => {
    const ended = gauge({ executions: [done(-1)], pausedAt: at(-3) });
    expect(pauseChanges(ended, NOW)).toEqual({ pausedAt: NOW });
  });

  it('adds nothing for a pause start in the future of this device', () => {
    const g = gauge({ executions: [done(-2)], pausedAt: at(1) });
    expect(resumeChanges(g, NOW)).toEqual({ pausedAt: null, pausedMs: 0, pausedMsSince: at(-2) });
  });

  it('resumes a gauge with no execution', () => {
    const g = gauge({ pausedAt: at(-2) });
    expect(resumeChanges(g, NOW)).toEqual({ pausedAt: null, pausedMs: 2 * DAY_MS, pausedMsSince: null });
  });

  it('does not count the paused time twice when the same pause is resumed twice', () => {
    const paused = gauge({ executions: [done(-6)], pausedAt: at(-3) });
    const once = apply(paused, resumeChanges(paused, NOW));
    expect(resumeChanges(once, at(1))).toBeNull();
  });
});

describe('sameGauge with pause fields', () => {
  it('sees a change of each pause field, and treats missing as the default', () => {
    const g = gauge();
    expect(sameGauge(g, { ...g, pausedAt: null, pausedMs: 0, pausedMsSince: null })).toBe(true);
    expect(sameGauge(g, { ...g, pausedAt: NOW })).toBe(false);
    expect(sameGauge(g, { ...g, pausedMs: 1 })).toBe(false);
    expect(sameGauge(g, { ...g, pausedMsSince: NOW })).toBe(false);
  });
});
