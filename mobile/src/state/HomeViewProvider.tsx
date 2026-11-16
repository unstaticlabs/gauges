import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { readStored, STORAGE_KEYS, writeStored } from './storage';

/** `all`: one list of all gauges. `labels`: one card for each label. */
export type HomeView = 'all' | 'labels';

interface HomeViewValue {
  view: HomeView;
  setView: (view: HomeView) => void;
  /**
   * `true` after the user marked a gauge done with a swipe on this device,
   * `false` before, and `null` while the value loads. The home screen shows
   * the swipe hint while it is `false`.
   */
  swipeLearned: boolean | null;
  learnSwipe: () => void;
}

const HomeViewContext = createContext<HomeViewValue>({
  view: 'all',
  setView: () => {},
  swipeLearned: null,
  learnSwipe: () => {},
});

/** Remembers the view of the home screen and the swipe hint on this device. */
export function HomeViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<HomeView>('all');
  const [swipeLearned, setSwipeLearned] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    readStored<HomeView>(STORAGE_KEYS.homeView).then((stored) => {
      if (active && (stored === 'all' || stored === 'labels')) setViewState(stored);
    });
    readStored<boolean>(STORAGE_KEYS.swipeLearned).then((stored) => {
      if (active) setSwipeLearned(stored === true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setView = useCallback((next: HomeView) => {
    setViewState(next);
    void writeStored(STORAGE_KEYS.homeView, next);
  }, []);

  const learnSwipe = useCallback(() => {
    setSwipeLearned(true);
    void writeStored(STORAGE_KEYS.swipeLearned, true);
  }, []);

  const value = useMemo(
    () => ({ view, setView, swipeLearned, learnSwipe }),
    [view, setView, swipeLearned, learnSwipe],
  );
  return <HomeViewContext.Provider value={value}>{children}</HomeViewContext.Provider>;
}

export function useHomeView(): HomeViewValue {
  return useContext(HomeViewContext);
}
