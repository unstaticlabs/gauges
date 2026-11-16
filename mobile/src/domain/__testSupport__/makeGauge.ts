import type { Gauge } from '../types';

/** Returns a gauge for a test. The fields in `overrides` replace the defaults. */
export function makeGauge(overrides: Partial<Gauge> = {}): Gauge {
  return {
    id: 'g1',
    name: 'Gauge',
    repeatDays: 10,
    curve: 'linear',
    labelIds: [],
    members: ['u1'],
    createdBy: 'u1',
    executions: [],
    archivedAt: null,
    mutedBy: [],
    createdAt: 0,
    ...overrides,
  };
}
