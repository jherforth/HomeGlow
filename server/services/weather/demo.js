// Demo-mode weather provider (issue #57; formerly server/utils/demoWeather.js).
//
// The demo has no OpenWeatherMap key and no Home Assistant, so the weather
// widget would sit empty. This provider serves a fixed snapshot through the
// same contract as the live providers, which means demo mode exercises the real
// code path rather than a special case in the widget.
//
// The numbers are a real snapshot of Chili, NY (Monroe County) taken
// 2026-07-08 1:00 PM EDT from open-meteo.com. Only the values are static — the
// dates and hourly timestamps are generated relative to now, so the demo shows
// a plausible upcoming forecast instead of a stale one from a fixed date.

const { buildPayload } = require('./payload');

const CHILI_NY = { lat: 43.0848, lon: -77.7522 };

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

module.exports = { fetchWeather, CHILI_NY };
