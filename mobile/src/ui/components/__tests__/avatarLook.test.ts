import { AVATAR_COLORS, avatarColor, avatarColors, initials } from '../avatarLook';

describe('avatarColor', () => {
  it('gives the same color for the same ID', () => {
    expect(avatarColor('abc')).toBe(avatarColor('abc'));
    expect(AVATAR_COLORS).toContain(avatarColor('some-user-id'));
  });

  it('spreads IDs over more than one color', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    expect(new Set(ids.map(avatarColor)).size).toBeGreaterThan(4);
  });
});

describe('initials', () => {
  it('gives the first letters of the first two words', () => {
    expect(initials('Anna')).toBe('A');
    expect(initials('  anna  maria lopez ')).toBe('AM');
    expect(initials('Élodie')).toBe('É');
  });

  it('keeps an emoji whole', () => {
    expect(initials('🌱 Garden')).toBe('🌱G');
  });

  it('gives null for no name', () => {
    expect(initials('')).toBeNull();
    expect(initials('   ')).toBeNull();
    expect(initials(undefined)).toBeNull();
  });
});

describe('avatarColors', () => {
  // Find two IDs with the same base color.
  const ids = Array.from({ length: 50 }, (_, i) => `u${i}`);
  const first = ids[0];
  const twin = ids.find((id) => id !== first && avatarColor(id) === avatarColor(first))!;

  it('gives two members with the same base color two different colors', () => {
    const colors = avatarColors([first, twin]);
    expect(colors.get(first)).not.toBe(colors.get(twin));
  });

  it('gives the same result for any order of the members', () => {
    expect([...avatarColors([twin, first]).entries()].sort()).toEqual([...avatarColors([first, twin]).entries()].sort());
  });

  it('keeps the base color when there is no clash', () => {
    const other = ids.find((id) => avatarColor(id) !== avatarColor(first))!;
    expect(avatarColors([first, other]).get(other)).toBe(avatarColor(other));
  });
});
