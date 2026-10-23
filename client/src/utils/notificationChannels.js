// Admin → System → Notifications: what every way of delivering shares (the
// address a tap opens, the plugins that may notify), every device with
// browser push on, and the Home Assistant Companion app's phones. ntfy has its
// own (utils/ntfy.js); this device's browser push is utils/pushNotifications.js.
import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';

const base = `${API_BASE_URL}/api/notifications`;

/** { openUrl, plugins: [{ id, name }] } */
export const readNotificationSettings = async () => (await axios.get(`${base}/settings`)).data;
export const saveNotificationSettings = async (body) => (await axios.put(`${base}/settings`, body)).data;

/** { devices: [{ deviceName, events, members, language, lastSuccessAt, ... }] } */
export const listNotifyingDevices = async () => (await axios.get(`${base}/devices`)).data;

const phonePath = (phoneId) => `${base}/ha/phones/${encodeURIComponent(phoneId)}`;

/** { connected, phones: [{ phoneId, name, platform, enabled, missing?, ... }], error? } */
export const listHaPhones = async ({ fresh = false } = {}) => (await axios.get(`${base}/ha/phones${fresh ? '?fresh=1' : ''}`)).data;
export const saveHaPhone = async (phoneId, body) => (await axios.put(phonePath(phoneId), body)).data;
export const turnOffHaPhone = async (phoneId) => (await axios.delete(phonePath(phoneId))).data;
export const testHaPhone = async (phoneId) => (await axios.post(`${phonePath(phoneId)}/test`)).data;

/** A recipient's last send, for its row: 'failed', 'delivered' or null. */
export function lastSend({ lastSuccessAt, lastFailureAt, lastFailure }) {
  if (lastFailure && (!lastSuccessAt || lastFailureAt > lastSuccessAt)) return 'failed';
  return lastSuccessAt ? 'delivered' : null;
}
