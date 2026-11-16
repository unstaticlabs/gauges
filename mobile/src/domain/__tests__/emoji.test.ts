import { DEFAULT_LABEL_EMOJI, findEmoji, labelEmoji, lastEmoji, singleEmoji, suggestEmoji } from '../emoji';

describe('findEmoji', () => {
  it('keeps joined emoji, skin tones, flags, and keycaps whole', () => {
    expect(findEmoji('a🏠b')).toEqual(['🏠']);
    expect(findEmoji('👨‍👩‍👧‍👦')).toEqual(['👨‍👩‍👧‍👦']);
    expect(findEmoji('👍🏽')).toEqual(['👍🏽']);
    expect(findEmoji('🇫🇷🇪🇸')).toEqual(['🇫🇷', '🇪🇸']);
    expect(findEmoji('1️⃣')).toEqual(['1️⃣']);
    expect(findEmoji('🏴󠁧󠁢󠁳󠁣󠁴󠁿')).toEqual(['🏴󠁧󠁢󠁳󠁣󠁴󠁿']);
    expect(findEmoji('❤️🗑️')).toEqual(['❤️', '🗑️']);
  });

  it('skips letters and digits', () => {
    expect(findEmoji('Home 12')).toEqual([]);
  });
});

describe('singleEmoji', () => {
  it('accepts exactly one emoji', () => {
    expect(singleEmoji(' 🪴 ')).toBe('🪴');
    expect(singleEmoji('👩🏽‍🍳')).toBe('👩🏽‍🍳');
  });

  it('refuses text, two emoji, or nothing', () => {
    expect(singleEmoji('a')).toBeNull();
    expect(singleEmoji('🪴🚗')).toBeNull();
    expect(singleEmoji('🪴 a')).toBeNull();
    expect(singleEmoji('')).toBeNull();
  });
});

describe('lastEmoji', () => {
  it('keeps the last emoji that the user typed', () => {
    expect(lastEmoji('🏠🚗')).toBe('🚗');
    expect(lastEmoji('abc')).toBeNull();
  });
});

describe('labelEmoji and suggestEmoji', () => {
  it('shows the default when a label has no emoji', () => {
    expect(labelEmoji({})).toBe(DEFAULT_LABEL_EMOJI);
    expect(labelEmoji({ emoji: '🚗' })).toBe('🚗');
  });

  it('suggests an emoji from French and English words', () => {
    expect(suggestEmoji('Plantes')).toBe('🪴');
    expect(suggestEmoji('La maison')).toBe('🏠');
    expect(suggestEmoji('Voiture')).toBe('🚗');
    expect(suggestEmoji('Garden')).toBe('🪴');
    expect(suggestEmoji('Ménage')).toBe('🧹');
    expect(suggestEmoji('🎸 Music')).toBe('🎸');
    expect(suggestEmoji('Zorglub')).toBeNull();
  });
});
