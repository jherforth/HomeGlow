import { afterEach, describe, expect, it } from 'vitest';
import { CHORE_ICON_MAX_LENGTH, extractCustomEmoji } from './choreIcons.js';

describe('extractCustomEmoji', () => {
  it('takes a single emoji as it is', () => {
    expect(extractCustomEmoji('🎃')).toBe('🎃');
    expect(extractCustomEmoji('❤️')).toBe('❤️');
  });

  it('keeps sequences whole: skin tones, ZWJ families, flags, keycaps', () => {
    expect(extractCustomEmoji('👍🏽')).toBe('👍🏽');
    expect(extractCustomEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(extractCustomEmoji('🧑‍🍳')).toBe('🧑‍🍳');
    expect(extractCustomEmoji('🇺🇸')).toBe('🇺🇸');
    expect(extractCustomEmoji('🏴󠁧󠁢󠁥󠁮󠁧󠁿')).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿');
    expect(extractCustomEmoji('1️⃣')).toBe('1️⃣');
    expect(extractCustomEmoji('#️⃣')).toBe('#️⃣');
  });

  it('drops letters, digits and spaces around it', () => {
    expect(extractCustomEmoji('  🎃 ')).toBe('🎃');
    expect(extractCustomEmoji('pumpkin 🎃!')).toBe('🎃');
  });

  it('takes the last emoji, so typing a second replaces the first', () => {
    expect(extractCustomEmoji('🎃🍕')).toBe('🍕');
  });

  it('finds nothing in plain text', () => {
    expect(extractCustomEmoji('abc')).toBe('');
    expect(extractCustomEmoji('123')).toBe('');
    expect(extractCustomEmoji('')).toBe('');
    expect(extractCustomEmoji(undefined)).toBe('');
  });

  it('refuses an emoji longer than the server keeps, rather than cutting it', () => {
    const long = ['👨', '👩', '👧', '👦', '👶', '👵'].join('\u200D');
    expect(long.length).toBeGreaterThan(CHORE_ICON_MAX_LENGTH);
    expect(extractCustomEmoji(long)).toBe('');
  });

  describe('without Intl.Segmenter (Firefox before 125)', () => {
    const Segmenter = Intl.Segmenter;
    afterEach(() => { Intl.Segmenter = Segmenter; });

    it('still finds whole emoji', () => {
      Intl.Segmenter = undefined;
      expect(extractCustomEmoji('pumpkin 🎃')).toBe('🎃');
      expect(extractCustomEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
      expect(extractCustomEmoji('🇺🇸')).toBe('🇺🇸');
      expect(extractCustomEmoji('1️⃣')).toBe('1️⃣');
      expect(extractCustomEmoji('abc')).toBe('');
    });
  });
});
