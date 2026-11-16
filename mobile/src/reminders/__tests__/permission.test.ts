import { androidPermissionState, type FirstGaugeAskInput, shouldAskOnFirstGauge } from '../permission';

describe('androidPermissionState', () => {
  it('reads "not asked yet" as undetermined, not as a refusal', () => {
    // Android 13 and later before the first prompt.
    expect(androidPermissionState({ granted: false, canAskAgain: true }, false)).toBe('undetermined');
  });

  it('reads a refusal at the prompt as denied', () => {
    expect(androidPermissionState({ granted: false, canAskAgain: true }, true)).toBe('denied');
  });

  it('reads "cannot ask anymore" as denied', () => {
    expect(androidPermissionState({ granted: false, canAskAgain: false }, false)).toBe('denied');
  });

  it('reads a grant as granted', () => {
    expect(androidPermissionState({ granted: true, canAskAgain: true }, false)).toBe('granted');
    expect(androidPermissionState({ granted: true, canAskAgain: false }, true)).toBe('granted');
  });
});

describe('shouldAskOnFirstGauge', () => {
  const ready: FirstGaugeAskInput = {
    supported: true,
    loaded: true,
    enabled: true,
    permission: 'undetermined',
    asked: false,
    activeGauges: 1,
  };

  it('asks when the user has a gauge and was never asked', () => {
    expect(shouldAskOnFirstGauge(ready)).toBe(true);
  });

  it('does not ask on an empty app', () => {
    expect(shouldAskOnFirstGauge({ ...ready, activeGauges: 0 })).toBe(false);
  });

  it('asks one time only', () => {
    expect(shouldAskOnFirstGauge({ ...ready, asked: true })).toBe(false);
    expect(shouldAskOnFirstGauge({ ...ready, asked: null })).toBe(false);
  });

  it('does not ask when the user turned reminders off, or the answer is known', () => {
    expect(shouldAskOnFirstGauge({ ...ready, enabled: false })).toBe(false);
    expect(shouldAskOnFirstGauge({ ...ready, permission: 'granted' })).toBe(false);
    expect(shouldAskOnFirstGauge({ ...ready, permission: 'denied' })).toBe(false);
    expect(shouldAskOnFirstGauge({ ...ready, permission: null })).toBe(false);
  });

  it('does nothing on the web or before the settings load', () => {
    expect(shouldAskOnFirstGauge({ ...ready, supported: false })).toBe(false);
    expect(shouldAskOnFirstGauge({ ...ready, loaded: false })).toBe(false);
  });
});
