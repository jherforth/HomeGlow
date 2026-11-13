// What the household calls chore points, and their emoji (issue #392). They
// were "clams" and 🥟; the default is now Stars and ⭐, and a household can
// pick its own in the Admin Panel. The client's twin is
// client/src/utils/points.js, which also translates the default name.
//
// Only what people read changes: columns, routes and plugin events still say
// clam (clam_value, /api/users/:id/clams, clam.deposited).

const POINTS_NAME_SETTING = 'POINTS_NAME';
const POINTS_ICON_SETTING = 'POINTS_ICON';
const DEFAULT_POINTS_NAME = 'Stars';
const DEFAULT_POINTS_ICON = '⭐';
const POINTS_NAME_MAX_LENGTH = 24;
// An emoji can be several code points (skin tones, ZWJ sequences, flags); the
// same cap as a chore's own icon.
const POINTS_ICON_MAX_LENGTH = 16;

/** A name as stored: spaces collapsed and trimmed, at most 24 characters; '' for the default. */
function normalizePointsName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, POINTS_NAME_MAX_LENGTH).join('').trim();
}

/**
 * An icon as stored: trimmed, and '' (the default) for anything that is not a
 * short run of symbols. The Admin Panel picks the emoji out of what was typed;
 * this only keeps words and long text from being stored as an icon.
 */
function normalizePointsIcon(value) {
  if (typeof value !== 'string') return '';
  const icon = value.trim();
  if (!icon || icon.length > POINTS_ICON_MAX_LENGTH || /[\p{L}\p{N}\s]/u.test(icon.replace(/[0-9#*]️?⃣/gu, ''))) return '';
  return icon;
}

/** The household's name and icon, defaults filled in. */
function readPoints(db) {
  let stored = {};
  try {
    const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)').all(POINTS_NAME_SETTING, POINTS_ICON_SETTING);
    stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch {
    // No settings table to read (a bare test database): the defaults.
  }
  return {
    name: normalizePointsName(stored[POINTS_NAME_SETTING]) || DEFAULT_POINTS_NAME,
    icon: normalizePointsIcon(stored[POINTS_ICON_SETTING]) || DEFAULT_POINTS_ICON,
  };
}

/** The value to store for a points setting, or undefined for any other key. */
function normalizePointsSetting(key, value) {
  if (key === POINTS_NAME_SETTING) return normalizePointsName(value);
  if (key === POINTS_ICON_SETTING) return normalizePointsIcon(value);
  return undefined;
}

module.exports = {
  POINTS_NAME_SETTING,
  POINTS_ICON_SETTING,
  DEFAULT_POINTS_NAME,
  DEFAULT_POINTS_ICON,
  normalizePointsName,
  normalizePointsIcon,
  normalizePointsSetting,
  readPoints,
};
