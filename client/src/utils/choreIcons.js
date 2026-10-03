// The chore icon bank (issue #141).
//
// Emoji rather than an icon-font glyph, for three reasons: the requested set
// (toothbrush, broom, rake, litter box, snow shovel, vegetables…) has no
// equivalent in Material Icons; colour is far easier for a pre-reader to
// recognise at 20px than a monochrome outline; and it matches the visual
// language the app already speaks (🥟 clams, 🏆 celebration).
//
// `key` is a stable identifier used only for the translated picker label. What
// gets persisted on the chore is the emoji character itself, so the bank can
// grow without a migration and a chore carrying an emoji we later drop from the
// bank still renders correctly.

export const CHORE_ICON_GROUPS = [
  {
    key: 'bedroom',
    icons: [
      { key: 'bed', emoji: '🛏️' },
      { key: 'clothes', emoji: '👕' },
      { key: 'laundry', emoji: '🧺' },
      { key: 'shoes', emoji: '👟' },
      { key: 'toys', emoji: '🧸' },
      { key: 'backpack', emoji: '🎒' },
    ],
  },
  {
    key: 'bathroom',
    icons: [
      { key: 'toothbrush', emoji: '🪥' },
      { key: 'shower', emoji: '🚿' },
      { key: 'bath', emoji: '🛁' },
      { key: 'toilet', emoji: '🚽' },
      { key: 'soap', emoji: '🧼' },
      { key: 'hair', emoji: '💇' },
    ],
  },
  {
    key: 'cleaning',
    icons: [
      { key: 'broom', emoji: '🧹' },
      { key: 'mop', emoji: '🧽' },
      // Unicode has no vacuum. A cyclone reads as suction well enough and is
      // the least-wrong option; broom covers sweeping if this looks odd.
      { key: 'vacuum', emoji: '🌀' },
      { key: 'bucket', emoji: '🪣' },
      { key: 'trash', emoji: '🗑️' },
      { key: 'recycling', emoji: '♻️' },
    ],
  },
  {
    key: 'kitchen',
    icons: [
      { key: 'dishes', emoji: '🍽️' },
      { key: 'silverware', emoji: '🍴' },
      { key: 'cup', emoji: '🥤' },
      { key: 'fridge', emoji: '🧊' },
      { key: 'sink', emoji: '🚰' },
      { key: 'meal', emoji: '🍝' },
      { key: 'vegetables', emoji: '🥦' },
      { key: 'apple', emoji: '🍎' },
    ],
  },
  {
    key: 'living',
    icons: [
      { key: 'couch', emoji: '🛋️' },
      // No table emoji either; a chair is the closest for "clear the table".
      { key: 'chair', emoji: '🪑' },
      { key: 'plants', emoji: '🪴' },
      { key: 'lamp', emoji: '💡' },
      { key: 'books', emoji: '📚' },
      { key: 'mail', emoji: '📬' },
    ],
  },
  {
    key: 'pets',
    icons: [
      { key: 'cat', emoji: '🐱' },
      { key: 'dog', emoji: '🐶' },
      { key: 'fish', emoji: '🐟' },
      { key: 'bird', emoji: '🐦' },
      { key: 'litterBox', emoji: '🐾' },
      { key: 'bone', emoji: '🦴' },
    ],
  },
  {
    key: 'outdoor',
    icons: [
      { key: 'rake', emoji: '🍂' },
      { key: 'snowShovel', emoji: '❄️' },
      { key: 'lawn', emoji: '🌱' },
      { key: 'pool', emoji: '🏊' },
      { key: 'car', emoji: '🚗' },
      { key: 'watering', emoji: '💧' },
    ],
  },
  {
    key: 'school',
    icons: [
      { key: 'homework', emoji: '📝' },
      { key: 'reading', emoji: '📖' },
      { key: 'music', emoji: '🎵' },
      { key: 'computer', emoji: '💻' },
      { key: 'clock', emoji: '⏰' },
      { key: 'star', emoji: '⭐' },
    ],
  },
];

/** Flat list of every emoji in the bank, in group order. */
export const CHORE_ICONS = CHORE_ICON_GROUPS.flatMap((group) =>
  group.icons.map((icon) => ({ ...icon, group: group.key }))
);

/**
 * Look up a bank entry by its emoji, for the picker's selected state. Returns
 * undefined for an emoji that is no longer in the bank — callers should still
 * render the raw character in that case rather than treating it as missing.
 */
export const findChoreIcon = (emoji) => CHORE_ICONS.find((icon) => icon.emoji === emoji);

/** Translation key for an emoji's label, falling back to a generic one. */
export const choreIconLabelKey = (emoji) => {
  const entry = findChoreIcon(emoji);
  return entry ? `chores:icons.${entry.key}` : null;
};

export const CHORE_ICON_MAX_LENGTH = 16;

const EMOJI_REGEX = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})/u;

/**
 * Validate and extract a single emoji from user input.
 * Strips alphanumeric characters and rejects non-emoji input.
 * Supports multi-codepoint / ZWJ sequences up to CHORE_ICON_MAX_LENGTH characters.
 */
export function extractCustomEmoji(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  let segments = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    segments = Array.from(segmenter.segment(trimmed), (s) => s.segment);
  } else {
    const emojiClusterRegex = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|[\u{1F3FB}-\u{1F3FF}]|\u200D|\p{Extended_Pictographic})*)/gu;
    segments = trimmed.match(emojiClusterRegex) || [];
  }

  const valid = segments.filter((seg) => {
    if (!seg || seg.length > CHORE_ICON_MAX_LENGTH) return false;
    if (/[a-zA-Z0-9]/.test(seg)) return false;
    return EMOJI_REGEX.test(seg);
  });

  if (valid.length === 0) return '';
  return valid[valid.length - 1];
}
