import { useCallback, useRef, useState, type ReactNode } from 'react';

import { getRepository } from '@/data';
import { useMyName, useSession } from '@/state';

import { NameSheet } from './NameSheet';

/**
 * Runs an action only when the user has a name. Without a name, it first
 * shows the name sheet, then runs the action after the save. Render the
 * returned `sheet` in the screen.
 */
export function useNameGate(): { gate: (action: () => void) => void; sheet: ReactNode } {
  const { user } = useSession();
  const { name, save } = useMyName();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const gate = useCallback(
    (action: () => void) => {
      if (typeof name === 'string' && name.length > 0) {
        action();
        return;
      }
      const ask = () => {
        pending.current = action;
        setOpen(true);
      };
      if (name === null || !user) {
        ask();
        return;
      }
      // The name is still loading. Read it now.
      getRepository()
        .getProfiles([user.uid])
        .then((profiles) => (profiles[0]?.name.trim() ? action() : ask()))
        .catch(ask);
    },
    [name, user],
  );

  const onSave = useCallback(
    async (value: string) => {
      await save(value);
      setOpen(false);
      const action = pending.current;
      pending.current = null;
      // Let the sheet close before the next sheet opens.
      setTimeout(() => action?.(), 350);
    },
    [save],
  );

  const sheet = open ? (
    <NameSheet
      visible
      onClose={() => {
        pending.current = null;
        setOpen(false);
      }}
      onSave={onSave}
    />
  ) : null;
  return { gate, sheet };
}
