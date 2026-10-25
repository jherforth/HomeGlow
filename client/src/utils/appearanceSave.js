// Appearance saves that touch only their own fields. The household value
// lives in the settings table and a display's overrides live in its device
// settings, and the device PATCH replaces the whole `appearance` object —
// so a card that sent only its own fields would silently wipe the other
// card's overrides. Every save here therefore reads the stored value
// first and merges: a card's fields replace the stored ones, fields it
// does not own are left exactly as stored, and a device-scope field marked
// "use household" is dropped from the overrides instead of sent.
//
// That read-then-merge is also what makes the review's check pass: save
// dimming, then save Appearance without reloading, and the dimming setting
// survives, because the Appearance save re-reads the stored dimming
// rather than writing back its own stale draft — and vice versa.

import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';
import { getDeviceApiBase } from './deviceName.js';
import {
  APPEARANCE_SETTING_KEY,
  normalizeDeviceAppearance,
  normalizeHouseholdAppearance,
} from './appearance.js';

/** The household appearance with `partial` merged in (stored fields win unless replaced). Pure. */
export function mergeHouseholdAppearance(stored, partial) {
  return { ...normalizeHouseholdAppearance(stored), ...partial };
}

/**
 * A display's overrides with `partial` merged in. Fields named in
 * `useHousehold` are dropped from the overrides, so the display follows
 * the household for them again. Pure.
 */
export function mergeDeviceOverrides(current, partial, useHousehold = []) {
  const next = { ...normalizeDeviceAppearance(current), ...partial };
  for (const field of useHousehold) delete next[field];
  return next;
}

/**
 * Save `partial` appearance fields. `scope` is 'household' or 'device';
 * `useHousehold` (device scope only) names fields that should follow the
 * household, dropping their overrides. Fields outside `partial` (and
 * outside `useHousehold`) are left exactly as stored.
 */
export async function saveAppearanceFields(scope, partial, { useHousehold = [] } = {}) {
  if (scope === 'household') {
    const { data } = await axios.get(`${API_BASE_URL}/api/settings`, { params: { keys: APPEARANCE_SETTING_KEY } });
    await axios.post(`${API_BASE_URL}/api/settings`, {
      key: APPEARANCE_SETTING_KEY,
      value: JSON.stringify(mergeHouseholdAppearance(data?.[APPEARANCE_SETTING_KEY], partial)),
    });
    return;
  }
  const apiDeviceUrl = getDeviceApiBase(API_BASE_URL);
  const { data } = await axios.get(`${apiDeviceUrl}/settings`);
  await axios.patch(`${apiDeviceUrl}/settings`, {
    appearance: mergeDeviceOverrides(data?.appearance, partial, useHousehold),
  });
}
