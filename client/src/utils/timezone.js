import { API_BASE_URL } from './apiConfig.js';

const FALLBACK_TIMEZONE = 'America/New_York';

let cachedTimezone = null;

export async function getServerTimezone() {
  if (cachedTimezone) return cachedTimezone;
  try {
    const response = await fetch(`${API_BASE_URL}/api/timezone`);
    const data = await response.json();
    cachedTimezone = data.timezone || FALLBACK_TIMEZONE;
  } catch {
    cachedTimezone = FALLBACK_TIMEZONE;
  }
  return cachedTimezone;
}

export function getServerTimezoneSync() {
  return cachedTimezone || FALLBACK_TIMEZONE;
}

export async function initTimezone() {
  await getServerTimezone();
}

/**
 * The server's zone and where it came from: `{ timezone, source, envTimezone }`,
 * source being 'setting' (saved in the Admin Panel), 'env' (TZ) or 'default'.
 */
export async function fetchServerTimezoneInfo() {
  const response = await fetch(`${API_BASE_URL}/api/timezone`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Save the household zone, or pass null to go back to TZ from the
 * environment. Updates this display's cache so it follows straight away.
 */
export async function saveServerTimezone(timezone) {
  const response = await fetch(`${API_BASE_URL}/api/timezone`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  cachedTimezone = data.timezone;
  return data;
}

/**
 * Notice when the household zone changes on another display (issue #193).
 *
 * Chore days and due times are worked out from the zone read at startup, so a
 * wall display left running needs to hear about a change. The server's event
 * stream cannot be relied on to reach every browser, so this polls — rarely,
 * since the zone almost never changes — and on each return to the page.
 * `onChange` defaults to a reload, which recomputes everything at once.
 */
export function watchServerTimezone({
  intervalMs = 15 * 60 * 1000,
  onChange = () => window.location.reload(),
} = {}) {
  const check = async () => {
    try {
      const { timezone } = await fetchServerTimezoneInfo();
      if (timezone && cachedTimezone && timezone !== cachedTimezone) {
        cachedTimezone = timezone;
        onChange(timezone);
      }
    } catch {
      // Offline or restarting: keep the zone we have and look again later.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  const timer = setInterval(check, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** This device's own zone, as the browser reports it. */
export function detectBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * "UTC−05:00" for `timeZone` at `date` — at that date, because daylight
 * saving moves it.
 */
export function formatUtcOffset(timeZone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName');
    const offset = part ? part.value.replace(/^GMT/, '') : '';
    return `UTC${offset ? offset.replace('-', '−') : '+00:00'}`;
  } catch {
    return '';
  }
}

/**
 * Every zone the browser knows, sorted by name, with `current` included even
 * if the list lacks it (older browsers leave out aliases like UTC).
 */
export function listTimeZones(current) {
  let zones = [];
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    zones = [];
  }
  const all = new Set(zones);
  all.add('UTC');
  if (current) all.add(current);
  return [...all].sort((a, b) => a.localeCompare(b));
}
