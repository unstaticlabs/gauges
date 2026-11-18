import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getRepository, NAME_MAX_LENGTH } from '@/data';
import type { Gauge } from '@/domain';

import { type AutosaveState, GaugeAutosaver } from './autosave';

/**
 * Connects the autosave (see `autosave.ts`) to the gauge page: it gives the
 * newest data of the gauge to the saver, and it writes a pending change
 * when the page closes or the app goes to the background. On the website,
 * the app goes to the background when the browser hides the tab.
 *
 * `gauge` is `null` on the create form, which has no autosave.
 */
export function useGaugeAutosave(gauge: Gauge | null): { saver: GaugeAutosaver | null; state: AutosaveState } {
  const [state, setState] = useState<AutosaveState>({ status: 'idle', error: null });
  const gaugeId = gauge?.id ?? null;
  // One saver for the life of the page. The page shows one gauge.
  const [saver] = useState(() =>
    gauge
      ? new GaugeAutosaver(
          { name: gauge.name, repeatDays: gauge.repeatDays, curve: gauge.curve },
          {
            write: (changes) => getRepository().updateGauge(gauge.id, changes),
            onState: setState,
            nameMax: NAME_MAX_LENGTH,
          },
        )
      : null,
  );

  useEffect(() => {
    if (gauge) saver?.setStored({ name: gauge.name, repeatDays: gauge.repeatDays, curve: gauge.curve });
  }, [saver, gauge, gauge?.name, gauge?.repeatDays, gauge?.curve]);

  useEffect(() => {
    if (!saver || !gaugeId) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') saver.flush();
    });
    return () => {
      subscription.remove();
      saver.flush();
    };
  }, [saver, gaugeId]);

  return { saver, state };
}
