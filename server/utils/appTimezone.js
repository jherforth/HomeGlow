// The household time zone (issue #193).
//
// The server runs on local time: chore days, midnight resets and the nightly
// job all read the process's own zone. In order of precedence it comes from:
//   1. a zone saved from the Admin Panel,
//   2. TZ from .env / docker compose,
//   3. the host machine's own zone,
//   4. America/New_York, the long-standing default, if nothing else is known.

const fs = require('fs');
const path = require('path');

const SETTING_KEY = 'APP_TIMEZONE';
const DEFAULT_TIMEZONE = 'America/New_York';

// Where docker compose mounts the host's /etc/localtime. Deliberately not
// /etc/localtime itself: that is a symlink in the image, and Docker follows it,
// so a mount there overwrites the zoneinfo file the link names and Node goes
// on reporting the link's zone (UTC).
const HOST_LOCALTIME_PATH = '/host/localtime';
const ZONEINFO_DIR = '/usr/share/zoneinfo';

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

// Zone names listed in zone1970.tab are the canonical, location-based ones.
// Several names share identical zoneinfo data (Europe/Berlin and
// Arctic/Longyearbyen, say); this picks the one a person would expect.
function readCanonicalZoneList(zoneinfoDir) {
  try {
    return new Set(
      fs.readFileSync(path.join(zoneinfoDir, 'zone1970.tab'), 'utf8')
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('\t')[2])
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

/**
 * The zone name whose zoneinfo data matches `localtimePath` byte for byte, or
 * null. A mounted /etc/localtime is a copy of the host's zone file with no
 * name attached, so the name has to be found by comparison.
 */
function zoneFromLocaltimeFile(localtimePath = HOST_LOCALTIME_PATH, zoneinfoDir = ZONEINFO_DIR) {
  let target;
  try {
    target = fs.readFileSync(localtimePath);
  } catch {
    return null;
  }
  if (!target.length) return null;

  const matches = [];
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      // posix/ and right/ duplicate every zone; symlinks are aliases.
      if (entry.isDirectory()) {
        if (!prefix && (entry.name === 'posix' || entry.name === 'right')) continue;
        walk(path.join(dir, entry.name), name);
      } else if (entry.isFile()) {
        const full = path.join(dir, entry.name);
        try {
          if (fs.statSync(full).size !== target.length) continue;
          if (fs.readFileSync(full).equals(target)) matches.push(name);
        } catch {
          // Unreadable file: not our zone.
        }
      }
    }
  };
  walk(zoneinfoDir, '');

  const valid = matches.filter((name) => canonicalTimeZone(name)).sort();
  if (!valid.length) return null;
  const preferred = readCanonicalZoneList(zoneinfoDir);
  return canonicalTimeZone(valid.find((name) => preferred.has(name)) || valid[0]);
}

/**
 * The host machine's zone, or null if it cannot be told.
 *
 * In Docker that is the mounted host localtime file. Outside it, it is the
 * zone Node started in — but only if TZ was not set at launch, since TZ
 * overrides it, and Node does not go back to the system zone when TZ is
 * removed. Call this before anything assigns process.env.TZ.
 */
function detectHostTimezone({ env = process.env, localtimePath, zoneinfoDir } = {}) {
  const fromFile = zoneFromLocaltimeFile(localtimePath, zoneinfoDir);
  if (fromFile) return fromFile;
  if (env.TZ) return null;
  try {
    return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

/**
 * Which zone the server should run in, and why. `fallback` is what it would
 * be without a saved zone — what "reset" in the Admin Panel goes back to. An
 * invalid saved value is skipped rather than trusted, so a bad row cannot put
 * the server on UTC.
 */
function resolveAppTimezone({ saved, env, host } = {}) {
  const fromEnv = canonicalTimeZone(env);
  const fromHost = canonicalTimeZone(host);
  const fallback = fromEnv
    ? { timezone: fromEnv, source: 'env' }
    : fromHost
      ? { timezone: fromHost, source: 'host' }
      : { timezone: DEFAULT_TIMEZONE, source: 'default' };

  const fromSetting = canonicalTimeZone(saved);
  const current = fromSetting ? { timezone: fromSetting, source: 'setting' } : fallback;
  return {
    ...current,
    envTimezone: fromEnv,
    fallbackTimezone: fallback.timezone,
    fallbackSource: fallback.source,
  };
}

module.exports = {
  SETTING_KEY,
  DEFAULT_TIMEZONE,
  HOST_LOCALTIME_PATH,
  canonicalTimeZone,
  zoneFromLocaltimeFile,
  detectHostTimezone,
  resolveAppTimezone,
};
