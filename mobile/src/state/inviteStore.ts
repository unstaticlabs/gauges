import type { InvitePayload } from '@/data';

import { readStored, STORAGE_KEYS, writeStored } from './storage';

/**
 * Remembers the invite of each label on this device. Members cannot read
 * invites from the database, so the app keeps the code here to show the
 * same QR code again, and to revoke it with "Reset link".
 */

/** The days that a new invite is valid. */
export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** An invite that expires sooner than this is not shown again. A new one replaces it. */
const MIN_LEFT_MS = 60 * 60 * 1000;

type StoredInvites = Record<string, InvitePayload>;

/** Gives the expiry time of a new invite. */
export function newInviteExpiry(now: number): number {
  return now + INVITE_DAYS * DAY_MS;
}

/** `true` when the stored invite can still be shown. */
export function isUsable(invite: InvitePayload | undefined, now: number): invite is InvitePayload {
  return !!invite && (invite.expiresAt === null || invite.expiresAt - now > MIN_LEFT_MS);
}

export async function getStoredInvite(uid: string, labelId: string): Promise<InvitePayload | undefined> {
  const all = (await readStored<StoredInvites>(STORAGE_KEYS.invites(uid))) ?? {};
  return all[labelId];
}

/** Stores the invite of a label, or forgets it with `null`. It also drops old entries. */
export async function setStoredInvite(
  uid: string,
  labelId: string,
  invite: InvitePayload | null,
  now: number,
): Promise<void> {
  const key = STORAGE_KEYS.invites(uid);
  const all = (await readStored<StoredInvites>(key)) ?? {};
  const kept: StoredInvites = {};
  for (const [id, value] of Object.entries(all)) {
    if (id !== labelId && value.expiresAt !== null && value.expiresAt > now) kept[id] = value;
  }
  if (invite) kept[labelId] = invite;
  await writeStored(key, kept);
}
