import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

const NowContext = createContext<number>(Date.now());

/** The interval of the shared clock. Levels change slowly, so one minute is enough. */
const TICK_MS = 60 * 1000;

/**
 * Gives a shared `now` to the screens. It updates each minute, and when the
 * app returns to the foreground, so that the levels do not go stale.
 */
export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

/** Returns the shared time in epoch milliseconds. */
export function useNow(): number {
  return useContext(NowContext);
}
