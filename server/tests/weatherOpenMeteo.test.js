// Open-Meteo weather provider (keyless; no live API involved — fetch is
// mocked, following the global.fetch save/restore pattern in
// googleTimeouts.test.js, so the suite runs offline and in CI).
const test = require('node:test');
const assert = require('node:assert/strict');

const payload = require('../services/weather/payload');
const openmeteo = require('../services/weather/openmeteo');
const weatherService = require('../services/weather/index');

// --- fixtures ---------------------------------------------------------------

// Chili, NY, 2026-07-08, UTC-4 (EDT). Hourly runs local midnight to 23:00;
// `now` in the fetch tests is 12:00 UTC, i.e. 08:00 local, so the next eight
// hours are the 08:00–15:00 entries.
const GEO_FIXTURE = {
    results: [{ latitude: 43.0848, longitude: -77.7522, name: 'Chili' }],
};

function forecastFixture() {
    const days = ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14'];
    const hourlyTime = Array.from({ length: 24 }, (_, i) => `2026-07-08T${String(i).padStart(2, '0')}:00`);
    return {
        latitude: 43.0848,
        longitude: -77.7522,
        utc_offset_seconds: -14400,
        timezone: 'America/New_York',
        current: {
            time: '2026-07-08T08:00',
            temperature_2m: 84,
            relative_humidity_2m: 51,
            apparent_temperature: 91,
            weather_code: 0,
            wind_speed_10m: 5.4,
            is_day: 1,
        },
        hourly: {
            time: hourlyTime,
            temperature_2m: hourlyTime.map((_, i) => 70 + i),
            precipitation: hourlyTime.map(() => 0),
            precipitation_probability: hourlyTime.map((_, i) => i * 4),
        },
        daily: {
            time: days,
            weather_code: [0, 1, 3, 45, 61, 71, 95],
            temperature_2m_max: [87, 90, 77, 80, 75, 32, 70],
            temperature_2m_min: [64, 66, 65, 60, 55, 20, 50],
            precipitation_sum: [0, 0, 0.11, 0, 0.2, 0.5, 0.3],
            precipitation_probability_max: [10, 20, 80, 30, 60, 90, 100],
            uv_index_max: [8.5, 9, 5, 3, 2, 1, 6],
            sunrise: days.map(() => '2026-07-08T05:40'),
            sunset: days.map(() => '2026-07-08T20:40'),
        },
    };
}

const NOW = new Date(Date.UTC(2026, 6, 8, 12, 0, 0)); // 08:00 local

let originalFetch;
let fetchCalls;

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    };
}

function installMockFetch(handler) {
    fetchCalls = [];
    global.fetch = async (url, init) => {
        fetchCalls.push(String(url));
        return handler(String(url), init);
    };
}

test.beforeEach(() => {
    originalFetch = global.fetch;
    weatherService.clearCache();
});

test.afterEach(() => {
    global.fetch = originalFetch;
});

// A stub settings DB: getSetting reads WEATHER_PROVIDER / WEATHER_API_KEY.
function stubDb(settings = {}) {
    return {
        prepare: () => ({
            get: (key) => (settings[key] === undefined ? null : { value: settings[key] }),
        }),
    };
}

// --- WMO mapping ------------------------------------------------------------

