import * as domain from '..';

describe('domain index', () => {
  it('exports the public functions', () => {
    for (const name of [
      'gaugeTone',
      'gaugeLevel',
      'sampleCurve',
      'labelLevel',
      'sortGaugesForHome',
      'searchGauges',
      'gaugeAvatarOrder',
      'labelAvatarOrder',
      'addExecution',
      'changeExecutionDate',
      'removeExecution',
      'planReminders',
    ]) {
      expect(typeof (domain as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
