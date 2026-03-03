import { API_BASE_URL } from './apiConfig.js';

let cachedTimezone = null;

export async function getServerTimezone() {
  if (cachedTimezone) return cachedTimezone;
  try {
    const response = await fetch(`${API_BASE_URL}/api/timezone`);
    const data = await response.json();
    cachedTimezone = data.timezone || 'America/New_York';
  } catch {
    cachedTimezone = 'America/New_York';
  }
  return cachedTimezone;
}

export function getServerTimezoneSync() {
  return cachedTimezone || 'America/New_York';
}

export async function initTimezone() {
  await getServerTimezone();
}
