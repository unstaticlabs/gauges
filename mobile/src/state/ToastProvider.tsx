import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { usePathname } from 'expo-router';

import { Toast } from '@/ui/components/Toast';

/**
 * A toast that is older than this goes away when the screen changes, so
 * that it does not cover a button of the new screen. A younger toast stays:
 * it belongs to the change, for example "archived" after the page closes.
 */
const KEEP_ON_SCREEN_CHANGE_MS = 700;

export interface ToastOptions {
  message: string;
  /** The text of the one button, for example "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** Default 5 seconds. */
  durationMs?: number;
  tone?: 'normal' | 'error';
}

interface ToastState extends ToastOptions {
  id: number;
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});

/**
 * Shows one short message at the bottom of the screen. A new message
 * replaces the old one. A screen change hides an old message.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(1);

  const show = useCallback<ShowToast>((options) => {
    setToast({ ...options, id: nextId.current++ });
  }, []);

  // A screen change hides an old toast. The check runs in the render of the change.
  const pathname = usePathname();
  const [shownPath, setShownPath] = useState(pathname);
  // The ID of the toast that is older than KEEP_ON_SCREEN_CHANGE_MS.
  const [settledId, setSettledId] = useState(0);
  if (pathname !== shownPath) {
    setShownPath(pathname);
    if (toast && settledId === toast.id) setToast(null);
  }

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => setSettledId(id), KEEP_ON_SCREEN_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.durationMs ?? 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const onAction = useMemo(
    () =>
      toast?.onAction
        ? () => {
            toast.onAction?.();
            setToast(null);
          }
        : undefined,
    [toast],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Toast
          key={toast.id}
          message={toast.message}
          tone={toast.tone ?? 'normal'}
          actionLabel={toast.actionLabel}
          onAction={onAction}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
