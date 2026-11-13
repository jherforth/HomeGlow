// Demo-mode weather provider (issue #57; formerly server/utils/demoWeather.js).
//
// The demo shows live weather from Open-Meteo, which needs no key, always for
// one place: New York City (ZIP 10001), whatever location a visitor sets. One
// place means one cached reading for every visitor, so the demo makes at most
// a few upstream calls in each cache period however it is used.
//
// If Open-Meteo can't be reached, or answers with something unusable, the
// demo falls back to a fixed snapshot, so the widget never shows an error.
// The snapshot's numbers are a real reading of Chili, NY (Monroe County) taken
// 2026-07-08 1:00 PM EDT from open-meteo.com. Only the values are static — the
// dates and hourly timestamps are generated relative to now, so the fallback
// shows a plausible upcoming forecast instead of a stale one from a fixed date.

const { buildPayload, validatePayload } = require('./payload');
const openMeteo = require('./openmeteo');

const CHILI_NY = { lat: 43.0848, lon: -77.7522 };

// ZIP 10001, as Open-Meteo's geocoder resolves it.
const DEMO_PLACE = { lat: 40.71427, lon: -74.00597, name: 'New York' };

// Base snapshot in imperial units (°F, mph).
const SNAPSHOT = {
    current: {
        tempF: 84,
        feelsLikeF: 91,
        humidity: 51,
        windMph: 5.4,
        condition: 'sunny',
    },
    daily: [
        { highF: 87, lowF: 64, precipIn: 0, condition: 'partlycloudy' },
        { highF: 90, lowF: 66, precipIn: 0, condition: 'cloudy' },
        { highF: 77, lowF: 65, precipIn: 0.11, condition: 'rainy' },
    ],
    // Eight 3-hour steps.
    hourly: [86, 84, 81, 73, 69, 66, 73, 87],
    // open-meteo reported US AQI 22 ("good"), which is 1 on OpenWeatherMap's 1-5 scale.
    airQuality: { aqi: 1, pm2_5: 13.9, pm10: 14.2, o3: 92 },
};

const fToC = (f) => Math.round(((f - 32) * 5) / 9 * 10) / 10;
const mphToMs = (mph) => Math.round(mph * 0.44704 * 10) / 10;

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const toDateKey = (date) => {
    // Local date parts, so the demo's "today" matches the server's day rather
    // than drifting across the UTC boundary in the evening.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * @param {'imperial'|'metric'} units
 * @param {Date} [now] injectable for deterministic tests
 */
function fetchWeather({ units = 'imperial', now = new Date() } = {}) {
    const metric = units === 'metric';
    const t = (f) => (metric ? fToC(f) : f);

    const nowUnix = Math.floor(now.getTime() / 1000);

    return buildPayload({
        provider: 'demo',
        units,
        coordinates: { ...CHILI_NY },
        resolvedName: 'Chili',
        current: {
            temp: t(SNAPSHOT.current.tempF),
            feelsLike: t(SNAPSHOT.current.feelsLikeF),
            humidity: SNAPSHOT.current.humidity,
            windSpeed: metric ? mphToMs(SNAPSHOT.current.windMph) : SNAPSHOT.current.windMph,
            condition: SNAPSHOT.current.condition,
            // No description: a static snapshot carries no localized text, so
            // the client translates the condition token instead and the demo
            // reads correctly in every language.
            description: null,
        },
        forecast: SNAPSHOT.daily.map((day, index) => ({
            date: toDateKey(addDays(now, index)),
            high: Math.round(t(day.highF)),
            low: Math.round(t(day.lowF)),
            condition: day.condition,
            description: null,
            precipitation: day.precipIn,
        })),
        hourly: SNAPSHOT.hourly.map((tempF, index) => ({
            // 3-hour steps starting now, matching OpenWeatherMap's cadence.
            timestamp: nowUnix + index * 3 * 3600,
            temp: Math.round(t(tempF)),
            precipitation: 0,
        })),
        airQuality: { ...SNAPSHOT.airQuality },
        sun: null,
    });
}

/**
 * Live weather for the demo's place, or the snapshot when Open-Meteo fails.
 * @param {'imperial'|'metric'} units
 */
async function fetchLiveWeather({ units = 'imperial' } = {}) {
    try {
        const payload = await openMeteo.fetchWeather({
            coordinates: { lat: DEMO_PLACE.lat, lon: DEMO_PLACE.lon },
            units,
        });
        const problems = validatePayload(payload);
        if (problems.length === 0) return { ...payload, resolvedName: DEMO_PLACE.name };
        console.warn(`Demo weather: Open-Meteo's answer was unusable (${problems.join('; ')}); showing the snapshot.`);
    } catch (error) {
        console.warn(`Demo weather: Open-Meteo is unavailable (${error.message}); showing the snapshot.`);
    }
    return fetchWeather({ units });
}

module.exports = { fetchWeather, fetchLiveWeather, CHILI_NY, DEMO_PLACE };
