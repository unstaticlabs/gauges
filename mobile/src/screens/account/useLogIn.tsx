import { useCallback, useRef, useState, type ReactNode } from 'react';

import { type DeviceData, getRepository, type LoginProvider, type MergeChoice } from '@/data';
import { errorMessage, t } from '@/i18n';
import { useReloadProfiles, useToast } from '@/state';

import { MergeSheet } from './MergeSheet';

export interface LogIn {
  logIn: (provider: LoginProvider) => Promise<void>;
  /** The provider of the login that runs now, or `null`. */
  busy: LoginProvider | null;
  /** Render it: the question before a merge. */
  sheet: ReactNode;
}

/**
 * Runs a login with the question before a merge, and shows the result as a
 * toast. A closed login window shows nothing.
 */
export function useLogIn(): LogIn {
  const showToast = useToast();
  const reloadProfiles = useReloadProfiles();
  const [busy, setBusy] = useState<LoginProvider | null>(null);
  const [question, setQuestion] = useState<DeviceData | null>(null);
  const answer = useRef<((choice: MergeChoice) => void) | null>(null);

  const decide = useCallback(
    (data: DeviceData) =>
      new Promise<MergeChoice>((resolve) => {
        answer.current = resolve;
        setQuestion(data);
      }),
    [],
  );

  const choose = useCallback((choice: MergeChoice) => {
    setQuestion(null);
    answer.current?.(choice);
    answer.current = null;
  }, []);

  const logIn = useCallback(
    async (provider: LoginProvider) => {
      setBusy(provider);
      try {
        const repository = getRepository();
        const result = await repository.logIn(provider, decide);
        // The login can give the profile a name (from the provider or the merge).
        const uid = repository.currentUser()?.uid;
        if (uid && result.kind !== 'cancelled') reloadProfiles([uid]);
        const name = t.account.providers[provider];
        if (result.kind === 'linked') showToast({ message: t.account.linked(name) });
        else if (result.kind === 'switched') showToast({ message: t.account.switched });
        else if (result.kind === 'merged') {
          const { gauges, skipped } = result.report;
          showToast({
            message: skipped > 0 ? t.account.mergeError : gauges > 0 ? t.account.merged(gauges) : t.account.mergedLabels,
            tone: skipped > 0 ? 'error' : 'normal',
          });
        }
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code !== 'cancelled') showToast({ message: errorMessage(error, t), tone: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [decide, reloadProfiles, showToast],
  );

  return { logIn, busy, sheet: <MergeSheet data={question} onChoose={choose} /> };
}
