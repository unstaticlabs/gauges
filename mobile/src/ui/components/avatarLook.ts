/**
 * The look of an avatar: the initials and a stable color. Pure functions, so
 * that a test can check them.
 */

/** Colors that keep white text readable in light and dark mode. */
export const AVATAR_COLORS = [
  '#3B7DD8',
  '#8E5BD0',
  '#D0548A',
  '#D9693B',
  '#2F9E7A',
  '#C2912A',
  '#4E8C3A',
  '#5A6B8C',
] as const;

/** Gives the same color for the same user ID on each device. */
export function avatarColor(userId: string): string {
  // FNV-1a: a small hash with a good spread for short strings.
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];
}

/**
 * Gives one or two initials: the first letter of the first two words.
 * Gives `null` for an empty name, so that the avatar can show an icon.
 */
export function initials(name: string | null | undefined): string | null {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0]);
  return letters.join('').toLocaleUpperCase();
}

/**
 * Gives a color for each user in a group, such as the members of a label.
 * Each user keeps the color of `avatarColor` when it is free. When two users
 * would get the same color, the next free color goes to the user whose ID
 * sorts later. The order does not depend on the order of `ids`, so each
 * member of the group sees the same colors.
 */
export function avatarColors(ids: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const id of [...new Set(ids)].sort()) {
    let index = AVATAR_COLORS.indexOf(avatarColor(id) as (typeof AVATAR_COLORS)[number]);
    for (let tries = 0; tries < AVATAR_COLORS.length && used.has(AVATAR_COLORS[index]); tries += 1) {
      index = (index + 1) % AVATAR_COLORS.length;
    }
    result.set(id, AVATAR_COLORS[index]);
    used.add(AVATAR_COLORS[index]);
  }
  return result;
}
