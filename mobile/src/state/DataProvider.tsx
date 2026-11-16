import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { type DataError, getRepository, type Repository, type Unsubscribe } from '@/data';
import { type Gauge, type Label, reuseUnchanged, sameGauge, sameLabel } from '@/domain';

import { useSession } from './SessionProvider';

export interface LiveList<T> {
  status: 'loading' | 'ready' | 'error';
  items: T[];
  error: DataError | null;
  /** Subscribes again after an error. */
  retry: () => void;
}

function initial<T>(): LiveList<T> {
  return { status: 'loading', items: [], error: null, retry: () => {} };
}
const GaugesContext = createContext<LiveList<Gauge>>(initial());
const LabelsContext = createContext<LiveList<Label>>(initial());

type Subscribe<T> = (
  repository: Repository,
  onData: (items: T[]) => void,
  onError: (error: DataError) => void,
) => Unsubscribe;

/**
 * Subscribes to one live list while a user is signed in. A new snapshot
 * keeps the objects of the items that did not change (`reuseUnchanged`), so
 * that the memoized rows of the lists render again only for a real change.
 */
function useLiveList<T extends { id: string }>(subscribe: Subscribe<T>, same: (a: T, b: T) => boolean): LiveList<T> {
  const { user } = useSession();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  // The state remembers the user and the attempt it belongs to. A state of
  // another user or attempt counts as loading.
  const [state, setState] = useState<{ key: string; list: Omit<LiveList<T>, 'retry'> } | null>(null);
  const key = `${uid}:${attempt}`;

  useEffect(() => {
    if (uid === null) return;
    const current = `${uid}:${attempt}`;
    return subscribe(
      getRepository(),
      (items) =>
        setState((previous) => {
          if (previous?.key !== current) return { key: current, list: { status: 'ready', items, error: null } };
          const kept = reuseUnchanged(previous.list.items, items, same);
          if (kept === previous.list.items && previous.list.status === 'ready') return previous;
          return { key: current, list: { status: 'ready', items: kept, error: null } };
        }),
      (error) =>
        setState((previous) => ({
          key: current,
          list: { items: previous?.key === current ? previous.list.items : [], status: 'error', error },
        })),
    );
  }, [uid, attempt, subscribe, same]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const list = state && state.key === key ? state.list : null;
  return useMemo(() => ({ ...(list ?? { status: 'loading' as const, items: [], error: null }), retry }), [list, retry]);
}

const subscribeGauges: Subscribe<Gauge> = (repository, onData, onError) =>
  repository.subscribeMyGauges(onData, onError);
const subscribeLabels: Subscribe<Label> = (repository, onData, onError) =>
  repository.subscribeMyLabels(onData, onError);

/** Gives the live lists of gauges and labels of the signed-in user. */
export function DataProvider({ children }: { children: ReactNode }) {
  const gauges = useLiveList(subscribeGauges, sameGauge);
  const labels = useLiveList(subscribeLabels, sameLabel);
  return (
    <GaugesContext.Provider value={gauges}>
      <LabelsContext.Provider value={labels}>{children}</LabelsContext.Provider>
    </GaugesContext.Provider>
  );
}

/** All gauges of the user, active and archived, in no fixed order. */
export function useGauges(): LiveList<Gauge> {
  return useContext(GaugesContext);
}

/** All labels of the user. Task 5 uses them. */
export function useLabels(): LiveList<Label> {
  return useContext(LabelsContext);
}

/** One gauge by ID, or `undefined` when the list does not have it. */
export function useGauge(id: string | undefined): Gauge | undefined {
  const { items } = useGauges();
  return id === undefined ? undefined : items.find((gauge) => gauge.id === id);
}
