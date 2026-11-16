import { normalizeForSearch } from './search';
import type { Label } from './types';

/** The emoji of a label that has none. */
export const DEFAULT_LABEL_EMOJI = '🏷️';

/** The emoji of the group of gauges that have no label. */
export const NO_LABEL_EMOJI = '📋';

/**
 * The longest emoji text that the app writes, in UTF-16 code units. The
 * longest real emoji (a family, or the flag of Scotland) have 14. The rules
 * accept up to 32 characters.
 */
export const EMOJI_MAX_LENGTH = 16;

/** The emoji that the picker suggests: things of a household. */
export const SUGGESTED_EMOJI: readonly string[] = [
  '🏠', '🪴', '🚗', '🍳', '🛁', '🧺',
  '🛒', '🧹', '🐈', '🐕', '🧸', '💊',
  '🏃', '💼', '💶', '🎒', '🗑️', '🔧',
  '🚲', '💧', '🌳', '📚', '🎮', '❤️',
];

const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;

const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
const isKeycapBase = (cp: number) => (cp >= 0x30 && cp <= 0x39) || cp === 0x23 || cp === 0x2a;

/** `true` for a code point that starts an emoji. The list covers the emoji blocks of Unicode 16. */
function isPictographic(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff && !isRegional(cp) && !isSkinTone(cp)) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    (cp >= 0x2190 && cp <= 0x21ff) ||
    (cp >= 0x25a0 && cp <= 0x25ff) ||
    (cp >= 0x2900 && cp <= 0x297f) ||
    [0xa9, 0xae, 0x203c, 0x2049, 0x2122, 0x2139, 0x24c2, 0x3030, 0x303d, 0x3297, 0x3299].includes(cp)
  );
}

/**
 * Finds the emoji in a text, each one whole: an emoji with a skin tone, a
 * family joined with zero-width joiners, a flag, or a keycap counts as one.
 * Other characters are skipped. The code does not need `Intl.Segmenter`,
 * which Hermes does not have.
 */
export function findEmoji(text: string): string[] {
  const cps = Array.from(text, (c) => c.codePointAt(0) ?? 0);
  const result: string[] = [];
  let i = 0;
  while (i < cps.length) {
    const cp = cps[i];
    const start = i;
    if (isRegional(cp) && isRegional(cps[i + 1] ?? 0)) {
      i += 2;
    } else if (isKeycapBase(cp) && (cps[i + 1] === KEYCAP || (cps[i + 1] === VS16 && cps[i + 2] === KEYCAP))) {
      i += cps[i + 1] === KEYCAP ? 2 : 3;
    } else if (isPictographic(cp)) {
      i += 1;
      for (;;) {
        const next = cps[i];
        if (next === VS16 || next === VS15 || (next !== undefined && (isSkinTone(next) || isTag(next)))) {
          i += 1;
        } else if (next === ZWJ && cps[i + 1] !== undefined && isPictographic(cps[i + 1])) {
          i += 2;
        } else {
          break;
        }
      }
    } else {
      i += 1;
      continue;
    }
    result.push(String.fromCodePoint(...cps.slice(start, i)));
  }
  return result;
}

/** Gives the text when it is exactly one emoji (spaces around it are allowed), or `null`. */
export function singleEmoji(text: string): string | null {
  const trimmed = text.trim();
  const found = findEmoji(trimmed);
  return found.length === 1 && found[0] === trimmed && trimmed.length <= EMOJI_MAX_LENGTH ? trimmed : null;
}

/** Gives the last emoji in a text, or `null`. The free field of the picker keeps only this one. */
export function lastEmoji(text: string): string | null {
  const found = findEmoji(text);
  const last = found[found.length - 1];
  return last && last.length <= EMOJI_MAX_LENGTH ? last : null;
}

/** The emoji to show for a label: its own, or the default. */
export function labelEmoji(label: Pick<Label, 'emoji'>): string {
  return label.emoji ?? DEFAULT_LABEL_EMOJI;
}

// Words in French and English, without accents, and the emoji they suggest.
const KEYWORDS: readonly [readonly string[], string][] = [
  [['maison', 'home', 'house', 'appart', 'flat', 'casa', 'chez'], '🏠'],
  [['plante', 'plant', 'jardin', 'garden', 'fleur', 'flower', 'potager'], '🪴'],
  [['voiture', 'car', 'auto', 'moto'], '🚗'],
  [['velo', 'bike', 'bicycle'], '🚲'],
  [['cuisine', 'kitchen', 'repas', 'meal', 'cook'], '🍳'],
  [['bain', 'bath', 'douche', 'shower', 'toilet', 'wc'], '🛁'],
  [['linge', 'laundry', 'lessive', 'vetement', 'clothes'], '🧺'],
  [['course', 'shopping', 'grocer', 'supermarche'], '🛒'],
  [['menage', 'clean', 'nettoy'], '🧹'],
  [['chat', 'cat', 'cats'], '🐈'],
  [['chien', 'dog'], '🐕'],
  [['bebe', 'baby', 'enfant', 'kid', 'child'], '🧸'],
  [['sante', 'health', 'medic', 'pharma'], '💊'],
  [['sport', 'gym', 'fitness', 'run'], '🏃'],
  [['travail', 'work', 'bureau', 'office', 'boulot'], '💼'],
  [['argent', 'money', 'facture', 'bill', 'banque', 'bank', 'impot', 'tax', 'papier', 'admin'], '💶'],
  [['ecole', 'school'], '🎒'],
  [['poubelle', 'trash', 'dechet', 'bin'], '🗑️'],
  [['bricolage', 'diy', 'outil', 'tool', 'repar'], '🔧'],
  [['aquarium', 'poisson', 'fish'], '🐠'],
];

/**
 * Suggests an emoji for the name of a new label, for example 🪴 for
 * "Plantes". Gives `null` when no word matches: the label then shows the
 * default emoji until the user picks one.
 */
export function suggestEmoji(name: string): string | null {
  const own = findEmoji(name)[0];
  if (own && own.length <= EMOJI_MAX_LENGTH) return own;
  const words = normalizeForSearch(name).split(/[^a-z0-9]+/).filter(Boolean);
  for (const [keys, emoji] of KEYWORDS) {
    if (words.some((word) => keys.some((key) => word === key || (key.length >= 4 && word.startsWith(key))))) {
      return emoji;
    }
  }
  return null;
}
