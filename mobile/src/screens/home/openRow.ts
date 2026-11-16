import { makeMutable } from 'react-native-reanimated';

/**
 * Only one gauge row is open at a time. A row that opens closes the row that
 * was open before. A scroll, a tap on a row, and a move to another screen
 * close the open row.
 */
let current: { id: string; close: () => void } | null = null;

/** `true` while a row is open. The rows read it on the UI thread to turn on the tap that closes. */
export const anyRowOpen = makeMutable(false);

/** A row calls this when it rests open. */
export function rowOpened(id: string, close: () => void): void {
  if (current && current.id !== id) current.close();
  current = { id, close };
  anyRowOpen.value = true;
}

/** A row calls this when it closes. */
export function rowClosed(id: string): void {
  if (current?.id !== id) return;
  current = null;
  anyRowOpen.value = false;
}

/** Closes the open row, except the row `exceptId` (the row that the user drags now). */
export function closeOpenRow(exceptId?: string): void {
  if (current && current.id !== exceptId) current.close();
}
