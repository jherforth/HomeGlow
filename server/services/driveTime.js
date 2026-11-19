// Drive time from home to a calendar event's location, for the Agenda
// widget's travel chip ("8 min" next to the event's location).
//
// Two keyless upstreams, no API key held:
//   - Geocoding: Nominatim (OpenStreetMap) resolves the location string to
//     coordinates. It handles street addresses and venue names, which a
//     place-name geocoder does not — calendar locations are almost always
//     "Venue, street address, city", not a bare city name. Nominatim asks for
//     at most one request per second; the 24h result cache below makes that
//     a non-issue for a household's handful of locations.
//   - Routing: the OSRM demo server (router.project-osrm.org) returns a
//     free-flow driving duration. That is a typical drive, not a right-now
//     estimate: OSRM's demo routing has no live traffic.
//
// Home is the household location the house already stores for auto dark mode
// and weather scenes: the appearance setting's autoDark lat/lon. With no
// location stored, Home Assistant's own location is the fallback — the same
// fallback GET /api/weather/geocode uses. With neither, there is no drive
// time: getDriveTime answers null and the widget shows nothing.
//
// Results are cached in memory keyed by the normalized location string:
// event locations repeat across the widget's five-minute polls, and a
// household has only a handful. Failures are cached too, briefly, so an
// unresolvable location does not cost an upstream call on every poll. The
// cache is in-memory only; nothing is logged or persisted beyond the key.

const homeAssistant = require('./homeAssistant');
const { DEMO_PLACE } = require('./weather/demo');

// Overridable for tests: the route test points the router at a local fake
// instead of the live demo server, so the suite runs offline and in CI.
const OSRM_BASE = process.env.OSRM_BASE || 'https://router.project-osrm.org/route/v1/driving';
// Same pattern for the geocoder.
const NOMINATIM_BASE = process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org/search';

const REQUEST_TIMEOUT_MS = 10000;

// A drive time is a stable, free-flow number — it holds for a day. A failed
// lookup is worth retrying sooner: a place the geocoder misses today may
// resolve once its address is fixed.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;

const cache = new Map();

function clearCache() {
    cache.clear();
}

function cacheKey(location) {
    return String(location || '').trim().toLowerCase();
}

function readCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    const ttl = entry.minutes === null ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - entry.storedAt > ttl) {
        cache.delete(key);
        return null;
    }
    return entry.minutes;
}

function writeCache(key, minutes) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        // Map preserves insertion order, so the first key is the oldest.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { minutes, storedAt: Date.now() });
}

function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

// The household location, in the order the house already defines it:
// auto dark mode's stored coordinates first, then Home Assistant's own
// location. Returns { lat, lon } or null.
async function getHomeCoordinates(db) {
    const rawAppearance = getSetting(db, 'appearance');
    if (rawAppearance) {
        try {
            const appearance = JSON.parse(rawAppearance);
            const autoDark = appearance && appearance.autoDark;
            if (Number.isFinite(autoDark?.lat) && Number.isFinite(autoDark?.lon)) {
                return { lat: autoDark.lat, lon: autoDark.lon };
            }
        } catch (_) {
            // A corrupt appearance row is not a drive-time failure: fall
            // through to the next source rather than erroring.
        }
    }

    if (homeAssistant.isConfigured(db)) {
        try {
            const config = await homeAssistant.homeAssistantFetch(db, 'GET', '/api/config');
            if (Number.isFinite(config?.latitude) && Number.isFinite(config?.longitude)) {
                return { lat: config.latitude, lon: config.longitude };
            }
        } catch (_) {
            // Home Assistant unreachable: no home, no drive time.
        }
    }

    return null;
}

// Coordinates for a free-text location string, or null when it does not
// resolve. Nominatim answers an array of matches; the first is the best.
// Nominatim's usage policy asks for an identifying User-Agent, which is sent
// on every request.
//
// A calendar location is usually "Venue, street address, city, state" —
// and Nominatim often matches the venue name to nothing while the street
// address alone resolves fine, so a miss retries with the leading segment
// dropped (venue, then street), down to the city. A candidate is only tried
// if it still holds at least a street and a city, so a bare "WI" is never
// asked for. At most four lookups for one location, and the result cache
// means each unique location pays that at most once a day.
// Calendar locations often carry trailing notes — "Venue, address -
// Court 1 (enter on 63rd & 20th)" — which no geocoder matches. Strip
// parenthetical notes and a trailing " - note" suffix before retrying.
// A " - " in the middle of the string (as in "Gymnastics Academy -
// Ballard, 1415 NW 52nd St") is a venue name, not a suffix, and survives.
function cleanQuery(query) {
    return query
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s+-\s+[^-]*$/, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+,/g, ',')
        .trim()
        .replace(/,+$/, '');
}