test('WMO weather codes map onto the shared vocabulary', () => {
    const cases = [
        [0, 1, 'sunny'],
        [0, 0, 'clear-night'],
        [1, 1, 'partlycloudy'],
        [2, 1, 'partlycloudy'],
        [3, 1, 'cloudy'],
        [45, 1, 'fog'],
        [48, 1, 'fog'],
        [51, 1, 'rainy'],
        [53, 1, 'rainy'],
        [55, 1, 'rainy'],
        [56, 1, 'snowy-rainy'],
        [57, 1, 'snowy-rainy'],
        [61, 1, 'rainy'],
        [63, 1, 'rainy'],
        [65, 1, 'rainy'],
        [66, 1, 'snowy-rainy'],
        [67, 1, 'snowy-rainy'],
        [71, 1, 'snowy'],
        [73, 1, 'snowy'],
        [75, 1, 'snowy'],
        [77, 1, 'snowy'],
        [80, 1, 'rainy'],
        [81, 1, 'rainy'],
        [82, 1, 'pouring'],
        [85, 1, 'snowy'],
        [86, 1, 'snowy'],
        [95, 1, 'lightning-rainy'],
        [96, 1, 'lightning-rainy'],
        [99, 1, 'hail'],
    ];

    for (const [code, isDay, expected] of cases) {
        assert.equal(openmeteo.conditionFromWmo(code, isDay), expected, `code ${code}`);
    }

    // Every mapped value must be a real vocabulary member.
    for (const [code, isDay] of cases) {
        assert.ok(payload.CONDITIONS.includes(openmeteo.conditionFromWmo(code, isDay)));
    }

    // Unknown codes degrade to the fallback instead of escaping the vocabulary.
    assert.equal(openmeteo.conditionFromWmo(123), 'exceptional');
    assert.equal(openmeteo.conditionFromWmo(null), 'exceptional');
});

// --- fetchWeather -----------------------------------------------------------

test('fixture-driven fetchWeather satisfies the payload contract', async () => {
    installMockFetch((url) => jsonResponse(
        url.includes('geocoding-api.open-meteo.com') ? GEO_FIXTURE : forecastFixture()
    ));

    const result = await openmeteo.fetchWeather({ locationQuery: 'Chili', units: 'imperial', now: NOW });

    assert.deepEqual(payload.validatePayload(result), [], 'payload should be valid');
    assert.equal(result.provider, 'openmeteo');
    assert.equal(result.units, 'imperial');
    assert.equal(result.resolvedName, 'Chili');
    assert.deepEqual(result.coordinates, { lat: 43.0848, lon: -77.7522 });

    // Current: code 0 in daylight is sunny, no localized description.
    assert.equal(result.current.temp, 84);
    assert.equal(result.current.feelsLike, 91);
    assert.equal(result.current.humidity, 51);
    assert.equal(result.current.windSpeed, 5.4);
    assert.equal(result.current.condition, 'sunny');
    assert.equal(result.current.description, null);

    // Daily: seven days, with probability and UV carried through.
    assert.equal(result.forecast.length, 7);
    assert.deepEqual(result.forecast.map((d) => d.date), [
        '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11',
        '2026-07-12', '2026-07-13', '2026-07-14',
    ]);
    assert.equal(result.forecast[0].high, 87);
    assert.equal(result.forecast[0].low, 64);
    assert.equal(result.forecast[0].condition, 'sunny');
    assert.equal(result.forecast[4].condition, 'rainy');
    assert.equal(result.forecast[5].condition, 'snowy');
    assert.equal(result.forecast[6].condition, 'lightning-rainy');
    assert.equal(result.forecast[2].precipitation, 0.11);
    assert.equal(result.forecast[2].precipitationProbability, 80);
    assert.equal(result.forecast[0].uvIndex, 8.5);

    // Hourly: the next eight hours from now (08:00–15:00 local), unix seconds.
    assert.equal(result.hourly.length, 8);
    const firstHour = Date.UTC(2026, 6, 8, 12, 0, 0) / 1000;
    assert.equal(result.hourly[0].timestamp, firstHour);
    assert.equal(result.hourly[7].timestamp, firstHour + 7 * 3600);
    assert.equal(result.hourly[0].temp, 78);
    assert.equal(result.hourly[0].precipitationProbability, 32);

    // Sun: local 05:40 / 20:40 at UTC-4 -> 09:40 / 00:40 UTC.
    assert.equal(result.sun.sunrise, Date.UTC(2026, 6, 8, 9, 40) / 1000);
    assert.equal(result.sun.sunset, Date.UTC(2026, 6, 9, 0, 40) / 1000);

    // Air quality is the documented gap.
    assert.equal(result.airQuality, null, 'Open-Meteo has a separate AQI API');

    // Two upstream calls: one geocode, one forecast.
    assert.equal(fetchCalls.length, 2);
    assert.ok(fetchCalls[0].includes('geocoding-api.open-meteo.com/v1/search?name=Chili'));
    assert.ok(fetchCalls[1].includes('api.open-meteo.com/v1/forecast'));
});

