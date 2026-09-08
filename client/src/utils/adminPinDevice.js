import axios from 'axios';
import { getDeviceApiBase } from './deviceName.js';

/**
 * "Remember the PIN on this device" (issue: admin PIN per-device memory).
 *
 * A remembered device behaves exactly as if no admin PIN were set — scoped to
 * that device. That is the whole spec, and it is why the decision lives in one
 * pure function: the widget gate and the admin-panel gate must agree, or the
 * feature reads as broken on whichever one forgot.
 *
 * The flag lives in the device's server-side settings, not localStorage, so it
 * can be revoked from any device. Clearing browser data mints a new device id,
 * which has no flag — so it fails closed and the PIN is required again.
 */
export const ADMIN_PIN_REMEMBERED_KEY = 'adminPinRemembered';

/** Pure: does this device's settings blob say the PIN is remembered here? */
export function isPinRemembered(deviceSettings) {
  return deviceSettings?.[ADMIN_PIN_REMEMBERED_KEY] === true;
}

/**
 * Pure: the entire gate decision. Only a configured PIN prompts, and only when
 * this device has not been told to remember it.
 */
export function shouldPromptForPin({ pinExists, remembered }) {
  return pinExists === true && remembered !== true;
}

/** Reads the flag for THIS device. Any failure returns false, so we prompt. */
export async function fetchPinRemembered(apiBaseUrl) {
  try {
    const { data } = await axios.get(`${getDeviceApiBase(apiBaseUrl)}/settings`);
    return isPinRemembered(data);
  } catch (error) {
    console.error('Error reading device PIN setting:', error);
    return false;
  }
}

/** Sets or clears the flag for THIS device. */
export async function setPinRemembered(apiBaseUrl, remembered) {
  await axios.patch(`${getDeviceApiBase(apiBaseUrl)}/settings`, {
    [ADMIN_PIN_REMEMBERED_KEY]: remembered === true,
  });
}

/**
 * Clears the flag everywhere — the single revoke. Settles rather than racing so
 * one unreachable device cannot leave the rest remembered; the caller is told
 * how many failed rather than being told it worked.
 */
export async function forgetPinOnAllDevices(apiBaseUrl) {
  const { data } = await axios.get(`${apiBaseUrl}/api/devices`);
  const devices = Array.isArray(data) ? data : [];

  const results = await Promise.allSettled(devices.map((device) => axios.patch(
    `${apiBaseUrl}/api/devices/${encodeURIComponent(device.name)}/settings`,
    { [ADMIN_PIN_REMEMBERED_KEY]: false },
  )));

  return {
    total: devices.length,
    failed: results.filter((r) => r.status === 'rejected').length,
  };
}
