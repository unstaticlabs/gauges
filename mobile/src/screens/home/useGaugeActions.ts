import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { getRepository } from '@/data';
import type { Gauge } from '@/domain';
import { errorMessage, t } from '@/i18n';
import { useToast } from '@/state';
import { confirm } from '@/ui/platform';

export interface GaugeActions {
  /** Opens the gauge page, where the user changes the settings of the gauge. */
  edit: (gauge: Gauge) => void;
  /** Archives the gauge and shows a toast with "Undo". */
  archive: (gauge: Gauge) => void;
  /** Asks first, then deletes the gauge. Gives `true` after a delete. */
  remove: (gauge: Gauge) => Promise<boolean>;
}

/** The actions of a gauge that the row and the gauge page share. */
export function useGaugeActions(): GaugeActions {
  const router = useRouter();
  const showToast = useToast();
  return useMemo(() => {
    const fail = (error: unknown) => showToast({ message: errorMessage(error, t), tone: 'error' });
    return {
      edit: (gauge) => router.push(`/gauge/${gauge.id}`),
      archive: (gauge) => {
        const repository = getRepository();
        repository.archiveGauge(gauge.id).catch(fail);
        showToast({
          message: t.gauge.archivedToast(gauge.name),
          actionLabel: t.common.undo,
          onAction: () => repository.unarchiveGauge(gauge.id).catch(fail),
        });
      },
      remove: async (gauge) => {
        const ok = await confirm({
          title: t.gauge.deleteConfirmTitle(gauge.name),
          message: t.gauge.deleteConfirmBody,
          confirmLabel: t.common.delete,
          cancelLabel: t.common.cancel,
          destructive: true,
        });
        if (ok) getRepository().deleteGauge(gauge.id).catch(fail);
        return ok;
      },
    };
  }, [router, showToast]);
}
