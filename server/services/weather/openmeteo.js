// Open-Meteo weather provider.
//
// Keyless, so it is always configured — the household picks it in the Admin
// Panel and it just works, no API key to paste. That is the whole point of
// adding it: OpenWeatherMap's free tier and its key are the friction this
// removes.
//
// Two endpoints, both plain GETs with no auth:
//
//   - Geocoding: geocoding-api.open-meteo.com/v1/search — resolves a place
//     name, ZIP, or "city,state" query to coordinates. Skipped entirely when
//     coordinates are given, same as the OpenWeatherMap provider.
//   - Forecast: api.open-meteo.com/v1/forecast — one call returns current,
//     hourly, and daily series, so there is no 3-hour-to-daily rollup the way
//     OpenWeatherMap needs one; the daily arrays arrive already daily.
//
// Precipitation-unit convention: the forecast request always asks for
// precipitation_unit=mm, whatever the unit system — matching OpenWeatherMap,
// whose `rain['3h']` is always millimetres whatever the units. The rain
// chart has no unit label, so the two providers must plot on the same
// scale. The client must NOT convert precipitation values; it keys off
// the payload's `units` field, not the provider.
//
// Air quality is deliberately null. Open-Meteo serves AQI from a separate
// air-quality-api.open-meteo.com endpoint, not the forecast API, and wiring a
// second upstream call is out of scope for this provider; the widget hides
// the AQI section when it is absent, exactly as it does for Home Assistant.

const { buildPayload } = require('./payload');

// Overridable for tests: the geocode route test points the geocoder at a
// local fake instead of the live API, so the suite runs offline and in CI.
const GEO_BASE = process.env.OPENMETEO_GEO_BASE || 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_BASE = process.env.OPENMETEO_FORECAST_BASE || 'https://api.open-meteo.com/v1/forecast';

const REQUEST_TIMEOUT_MS = 15000;

// WMO weather codes -> the shared vocabulary. Open-Meteo's codes are the WMO
// standard set; the mapping below follows the WMO descriptions, with the
// day/night split on clear sky (code 0) the only place is_day matters.
function conditionFromWmo(code, isDay = 1) {
    // Number(null) is 0, which would read as clear sky — a missing code is
    // unknown, not sunny.
    if (code === null || code === undefined) return 'exceptional';
    const wmo = Number(code);
    if (!Number.isFinite(wmo)) return 'exceptional';
    const day = Number(isDay) !== 0;

    if (wmo === 0) return day ? 'sunny' : 'clear-night';
    if (wmo === 1 || wmo === 2) return 'partlycloudy';
    if (wmo === 3) return 'cloudy';
    if (wmo === 45 || wmo === 48) return 'fog';
    if (wmo === 51 || wmo === 53 || wmo === 55) return 'rainy';       // drizzle
    if (wmo === 56 || wmo === 57) return 'snowy-rainy';               // freezing drizzle
    if (wmo === 61 || wmo === 63 || wmo === 65) return 'rainy';
    if (wmo === 66 || wmo === 67) return 'snowy-rainy';               // freezing rain
    if (wmo === 71 || wmo === 73 || wmo === 75 || wmo === 77) return 'snowy';
    if (wmo === 80 || wmo === 81) return 'rainy';                     // rain showers
    if (wmo === 82) return 'pouring';                                 // violent rain showers
    if (wmo === 85 || wmo === 86) return 'snowy';                     // snow showers
    if (wmo === 95 || wmo === 96) return 'lightning-rainy';             // thunderstorm (96: with slight hail)
    if (wmo === 99) return 'hail';                                      // thunderstorm with heavy hail

    return 'exceptional';
}

async function openMeteoFetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
        res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
        if (err.name === 'AbortError') {
            const timeout = new Error('Open-Meteo did not respond in time.');
            timeout.status = 504;
            throw timeout;
        }
        const unreachable = new Error('Could not reach Open-Meteo.');
        unreachable.status = 503;
        unreachable.cause = err;
        throw unreachable;
    } finally {
        clearTimeout(timer);
    }

    const text = await res.text();
    let parsed = null;
    if (text) {
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
    }

    if (!res.ok) {
        const err = new Error(
            (parsed && parsed.reason) || (parsed && parsed.message) || `Open-Meteo error ${res.status}`
        );
        err.status = res.status;
        throw err;
    }

    return parsed;
}

function notFound() {
    const err = new Error('Location not found');
    err.status = 404;
    return err;
}

