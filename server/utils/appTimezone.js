// The household time zone (issue #193).
//
// The server runs on local time: chore days, midnight resets and the nightly
// job all read the process's own zone. That zone used to come only from TZ in
// .env / docker compose, so fixing a wrong one meant editing the compose file
// and recreating the container. An admin can now set it from the UI; the saved
// value wins over TZ, and clearing it goes back to TZ.

const SETTING_KEY = 'APP_TIMEZONE';
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * The canonical IANA name for `value`, or null if it is not a time zone this
 * runtime knows.
 *
 * Validation is not optional: Node accepts any string in process.env.TZ and
 * quietly runs on UTC when it does not recognise one, so a typo would shift
 * every chore day without a single error.
 */
function canonicalTimeZone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Which zone the server should run in, and why: a zone saved from the UI,
 * then TZ from the environment, then the long-standing default. An invalid
 * saved value is skipped rather than trusted, so a bad row cannot put the
 * server on UTC.
 */
function resolveAppTimezone({ saved, env } = {}) {
  const fromSetting = canonicalTimeZone(saved);
  const fromEnv = canonicalTimeZone(env);
  if (fromSetting) return { timezone: fromSetting, source: 'setting', envTimezone: fromEnv };
  if (fromEnv) return { timezone: fromEnv, source: 'env', envTimezone: fromEnv };
  return { timezone: DEFAULT_TIMEZONE, source: 'default', envTimezone: null };
}

module.exports = {
  SETTING_KEY,
  DEFAULT_TIMEZONE,
  canonicalTimeZone,
  resolveAppTimezone,
};