function geocodeCandidates(query) {
    const cleaned = cleanQuery(query);
    const bases = [...new Set([query, cleaned])];
    const trims = (base) => {
        const parts = base.split(',').map((s) => s.trim()).filter(Boolean);
        const out = [];
        for (let i = 1; i < parts.length; i++) {
            const rest = parts.slice(i).join(', ');
            if (rest && rest.includes(',') && rest !== base) out.push(rest);
        }
        return out;
    };
    // The cleaned string's trims come before the original's: the original's
    // trims still carry the trailing note ("... - Court 1 (enter ...)"),
    // which is what failed in the first place.
    const candidates = [...bases];
    for (const base of [...bases].reverse()) candidates.push(...trims(base));
    return [...new Set(candidates)].slice(0, 4);
}

// Location strings that name a virtual visit, a call, or a room inside a
// building rather than a place. Geocoded anyway, they resolve to some
// unrelated spot far away and the widget would show a confident nonsense
// drive ("Telehealth · 25 hr 4 min"). Only applied to strings with no
// comma — a location carrying an address can still fall back to it.
const NON_PLACE_PATTERNS = [
    /telehealth/i,
    /\bvirtual\b/i,
    /\bzoom\b/i,
    /\bonline\b/i,
    /video\s*call/i,
    /phone\s*call/i,
    /^room\s+\d+/i,
];

function isNonPlace(location) {
    return NON_PLACE_PATTERNS.some((re) => re.test(location));
}

async function geocodeLocation(query) {
    for (const candidate of geocodeCandidates(query)) {
        const found = await geocodeOne(candidate);
        if (found) return found;
    }
    return null;
}

async function geocodeOne(query) {
    const url = `${NOMINATIM_BASE}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'HomeGlow drive-time (https://github.com/jherforth/HomeGlow)',
            },
        });
        if (!res.ok) return null;
        const results = await res.json();
        const first = Array.isArray(results) ? results[0] : null;
        const lat = first ? Number(first.lat) : NaN;
        const lon = first ? Number(first.lon) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { lat, lon };
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function osrmFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
        if (err.name === 'AbortError') return null;
        return null;
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) return null;
    try {
        return await res.json();
    } catch (_) {
        return null;
    }
}

// Free-flow driving minutes between two points, or null when OSRM has no
// route. The demo server answers durations in seconds.
async function routeDurationMinutes(from, to) {
    const url = `${OSRM_BASE}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const result = await osrmFetch(url);
    const duration = result?.routes?.[0]?.duration;
    if (result?.code !== 'Ok' || !Number.isFinite(duration)) return null;
    // A destination next door still takes a minute to drive to.
    return Math.max(1, Math.round(duration / 60));
}

// Driving minutes from home to a location string, or null when home is
// unknown, the location does not resolve, or there is no route. Never
// throws for a lookup failure; only an unexpected error escapes.
async function getDriveTime(db, location, { demoMode = false } = {}) {
    const query = String(location || '').trim();
    if (!query) return null;

    // A bare "Telehealth" or "Room 1135 MES" is not a place: skip it before
    // the geocoder can match it to somewhere far away.
    if (!query.includes(',') && isNonPlace(query)) return null;

    const key = cacheKey(query);
    const cached = readCache(key);
    if (cached !== null) return cached;

    // The demo household lives in one place, whatever a visitor sets — the
    // same place the demo weather shows.
    const home = demoMode ? DEMO_PLACE : await getHomeCoordinates(db);
    if (!home) {
        writeCache(key, null);
        return null;
    }

    let destination;
    try {
        destination = await geocodeLocation(query);
    } catch (_) {
        writeCache(key, null);
        return null;
    }
    if (!destination) {
        writeCache(key, null);
        return null;
    }

    const minutes = await routeDurationMinutes(home, destination);
    writeCache(key, minutes);
    return minutes;
}

module.exports = {
    getDriveTime,
    // exported for tests
    getHomeCoordinates,
    routeDurationMinutes,
    clearCache,
};
