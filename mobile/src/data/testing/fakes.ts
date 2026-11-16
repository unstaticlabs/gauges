import type { Gauge, Label } from '../../domain/types';
import type { Sentinels } from '../plans';

/** Sentinels that a test can read, in place of SDK values. */
export const fakeSentinels: Sentinels = {
  arrayUnion: (...values) => ({ union: values }),
  arrayRemove: (...values) => ({ remove: values }),
  deleteField: () => ({ delete: true }),
  timestamp: (ms) => ({ ts: ms }),
};

export function gauge(extra: Partial<Gauge> = {}): Gauge {
  return {
    id: 'g1',
    name: 'Plants',
    repeatDays: 3,
    curve: 'linear',
    labelIds: [],
    members: ['alice'],
    createdBy: 'alice',
    executions: [],
    archivedAt: null,
    mutedBy: [],
    createdAt: 0,
    ...extra,
  };
}

export function label(extra: Partial<Label> = {}): Label {
  return {
    id: 'L1',
    name: 'Home',
    members: ['alice'],
    gaugeIds: [],
    createdBy: 'alice',
    createdAt: 0,
    ...extra,
  };
}
