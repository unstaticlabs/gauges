import { useMemo } from 'react';

import type { UserId } from '@/domain';
import { t } from '@/i18n';
import { useProfileNames, useSession } from '@/state';
import type { AvatarPerson } from '@/ui/components';

/**
 * Gives the people for an avatar stack, in the order of `ids`, and the text
 * that screen readers read for it.
 */
export function useAvatarPeople(ids: readonly UserId[]): { people: AvatarPerson[]; label: string } {
  const { user } = useSession();
  const names = useProfileNames(ids);
  return useMemo(() => {
    const people = ids.map((id) => ({ id, name: names.get(id) ?? null }));
    const spoken = people.map((p) => (p.id === user?.uid ? t.labels.you : p.name ?? t.labels.someone));
    return { people, label: t.labels.sharedWith(spoken.join(', ')) };
  }, [ids, names, user?.uid]);
}
