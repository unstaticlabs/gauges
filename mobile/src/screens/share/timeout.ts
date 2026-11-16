import { DataError } from '@/data';

/**
 * Rejects with a `DataError` of code `unavailable` when the promise does not
 * settle in time. A write made offline does not fail: it waits in the local
 * queue. A join or an invite is useless until the server has it, so the
 * screens stop the wait and say that the device is offline.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DataError('unavailable', 'No answer from the server.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The time that the share and join screens wait for the server. */
export const SERVER_WAIT_MS = 15 * 1000;
