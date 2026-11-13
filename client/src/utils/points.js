// What the household calls the points chores earn, and the emoji beside them
// (issue #392). They were "clams" and 🥟, a regional joke that doesn't
// translate; the default is now Stars and ⭐, and a household can pick its own.
//
// Two household settings, blank meaning the default:
// - POINTS_NAME: the name as the household writes it ("Stars", "Robux", "XP"),
//   used as-is in every language. Blank means the default name, which is
//   translated (common:points.defaultName).
// - POINTS_ICON: one emoji. Blank means ⭐.
//
// Every translated string can say {{points}} and {{pointsIcon}} without its
// caller passing them: they are i18next default variables (i18n/index.js), so
// a rename reaches every widget without each one having to ask.
//
// Code, the API and the database still say "clam" (clam_value, clam_total,
// /api/users/:id/clams, the clam.deposited plugin event). Renaming those would
// break plugins and gain nothing anyone sees.
import { extractCustomEmoji } from './choreIcons.js';

export const POINTS_NAME_SETTING = 'POINTS_NAME';
export const POINTS_ICON_SETTING = 'POINTS_ICON';
export const DEFAULT_POINTS_ICON = '⭐';
// Offered in the Admin Panel beside a field that takes any emoji; ⭐ first as
// the default, 🥟 for households that liked their clams.
export const POINTS_ICON_SUGGESTIONS = ['⭐', '🪙', '💎', '🏆', '🍪', '🎟️', '❤️', '🥟'];
// Long enough for any currency name, short enough for a chip.
export const POINTS_NAME_MAX_LENGTH = 24;
// Emitted on i18next when the name or icon changes; react-i18next re-renders
// on it (i18n/index.js `bindI18n`).
export const POINTS_CHANGED_EVENT = 'pointsChanged';

/** A name as stored: spaces collapsed and trimmed, at most 24 characters; '' for the default. */
export function normalizePointsName(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, POINTS_NAME_MAX_LENGTH).join('').trim();
}

/** An icon as stored: the one emoji in what was typed or pasted; '' for the default. */
export function normalizePointsIcon(value) {
  return extractCustomEmoji(typeof value === 'string' ? value : '');
}

/** The household's own choices out of a settings object; '' where it has none. */
export function readHouseholdPoints(settings) {
  return {
    name: normalizePointsName(settings?.[POINTS_NAME_SETTING]),
    icon: normalizePointsIcon(settings?.[POINTS_ICON_SETTING]),
  };
}

/** The interpolation variables for a choice, given the default name in the current language. */
export function resolvePointsVariables({ name, icon } = {}, defaultName = 'Stars') {
  return {
    points: name || defaultName,
    pointsIcon: icon || DEFAULT_POINTS_ICON,
  };
}

// One object, changed in place: i18next keeps the reference it was given at
// init and reads it on every t() call.
export const pointsVariables = resolvePointsVariables();

let household = { name: '', icon: '' };

/** Recomputes the variables, e.g. after a language change, which changes the default name. */
export function refreshPointsVariables(i18n) {
  Object.assign(pointsVariables, resolvePointsVariables(household, i18n.t('common:points.defaultName')));
}

/**
 * Applies the household's name and icon from a settings object that was read
 * with both keys in it (absent means default), and re-renders what's on screen
 * if either changed. Returns whether anything changed.
 */
export function applyHouseholdPoints(i18n, settings) {
  const next = readHouseholdPoints(settings);
  if (next.name === household.name && next.icon === household.icon) return false;
  household = next;
  refreshPointsVariables(i18n);
  i18n.emit(POINTS_CHANGED_EVENT);
  return true;
}