async function resolveCoordinates(locationQuery) {
    const query = String(locationQuery || '').trim();
    if (!query) throw notFound();

    const url = `${GEO_BASE}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const result = await openMeteoFetch(url);
    const best = Array.isArray(result?.results) ? result.results[0] : null;
    if (!best || !Number.isFinite(best.latitude) || !Number.isFinite(best.longitude)) {
        throw notFound();
    }
    return { lat: best.latitude, lon: best.longitude, name: best.name || '' };
}

// Open-Meteo returns naive local ISO strings under timezone=auto
// ("2026-11-06T06:32", no offset), together with utc_offset_seconds for the
// place. Parsing the string with `new Date()` would read it in the *server's*
// timezone, which is wrong whenever the household's place is elsewhere, so
// the offset is applied explicitly: the components as UTC, minus the offset.
function localIsoToUnixSeconds(value, utcOffsetSeconds) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return null;
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const asUtc = Date.UTC(
        Number(year), Number(month) - 1, Number(day),
        Number(hour), Number(minute), Number(second)
    ) / 1000;
    return asUtc - (Number(utcOffsetSeconds) || 0);
}

// The hourly arrays run from the location's midnight; the chart wants the
// next eight hours from now.
function nextHours(data, utcOffsetSeconds, nowUnix, count = 8) {
    const times = data?.hourly?.time;
    if (!Array.isArray(times)) return [];
    const hourly = [];
    for (let i = 0; i < times.length && hourly.length < count; i++) {
        const timestamp = localIsoToUnixSeconds(times[i], utcOffsetSeconds);
        if (!Number.isFinite(timestamp) || timestamp < nowUnix) continue;
        hourly.push({
            timestamp,
            temp: data.hourly.temperature_2m?.[i],
            precipitation: data.hourly.precipitation?.[i],
            precipitationProbability: data.hourly.precipitation_probability?.[i],
        });
    }
    return hourly;
}

function summarizeDaily(data) {
    const times = data?.daily?.time;
    if (!Array.isArray(times)) return [];
    return times.slice(0, 7).map((date, i) => ({
        date,
        high: data.daily.temperature_2m_max?.[i],
        low: data.daily.temperature_2m_min?.[i],
        condition: conditionFromWmo(data.daily.weather_code?.[i], 1),
        description: null,
        precipitation: data.daily.precipitation_sum?.[i],
        precipitationProbability: data.daily.precipitation_probability_max?.[i],
        uvIndex: data.daily.uv_index_max?.[i],
    }));
}

/**
 * @param {object} options
 * @param {string} [options.locationQuery] resolved via geocoding when no coordinates are given
 * @param {{lat:number, lon:number}} [options.coordinates] skips geocoding when present
 * @param {'imperial'|'metric'} [options.units]
 * @param {Date|number} [options.now] injectable for deterministic tests
 */
async function fetchWeather({ locationQuery, coordinates, units = 'imperial', now } = {}) {
    const metric = units === 'metric';
    const resolved = coordinates && Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)
        ? { ...coordinates, name: '' }
        : await resolveCoordinates(locationQuery);

    const { lat, lon } = resolved;
    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
        hourly: 'temperature_2m,precipitation,precipitation_probability',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max,sunrise,sunset',
        temperature_unit: metric ? 'celsius' : 'fahrenheit',
        // The widget labels metric wind m/s (WeatherWidget.jsx windUnitLabel),
        // which is what OpenWeatherMap returns — km/h would read 3.6x high.
        wind_speed_unit: metric ? 'ms' : 'mph',
        // Always millimetres: OpenWeatherMap's rain is always mm whatever the
        // units, and the rain chart has no unit label, so the providers must
        // agree on the scale.
        precipitation_unit: 'mm',
        timezone: 'auto',
        forecast_days: '7',
    });
    const data = await openMeteoFetch(`${FORECAST_BASE}?${params}`);

    const utcOffsetSeconds = data?.utc_offset_seconds;
    const nowUnix = Math.floor((now instanceof Date ? now.getTime() : (Number.isFinite(now) ? now : Date.now())) / 1000);
    const current = data?.current || {};

    const sunrise = localIsoToUnixSeconds(data?.daily?.sunrise?.[0], utcOffsetSeconds);
    const sunset = localIsoToUnixSeconds(data?.daily?.sunset?.[0], utcOffsetSeconds);

    return buildPayload({
        provider: 'openmeteo',
        units: metric ? 'metric' : 'imperial',
        coordinates: { lat, lon },
        resolvedName: resolved.name || '',
        current: {
            temp: current.temperature_2m,
            feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            windSpeed: current.wind_speed_10m,
            condition: conditionFromWmo(current.weather_code, current.is_day),
            // No description: Open-Meteo reports a code, not localized text,
            // so the client translates the condition token itself.
            description: null,
        },
        forecast: summarizeDaily(data),
        hourly: nextHours(data, utcOffsetSeconds, nowUnix),
        // Open-Meteo serves air quality from a separate API
        // (air-quality-api.open-meteo.com), not the forecast API — out of
        // scope, and the widget hides the section when it is absent.
        airQuality: null,
        sun: Number.isFinite(sunrise) && Number.isFinite(sunset)
            ? { sunrise, sunset }
            : null,
    });
}

module.exports = {
    fetchWeather,
    // exported for tests
    conditionFromWmo,
    resolveCoordinates,
    localIsoToUnixSeconds,
    nextHours,
    summarizeDaily,
};