test('coordinates skip geocoding and units pick the Open-Meteo unit set', async () => {
    installMockFetch((url) => {
        if (url.includes('geocoding-api')) throw new Error('geocoding must not be called');
        return jsonResponse(forecastFixture());
    });

    const imperial = await openmeteo.fetchWeather({
        coordinates: { lat: 43.08, lon: -77.75 }, units: 'imperial', now: NOW,
    });
    assert.equal(fetchCalls.length, 1, 'only the forecast call');
    assert.ok(fetchCalls[0].includes('temperature_unit=fahrenheit'));
    assert.ok(fetchCalls[0].includes('wind_speed_unit=mph'));
    assert.ok(fetchCalls[0].includes('precipitation_unit=mm'));
    assert.equal(imperial.resolvedName, '', 'no geocode result, no name');

    const metric = await openmeteo.fetchWeather({
        coordinates: { lat: 43.08, lon: -77.75 }, units: 'metric', now: NOW,
    });
    assert.ok(fetchCalls[1].includes('temperature_unit=celsius'));
    assert.ok(fetchCalls[1].includes('wind_speed_unit=ms'));
    assert.ok(fetchCalls[1].includes('precipitation_unit=mm'));
    assert.equal(metric.units, 'metric');
});

test('an unresolvable place is a 404, not a crash', async () => {
    installMockFetch(() => jsonResponse({ results: [] }));
    await assert.rejects(
        () => openmeteo.fetchWeather({ locationQuery: 'Nowhere,XX', units: 'imperial' }),
        (error) => error.status === 404,
    );
});

test('upstream failures map like the OpenWeatherMap provider', async () => {
    // Unreachable host -> 503.
    installMockFetch(() => { throw new Error('boom'); });
    await assert.rejects(
        () => openmeteo.fetchWeather({ coordinates: { lat: 1, lon: 2 } }),
        (error) => error.status === 503,
    );

    // Aborted request (timeout) -> 504.
    installMockFetch(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
    });
    await assert.rejects(
        () => openmeteo.fetchWeather({ coordinates: { lat: 1, lon: 2 } }),
        (error) => error.status === 504,
    );

    // Upstream error body passes its message and status through.
    installMockFetch(() => jsonResponse({ error: true, reason: 'Invalid latitude' }, 400));
    await assert.rejects(
        () => openmeteo.fetchWeather({ coordinates: { lat: 1, lon: 2 } }),
        (error) => error.status === 400 && /Invalid latitude/.test(error.message),
    );
});

// --- provider selection / status --------------------------------------------

test('openmeteo is recognized as the configured provider; unknown values fall back to OWM', () => {
    assert.equal(weatherService.getConfiguredProvider(stubDb({ WEATHER_PROVIDER: 'openmeteo' })), 'openmeteo');
    assert.equal(weatherService.getConfiguredProvider(stubDb({ WEATHER_PROVIDER: 'homeassistant' })), 'homeassistant');
    assert.equal(weatherService.getConfiguredProvider(stubDb({ WEATHER_PROVIDER: 'openweathermap' })), 'openweathermap');
    assert.equal(weatherService.getConfiguredProvider(stubDb({ WEATHER_PROVIDER: 'bogus' })), 'openweathermap');
    assert.equal(weatherService.getConfiguredProvider(stubDb({})), 'openweathermap');
    assert.equal(weatherService.DEFAULT_PROVIDER, 'openweathermap', 'OWM stays the default');
});

