import { useCallback } from 'react';

import { getRepository } from '@/data';
import type { Gauge } from '@/domain';
import { errorMessage, t } from '@/i18n';
import { useSession, useToast } from '@/state';

/**
 * Gives the action of the done button of a row: it writes the execution and
 * shows a toast with "Undo". The home list and the label page share it.
 */
export function useMarkDone(): (gauge: Gauge, at: number) => void {
  const { user } = useSession();
  const showToast = useToast();
  return useCallback(
    (gauge: Gauge, at: number) => {
      const repository = getRepository();
      const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });
      repository.markDone(gauge.id, at).catch(fail);
      showToast({
        message: t.home.doneToast(gauge.name),
        actionLabel: t.common.undo,
        onAction: () => {
          if (!user) return;
          repository.removeExecution(gauge.id, { at, by: user.uid }).catch(fail);
        },
      });
    },
    [showToast, user],
  );
}
