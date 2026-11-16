import type { ConfirmOptions } from './confirm';

export type { ConfirmOptions } from './confirm';

/** The web version: React Native Web has no `Alert`, so it uses the browser dialog. */
export function confirm({ title, message }: ConfirmOptions): Promise<boolean> {
  const text = message ? `${title}\n\n${message}` : title;
  return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
}
