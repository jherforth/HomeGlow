// Home Assistant weather provider (issue #57).
//
// Reads a `weather.*` entity through the authenticated connection in
// services/homeAssistant.js. The token never leaves the server.
//
// Two things make this adapter more involved than a field rename:
//
//   1. Forecasts are not entity attributes. Home Assistant moved them behind a
//      `weather.get_forecasts` service call (2024.x); older instances still
//      expose `attributes.forecast`. We try the service call and fall back to
//      the attribute, so both generations work without the operator knowing
//      which they run.
//
//   2. Home Assistant reports in whatever unit system it is configured for and
//      says so per-attribute (`temperature_unit`, `wind_speed_unit`). We
//      convert to whatever the widget asked for rather than assuming.
//
// Fields Home Assistant does not carry — air quality above all — come back null
// and the widget hides those sections. See the degradation table in
// docs/reference/features.md.

const { buildPayload } = require('./payload');

const DAILY_FORECAST_COUNT = 3;
const HOURLY_FORECAST_COUNT = 8;

// --- unit conversion -------------------------------------------------------

const cToF = (c) => (c * 9) / 5 + 32;
const fToC = (f) => ((f - 32) * 5) / 9;

function convertTemp(value, sourceUnit, targetUnits) {
    if (!Number.isFinite(value)) return null;
    // Home Assistant writes the unit with a degree sign, e.g. "°C".
    const sourceIsF = String(sourceUnit || '').toUpperCase().includes('F');
    const wantF = targetUnits === 'imperial';
    if (sourceIsF === wantF) return value;
    return wantF ? cToF(value) : fToC(value);
}

// Target units mirror OpenWeatherMap's: mph for imperial, m/s for metric.
const WIND_TO_MS = {
    'm/s': 1,
    'km/h': 1 / 3.6,
    'mph': 0.44704,
    'ft/s': 0.3048,
    'kn': 0.514444,
};

function convertWind(value, sourceUnit, targetUnits) {
    if (!Number.isFinite(value)) return null;
    const factor = WIND_TO_MS[String(sourceUnit || '').toLowerCase()];
    // An unrecognized unit is better passed through than silently scaled wrong.
    if (!factor) return value;
    const metersPerSecond = value * factor;
    return targetUnits === 'imperial' ? metersPerSecond / 0.44704 : metersPerSecond;
}

// --- forecast retrieval ----------------------------------------------------

// Home Assistant returns forecast datetimes as ISO strings. The widget buckets
// by local date, so keep the date part only for daily entries.
function isoToDateKey(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
}

function isoToUnixSeconds(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.floor(parsed.getTime() / 1000);
}

/**
 * Fetch a forecast of the given type, tolerating both the modern service call
 * and the legacy entity attribute.
 *
 * Returns an array (possibly empty) — never throws, because a missing forecast
 * should cost the user their forecast panel, not their whole weather widget.
 */
async function fetchForecast(homeAssistant, db, entityId, type, fallbackAttributes) {
    try {
        const response = await homeAssistant.homeAssistantFetch(
            db,
            'POST',
            '/api/services/weather/get_forecasts?return_response',
            { entity_id: entityId, type }
        );

        // Shape: { changed_states: [], service_response: { "<entity>": { forecast: [...] } } }
        const forecast = response?.service_response?.[entityId]?.forecast;
        if (Array.isArray(forecast) && forecast.length > 0) {
            return forecast;
        }
    } catch (error) {
        // Older instances 400 on the unknown service or the return_response
        // parameter. Fall through to the attribute rather than failing.
        console.warn(`Home Assistant ${type} forecast service call failed, falling back to attributes:`, error.message);
    }

    const legacy = fallbackAttributes?.forecast;
    return Array.isArray(legacy) ? legacy : [];
}

// --- provider --------------------------------------------------------------

/**
 * @param {object} options
 * @param {object} options.db
 * @param {object} options.homeAssistant the services/homeAssistant module (injected for testing)
 * @param {string} options.entityId
 * @param {{lat:number, lon:number}} options.coordinates used for the payload; HA is location-agnostic
 * @param {'imperial'|'metric'} options.units
 */
async function fetchWeather({ db, homeAssistant, entityId, coordinates, units }) {
    const state = await homeAssistant.getState(db, entityId);

    if (!state || typeof state !== 'object' || !state.attributes) {
        const err = new Error(`Home Assistant entity "${entityId}" was not found.`);
        err.status = 404;
        throw err;
    }

    const attributes = state.attributes;
    const tempUnit = attributes.temperature_unit;
    const windUnit = attributes.wind_speed_unit;

    const [dailyRaw, hourlyRaw] = await Promise.all([
        fetchForecast(homeAssistant, db, entityId, 'daily', attributes),
        fetchForecast(homeAssistant, db, entityId, 'hourly', attributes),
    ]);

    const forecast = dailyRaw
        .map((day) => ({
            date: isoToDateKey(day.datetime),
            high: convertTemp(day.temperature, tempUnit, units),
            low: convertTemp(day.templow, tempUnit, units),
            condition: day.condition,
            description: null,
            precipitation: Number.isFinite(day.precipitation) ? day.precipitation : null,
        }))
        .filter((day) => day.date)
        .slice(0, DAILY_FORECAST_COUNT);

    const hourly = hourlyRaw
        .map((point) => ({
            timestamp: isoToUnixSeconds(point.datetime),
            temp: convertTemp(point.temperature, tempUnit, units),
            precipitation: Number.isFinite(point.precipitation) ? point.precipitation : null,
        }))
        .filter((point) => Number.isFinite(point.timestamp))
        .slice(0, HOURLY_FORECAST_COUNT);

    return buildPayload({
        provider: 'homeassistant',
        units,
        coordinates,
        resolvedName: attributes.friendly_name || '',
        current: {
            temp: convertTemp(attributes.temperature, tempUnit, units),
            // Not part of the standard weather entity — present only on some
            // integrations, so null is the normal case rather than an error.
            feelsLike: convertTemp(attributes.apparent_temperature, tempUnit, units),
            humidity: Number.isFinite(attributes.humidity) ? attributes.humidity : null,
            windSpeed: convertWind(attributes.wind_speed, windUnit, units),
            // The entity's state IS the condition token.
            condition: state.state,
            // Home Assistant has no localized description text — only the token.
            // The client translates `condition` instead.
            description: null,
        },
        forecast,
        hourly,
        // Home Assistant weather entities carry no air quality. Households that
        // run a separate AQI integration would need a second entity, which is
        // deliberately out of scope here.
        airQuality: null,
        sun: null,
    });
}

module.exports = {
    fetchWeather,
    // exported for tests
    convertTemp,
    convertWind,
    fetchForecast,
};
