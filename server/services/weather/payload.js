// The canonical weather payload every provider returns (issue #57).
//
// This shape is not new. It is the shape the weather widget's own
// fetchWeatherPayload() has always produced, and the shape
// server/utils/demoWeather.js already reproduces from a completely different
// data source. Moving the fetch server-side just promotes that implicit
// contract into an explicit one so OpenWeatherMap, Home Assistant, and the demo
// snapshot are interchangeable.
//
// Two deliberate departures from the old client-side shape:
//
//   1. Dates are machine values, not pre-formatted strings. The old code built
//      `dayName` with toLocaleDateString('en-US') and chart labels with
//      toLocaleTimeString('en-US'), so forecast days rendered in English no
//      matter the UI language. The server now emits an ISO date and a unix
//      timestamp; the client formats them through utils/dateUtils.js in the
//      active locale. See docs/guides/translations.md — never localize on the
//      producing side, never ship a machine format to a display.
//
//   2. Every entry carries a normalized `condition` token (see CONDITIONS)
//      alongside the provider's own icon/description. Home Assistant reports a
//      fixed vocabulary rather than free text, so the token is what both
//      providers agree on and what the client translates.

// The normalized condition vocabulary. Home Assistant's weather entities use
// exactly these values, so we adopt them as the shared token set and map
// OpenWeatherMap onto them rather than the other way around.
const CONDITIONS = [
    'clear-night',
    'cloudy',
    'exceptional',
    'fog',
    'hail',
    'lightning',
    'lightning-rainy',
    'partlycloudy',
    'pouring',
    'rainy',
    'snowy',
    'snowy-rainy',
    'sunny',
    'windy',
    'windy-variant',
];

const CONDITION_SET = new Set(CONDITIONS);

// Fallback used when a provider reports something we don't recognize. Better a
// generic icon than a crash or a blank tile.
const UNKNOWN_CONDITION = 'exceptional';

function normalizeCondition(candidate) {
    const token = String(candidate || '').trim().toLowerCase();
    return CONDITION_SET.has(token) ? token : UNKNOWN_CONDITION;
}

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Nullable numeric field. Home Assistant does not guarantee feels-like or
// humidity, and the widget hides those rows when they are absent, so `null` is
// a first-class value here rather than a reason to fail.
const optionalNumber = (value) => (isFiniteNumber(value) ? value : null);

/**
 * Validate a payload against the contract. Used by the provider tests to pin
 * all three implementations to the same shape, and by the route as a last line
 * of defence so a malformed provider response surfaces as a clear 502 rather
 * than as undefined-access inside a React render.
 *
 * Returns an array of human-readable problems; empty means valid.
 */
function validatePayload(payload) {
    const problems = [];

    if (!payload || typeof payload !== 'object') {
        return ['payload is not an object'];
    }

    const { coordinates, current, forecast, hourly, airQuality } = payload;

    if (!coordinates || !isFiniteNumber(coordinates.lat) || !isFiniteNumber(coordinates.lon)) {
        problems.push('coordinates must have finite lat and lon');
    }

    if (!current || typeof current !== 'object') {
        problems.push('current is required');
    } else {
        if (!isFiniteNumber(current.temp)) problems.push('current.temp must be a finite number');
        if (!CONDITION_SET.has(current.condition)) {
            problems.push(`current.condition "${current.condition}" is not in the vocabulary`);
        }
    }

    if (!Array.isArray(forecast)) {
        problems.push('forecast must be an array');
    } else {
        forecast.forEach((day, index) => {
            if (typeof day?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
                problems.push(`forecast[${index}].date must be a YYYY-MM-DD string`);
            }
            if (!CONDITION_SET.has(day?.condition)) {
                problems.push(`forecast[${index}].condition "${day?.condition}" is not in the vocabulary`);
            }
        });
    }

    if (!Array.isArray(hourly)) {
        problems.push('hourly must be an array');
    } else {
        hourly.forEach((point, index) => {
            if (!isFiniteNumber(point?.timestamp)) {
                problems.push(`hourly[${index}].timestamp must be a unix seconds number`);
            }
        });
    }

    // airQuality is legitimately null — Home Assistant has no equivalent unless
    // the household runs a separate AQI integration.
    if (airQuality !== null && airQuality !== undefined) {
        if (!isFiniteNumber(airQuality.aqi)) {
            problems.push('airQuality.aqi must be a finite number when airQuality is present');
        }
    }

    return problems;
}

/**
 * Build a payload from provider-supplied parts, filling in the optional fields
 * so downstream code never has to guard on `undefined`.
 */
function buildPayload({
    provider,
    coordinates,
    resolvedName = '',
    units,
    current,
    forecast = [],
    hourly = [],
    airQuality = null,
    sun = null,
}) {
    return {
        provider,
        units,
        coordinates: { lat: coordinates.lat, lon: coordinates.lon },
        resolvedName: resolvedName || '',
        current: {
            temp: current.temp,
            feelsLike: optionalNumber(current.feelsLike),
            humidity: optionalNumber(current.humidity),
            windSpeed: optionalNumber(current.windSpeed),
            condition: normalizeCondition(current.condition),
            // The provider's own localized text, when it has one. OpenWeatherMap
            // returns translated descriptions; Home Assistant returns only the
            // token, so this is null there and the client falls back to
            // translating `condition` itself.
            description: current.description || null,
        },
        forecast: forecast.map((day) => ({
            date: day.date,
            high: optionalNumber(day.high),
            low: optionalNumber(day.low),
            condition: normalizeCondition(day.condition),
            description: day.description || null,
            precipitation: optionalNumber(day.precipitation),
        })),
        hourly: hourly.map((point) => ({
            timestamp: point.timestamp,
            temp: optionalNumber(point.temp),
            precipitation: optionalNumber(point.precipitation),
        })),
        airQuality: airQuality
            ? {
                aqi: airQuality.aqi,
                pm2_5: optionalNumber(airQuality.pm2_5),
                pm10: optionalNumber(airQuality.pm10),
                o3: optionalNumber(airQuality.o3),
            }
            : null,
        // Unix seconds. Consumed by auto dark mode; providers that can't supply
        // it leave it null and the caller computes from coordinates instead.
        sun: sun ? { sunrise: sun.sunrise, sunset: sun.sunset } : null,
    };
}

module.exports = {
    CONDITIONS,
    UNKNOWN_CONDITION,
    normalizeCondition,
    validatePayload,
    buildPayload,
};
