// Weather provider selection and caching (issue #57).
//
// One entry point the route calls; the provider behind it is a household
// setting. Adding a provider means adding a module here and an option in the
// Admin Panel — nothing in the widget changes, because every provider returns
// the same payload (see payload.js).
//
// The cache is not an optimization detail, it is a fix. Weather used to be
// fetched in the browser, so every tab on every display re-fetched
// independently — a kitchen tablet cycling four tabs could burn through the
// OpenWeatherMap free tier on its own. Caching server-side means one upstream
// call serves every display in the house.

const openWeatherMap = require('./openweathermap');
const homeAssistantProvider = require('./homeassistant');
const demoProvider = require('./demo');
const homeAssistant = require('../homeAssistant');
const { validatePayload } = require('./payload');

const PROVIDERS = {
    OPENWEATHERMAP: 'openweathermap',
    HOMEASSISTANT: 'homeassistant',
};

const PROVIDER_SETTING_KEY = 'WEATHER_PROVIDER';
const DEFAULT_PROVIDER = PROVIDERS.OPENWEATHERMAP;

const CACHE_TTL_MS = 10 * 60 * 1000;

// Keyed by provider + rounded location + units + language. Bounded so a
// misbehaving client can't grow it without limit.
const MAX_CACHE_ENTRIES = 64;
const cache = new Map();

function cacheKey({ provider, lat, lon, locationQuery, units, lang }) {
    // Round coordinates to ~1km so trivially different requests for the same
    // place share an entry.
    const place = Number.isFinite(lat) && Number.isFinite(lon)
        ? `${lat.toFixed(2)},${lon.toFixed(2)}`
        : String(locationQuery || '').trim().toLowerCase();
    return `${provider}::${place}::${units}::${lang}`;
}

function readCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.payload;
}

function writeCache(key, payload) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        // Map preserves insertion order, so the first key is the oldest.
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { payload, storedAt: Date.now() });
}

function clearCache() {
    cache.clear();
}

function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function getConfiguredProvider(db) {
    const stored = String(getSetting(db, PROVIDER_SETTING_KEY) || '').trim().toLowerCase();
    return stored === PROVIDERS.HOMEASSISTANT ? PROVIDERS.HOMEASSISTANT : DEFAULT_PROVIDER;
}

/**
 * Which provider is usable right now, and why not if it isn't. Powers the
 * Admin Panel's status line so a half-configured provider is visible before the
 * widget shows an error.
 */
function getProviderStatus(db, { demoMode = false } = {}) {
    // `provider` is what will actually serve a request; `configured_provider` is
    // the stored setting. They differ in demo mode, where the demo snapshot
    // overrides the choice. The Admin Panel's selector binds to the stored
    // setting — binding it to the effective one leaves the control blank on a
    // demo instance, because "demo" is not one of its options.
    const configuredProvider = getConfiguredProvider(db);

    if (demoMode) {
        return {
            provider: 'demo',
            configured_provider: configuredProvider,
            configured: true,
            reason: null,
        };
    }

    if (configuredProvider === PROVIDERS.HOMEASSISTANT) {
        const { has_url, has_token } = homeAssistant.getHomeAssistantStatus(db);
        if (!has_url || !has_token) {
            return {
                provider: configuredProvider,
                configured_provider: configuredProvider,
                configured: false,
                reason: 'Home Assistant is selected but its URL or token is not configured.',
            };
        }
        return {
            provider: configuredProvider,
            configured_provider: configuredProvider,
            configured: true,
            reason: null,
        };
    }

    const hasKey = !!getSetting(db, 'WEATHER_API_KEY');
    return {
        provider: configuredProvider,
        configured_provider: configuredProvider,
        configured: hasKey,
        reason: hasKey ? null : 'No OpenWeatherMap API key is configured.',
    };
}

/**
 * Fetch weather through the configured provider.
 *
 * @param {object} db
 * @param {object} options
 * @param {string} [options.locationQuery] e.g. "14818" or "Rochester,NY"
 * @param {number} [options.lat]
 * @param {number} [options.lon]
 * @param {'imperial'|'metric'} [options.units]
 * @param {string} [options.lang] two-letter UI language
 * @param {boolean} [options.demoMode]
 * @param {boolean} [options.forceRefresh]
 */
async function getWeather(db, {
    locationQuery,
    lat,
    lon,
    units = 'imperial',
    lang = 'en',
    demoMode = false,
    forceRefresh = false,
} = {}) {
    const normalizedUnits = units === 'metric' ? 'metric' : 'imperial';
    const provider = demoMode ? 'demo' : getConfiguredProvider(db);

    const key = cacheKey({ provider, lat, lon, locationQuery, units: normalizedUnits, lang });
    if (!forceRefresh) {
        const cached = readCache(key);
        if (cached) return cached;
    }

    let payload;

    if (provider === 'demo') {
        payload = demoProvider.fetchWeather({ units: normalizedUnits });
    } else if (provider === PROVIDERS.HOMEASSISTANT) {
        const { weatherEntity } = homeAssistant.getConfig(db);
        payload = await homeAssistantProvider.fetchWeather({
            db,
            homeAssistant,
            entityId: weatherEntity,
            // Home Assistant reports its own configured location, so the
            // coordinates are carried through only so the payload stays
            // self-describing for the sun calculation.
            coordinates: {
                lat: Number.isFinite(lat) ? lat : 0,
                lon: Number.isFinite(lon) ? lon : 0,
            },
            units: normalizedUnits,
        });
    } else {
        payload = await openWeatherMap.fetchWeather({
            apiKey: getSetting(db, 'WEATHER_API_KEY'),
            locationQuery,
            coordinates: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
            units: normalizedUnits,
            lang,
        });
    }

    // A provider that returns a malformed payload should surface as a clear
    // server error, not as an undefined-access inside a React render.
    const problems = validatePayload(payload);
    if (problems.length > 0) {
        const err = new Error(`Weather provider "${provider}" returned an invalid payload: ${problems.join('; ')}`);
        err.status = 502;
        throw err;
    }

    writeCache(key, payload);
    return payload;
}

module.exports = {
    PROVIDERS,
    PROVIDER_SETTING_KEY,
    DEFAULT_PROVIDER,
    CACHE_TTL_MS,
    getConfiguredProvider,
    getProviderStatus,
    getWeather,
    clearCache,
};
