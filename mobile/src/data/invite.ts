import type { LabelId } from '../domain/types';
import { WEBSITE_URL } from './config';

/**
 * The invite link format.
 *
 *   gauges://invite?label=<labelId>&code=<code>
 *   https://<host>/invite?label=<labelId>&code=<code>
 *
 * The app scheme and an https link have the same path and query, so the
 * router handles both with one route (`app/invite.tsx`). The code is the ID
 * of the invite document. It has 43 characters from the base64url alphabet.
 *
 * The app makes https links on the website. A phone with the app opens them
 * in the app. Other devices open the website, which asks for a login first.
 * The app still reads `gauges://` links, for links that older builds made.
 */

export const INVITE_SCHEME_BASE = 'gauges://';
export const INVITE_WEB_BASE = `${WEBSITE_URL}/`;
export const INVITE_PATH = 'invite';
export const INVITE_CODE_BYTES = 32;

/** The same pattern as `validCode` in `backend/firestore.rules`. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const LABEL_ID_PATTERN = /^[^/?#&=\s]{1,128}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Encodes bytes as base64url with no padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

export function isValidInviteCode(code: unknown): code is string {
  return typeof code === 'string' && CODE_PATTERN.test(code);
}

/** Builds the invite link. `base` is the website by default, or `gauges://`. */
export function buildInviteUrl(labelId: LabelId, code: string, base = INVITE_WEB_BASE): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${INVITE_PATH}?label=${encodeURIComponent(labelId)}&code=${encodeURIComponent(code)}`;
}

/**
 * Reads an invite link in either form. Gives `null` when the text is not a
 * valid invite link. It does not use `URL`, because React Native does not
 * implement all of it.
 */
export function parseInviteUrl(text: string): { labelId: LabelId; code: string } | null {
  if (typeof text !== 'string') return null;
  const [beforeHash] = text.trim().split('#');
  const queryStart = beforeHash.indexOf('?');
  if (queryStart < 0) return null;
  const path = beforeHash.slice(0, queryStart).replace(/\/+$/, '');
  if (!/^(gauges:\/\/\/?|https:\/\/[^/]+\/)(.*\/)?invite$/.test(path)) return null;

  const params: Record<string, string> = {};
  for (const pair of beforeHash.slice(queryStart + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return null;
    }
  }
  const labelId = params.label;
  const code = params.code;
  if (!labelId || !LABEL_ID_PATTERN.test(labelId) || !isValidInviteCode(code)) return null;
  return { labelId, code };
}
