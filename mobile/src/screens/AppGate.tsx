import { useEffect, useRef, useState, type ReactNode } from 'react';

import { getRepository } from '@/data';
import { t } from '@/i18n';
import { useSession, useToast } from '@/state';

import { StartScreen } from './account/StartScreen';
import { StatusView } from './StatusView';

/** After this time without a user, the gate offers to try the sign-in again. */
const SIGN_IN_TIMEOUT_MS = 15 * 1000;

/**
 * Shows the screens only when a user is signed in. Before that, it shows a
 * loading view. With no user, it shows the start screen: the login gate on
 * the web, and the choice after a log-out on the phone.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === 'signedOut') return <StartScreen />;
  if (status === 'loading') return <SignInWait />;
  return (
    <>
      <ResumeMerge />
      {children}
    </>
  );
}

/**
 * Ends a merge that stopped, for example because the app closed in the
 * middle. It runs one time for each start of the app.
 */
function ResumeMerge() {
  const showToast = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    getRepository()
      .resumeMerge()
      .then((report) => {
        if (report && report.gauges > 0) showToast({ message: t.account.merged(report.gauges) });
      })
      .catch(() => showToast({ message: t.account.mergeError, tone: 'error' }));
  }, [showToast]);

  return null;
}

/** A loading view. After a time, it offers to try the sign-in again. */
function SignInWait() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (slow) return;
    const timer = setTimeout(() => setSlow(true), SIGN_IN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [slow]);

  if (!slow) return <StatusView kind="loading" />;
  return (
    <StatusView
      kind="error"
      title={t.app.signInError}
      body={t.errors.offline}
      onRetry={() => {
        setSlow(false);
        getRepository()
          .signInAnonymously()
          .catch(() => setSlow(true));
      }}
    />
  );
}
