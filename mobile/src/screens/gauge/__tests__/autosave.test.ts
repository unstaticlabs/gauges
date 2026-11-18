import type { GaugeChanges } from '@/data';

import { AUTOSAVE_DELAY_MS, type AutosaveState, GaugeAutosaver, type StoredFields } from '../autosave';

const STORED: StoredFields = { name: 'Bins', repeatDays: 7, curve: 'linear' };

/** A write that the test ends by hand, with `resolve` or `reject`. */
function setup(stored: StoredFields = STORED) {
  const writes: GaugeChanges[] = [];
  const pending: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  const states: AutosaveState[] = [];
  const saver = new GaugeAutosaver(stored, {
    write: (changes) => {
      writes.push(changes);
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    },
    onState: (state) => states.push(state),
    nameMax: 20,
  });
  const status = () => states.at(-1)?.status ?? 'idle';
  return { saver, writes, pending, states, status };
}

/** Lets the promise callbacks run. */
const settle = () => Promise.resolve().then(() => undefined);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('GaugeAutosaver', () => {
  it('saves a text after the quiet time, one time for many key presses', () => {
    const { saver, writes } = setup();
    saver.change({ name: 'B' }, 'later');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100);
    saver.change({ name: 'Bi' }, 'later');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100);
    saver.change({ name: 'Bin' }, 'later');
    expect(writes).toEqual([]);
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(writes).toEqual([{ name: 'Bin' }]);
  });

  it('saves a choice at once', () => {
    const { saver, writes } = setup();
    saver.change({ curve: 'ease' }, 'now');
    expect(writes).toEqual([{ curve: 'ease' }]);
  });

  it('writes a pending text on flush, for example when the user leaves', () => {
    const { saver, writes } = setup();
    saver.change({ name: 'Trash' }, 'later');
    saver.flush();
    expect(writes).toEqual([{ name: 'Trash' }]);
    // The timer does not write it a second time.
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
    expect(writes).toHaveLength(1);
  });

  it('does not save an invalid value, and keeps the stored value', () => {
    const { saver, writes } = setup();
    saver.change({ name: '   ' }, 'later');
    saver.change({ repeatDays: null }, 'later');
    saver.change({ repeatDays: 0 }, 'now');
    saver.change({ name: 'x'.repeat(21) }, 'later');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    saver.flush();
    expect(writes).toEqual([]);
    expect(saver.pendingChanges()).toEqual({});
  });

  it('does not save a value that equals the stored value', () => {
    const { saver, writes } = setup();
    saver.change({ name: ' Bins ' }, 'later');
    saver.change({ repeatDays: 7 }, 'now');
    saver.change({ curve: 'linear' }, 'now');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    saver.flush();
    expect(writes).toEqual([]);
  });

  it('writes only the fields that the user changed', () => {
    const { saver, writes } = setup();
    // Another member changes the curve. The user changes the name only.
    saver.setStored({ ...STORED, curve: 'late' });
    saver.change({ name: 'Trash' }, 'later');
    saver.flush();
    expect(writes).toEqual([{ name: 'Trash' }]);
  });

  it('does not reset a field that the user types in when the data changes', () => {
    const { saver, writes } = setup();
    saver.change({ name: 'Tra' }, 'later');
    saver.setStored({ ...STORED, name: 'Other', repeatDays: 3 });
    expect(saver.isTouched('name')).toBe(true);
    expect(saver.isTouched('repeatDays')).toBe(false);
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(writes).toEqual([{ name: 'Tra' }]);
  });

  it('shows "saving" until the write is done, then "saved"', async () => {
    const { saver, pending, status } = setup();
    expect(status()).toBe('idle');
    saver.change({ name: 'Trash' }, 'later');
    expect(status()).toBe('saving');
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(status()).toBe('saving');
    pending[0].resolve();
    await settle();
    expect(status()).toBe('saved');
  });

  it('shows the error of a failed write, and tries again on the next flush', async () => {
    const { saver, writes, pending, states, status } = setup();
    saver.change({ name: 'Trash' }, 'later');
    saver.flush();
    const error = { code: 'unavailable' };
    pending[0].reject(error);
    await settle();
    expect(status()).toBe('error');
    expect(states.at(-1)?.error).toBe(error);
    // The text of the user stays a pending change.
    expect(saver.isTouched('name')).toBe(true);
    saver.setStored(STORED);
    saver.flush();
    expect(writes).toEqual([{ name: 'Trash' }, { name: 'Trash' }]);
    pending[1].resolve();
    await settle();
    expect(status()).toBe('saved');
  });

  it('shows the status of another write, such as a label', async () => {
    const { saver, status } = setup();
    let fail: (error: unknown) => void = () => undefined;
    saver.track(new Promise((_, reject) => (fail = reject)));
    expect(status()).toBe('saving');
    fail(new Error('offline'));
    await settle();
    expect(status()).toBe('error');
  });

  it('drops a pending change on cancel, for example before a delete', () => {
    const { saver, writes } = setup();
    saver.change({ name: 'Trash' }, 'later');
    saver.cancel();
    jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    saver.flush();
    expect(writes).toEqual([]);
  });
});