test('openmeteo is always configured; OWM still needs its key', () => {
    const openmeteoStatus = weatherService.getProviderStatus(stubDb({ WEATHER_PROVIDER: 'openmeteo' }));
    assert.equal(openmeteoStatus.provider, 'openmeteo');
    assert.equal(openmeteoStatus.configured, true);
    assert.equal(openmeteoStatus.reason, null);

    const owmBare = weatherService.getProviderStatus(stubDb({ WEATHER_PROVIDER: 'openweathermap' }));
    assert.equal(owmBare.configured, false);
    assert.match(owmBare.reason, /API key/);

    const owmKeyed = weatherService.getProviderStatus(
        stubDb({ WEATHER_PROVIDER: 'openweathermap', WEATHER_API_KEY: 'secret' })
    );
    assert.equal(owmKeyed.configured, true);
    assert.equal(owmKeyed.reason, null);

    // Demo override still wins over the stored setting.
    const demo = weatherService.getProviderStatus(
        stubDb({ WEATHER_PROVIDER: 'openmeteo' }), { demoMode: true }
    );
    assert.equal(demo.provider, 'demo');
    assert.equal(demo.configured_provider, 'openmeteo');
});

test('getWeather dispatches to Open-Meteo with no API key involved', async () => {
    installMockFetch((url) => jsonResponse(
        url.includes('geocoding-api.open-meteo.com') ? GEO_FIXTURE : forecastFixture()
    ));
    const db = stubDb({ WEATHER_PROVIDER: 'openmeteo' }); // deliberately no WEATHER_API_KEY
    const result = await weatherService.getWeather(db, { locationQuery: 'Chili', units: 'imperial' });
    assert.equal(result.provider, 'openmeteo');
    assert.deepEqual(payload.validatePayload(result), []);

    // Second call for the same place is served from cache, no new upstream call.
    const callsBefore = fetchCalls.length;
    const cached = await weatherService.getWeather(db, { locationQuery: 'Chili', units: 'imperial' });
    assert.equal(cached.provider, 'openmeteo');
    assert.equal(fetchCalls.length, callsBefore);
});

test('getCondition needs a location for the geocoding providers, not for demo', async () => {
    // Open-Meteo without coordinates: the guard fires before any fetch.
    installMockFetch(() => { throw new Error('fetch must not be called'); });
    await assert.rejects(
        () => weatherService.getCondition(stubDb({ WEATHER_PROVIDER: 'openmeteo' }), {}),
        (error) => error.status === 400 && /need a location/.test(error.message),
    );

    // OpenWeatherMap keeps the same guard.
    await assert.rejects(
        () => weatherService.getCondition(stubDb({ WEATHER_PROVIDER: 'openweathermap' }), {}),
        (error) => error.status === 400 && /need a location/.test(error.message),
    );

    // Demo never needs a location.
    const demo = await weatherService.getCondition(stubDb({}), { demoMode: true });
    assert.equal(demo.condition, 'sunny');
});

// --- payload: probability + UV ----------------------------------------------

test('validatePayload pins precipitationProbability to 0-100 and uvIndex to 0-20', () => {
    const good = payload.buildPayload({
        provider: 'test',
        units: 'imperial',
        coordinates: { lat: 1, lon: 2 },
        current: { temp: 50, condition: 'sunny' },
        forecast: [{ date: '2026-07-08', high: 80, low: 60, condition: 'sunny', precipitationProbability: 80, uvIndex: 8.5 }],
        hourly: [{ timestamp: 1783483200, temp: 70, precipitationProbability: 0 }],
    });
    assert.deepEqual(payload.validatePayload(good), []);

    const badPop = structuredClone(good);
    badPop.forecast[0].precipitationProbability = 101;
    assert.ok(payload.validatePayload(badPop).some((p) => p.includes('precipitationProbability')));

    const badHourlyPop = structuredClone(good);
    badHourlyPop.hourly[0].precipitationProbability = -1;
    assert.ok(payload.validatePayload(badHourlyPop).some((p) => p.includes('precipitationProbability')));

    const badUv = structuredClone(good);
    badUv.forecast[0].uvIndex = 21;
    assert.ok(payload.validatePayload(badUv).some((p) => p.includes('uvIndex')));

    // Absent is legitimate — providers without the field stay null.
    const absent = structuredClone(good);
    absent.forecast[0].precipitationProbability = null;
    absent.forecast[0].uvIndex = null;
    absent.hourly[0].precipitationProbability = null;
    assert.deepEqual(payload.validatePayload(absent), []);
});
