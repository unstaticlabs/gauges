import type { Label } from '@/domain';

/** What the current user can do with a label, by the rules in `backend/firestore.rules`. */
export function labelPermissions(label: Pick<Label, 'members' | 'createdBy'>, uid: string | undefined) {
  const shared = label.members.length > 1;
  return {
    shared,
    // The last member leaves by a delete, so "Leave" shows only on a shared label.
    canLeave: shared,
    canDelete: !shared || label.createdBy === uid,
  };
}
