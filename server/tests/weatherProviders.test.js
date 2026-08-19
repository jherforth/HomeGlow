// Weather provider layer (issue #57). Every provider must return the same
// payload, so the widget can render any of them without knowing which it got.
//
// These are unit tests against the provider modules plus a stubbed Home
// Assistant over real HTTP — no live OpenWeatherMap or Home Assistant instance
// is involved, so the suite runs offline and in CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const payload = require('../services/weather/payload');
const demoProvider = require('../services/weather/demo');
const owm = require('../services/weather/openweathermap');
const haProvider = require('../services/weather/homeassistant');
const { computeSunTimes, isDaytime } = require('../services/weather/sun');

// --- the contract ----------------------------------------------------------

test('the demo provider satisfies the payload contract in both unit systems', () => {
    for (const units of ['imperial', 'metric']) {
        const result = demoProvider.fetchWeather({ units });
        assert.deepEqual(payload.validatePayload(result), [], `${units} payload should be valid`);
        assert.equal(result.provider, 'demo');
        assert.equal(result.forecast.length, 3);
        assert.equal(result.hourly.length, 8);
    }

    const imperial = demoProvider.fetchWeather({ units: 'imperial' });
    const metric = demoProvider.fetchWeather({ units: 'metric' });
    assert.ok(metric.current.temp < imperial.current.temp, 'metric is the Celsius conversion');
});

test('validatePayload rejects the shapes that would break a render', () => {
    const good = demoProvider.fetchWeather({ units: 'imperial' });

    assert.deepEqual(payload.validatePayload(good), []);

    assert.ok(payload.validatePayload(null).length > 0, 'null');
    assert.ok(
        payload.validatePayload({ ...good, coordinates: { lat: 'x', lon: 1 } }).length > 0,
        'non-numeric coordinates',
    );
    assert.ok(
        payload.validatePayload({ ...good, current: { ...good.current, temp: undefined } }).length > 0,
        'missing temperature',
    );
    assert.ok(
        payload.validatePayload({ ...good, forecast: [{ date: 'July 8', condition: 'sunny' }] }).length > 0,
        'a display-formatted date is not a machine date',
    );

    // Absent air quality is legitimate — Home Assistant has none.
    assert.deepEqual(payload.validatePayload({ ...good, airQuality: null }), []);
});

test('an unknown condition degrades to the fallback instead of escaping the vocabulary', () => {
    const built = payload.buildPayload({
        provider: 'test',
        units: 'imperial',
        coordinates: { lat: 1, lon: 2 },
        current: { temp: 50, condition: 'raining-frogs' },
    });
    assert.equal(built.current.condition, payload.UNKNOWN_CONDITION);
    assert.deepEqual(payload.validatePayload(built), []);
});

// --- OpenWeatherMap --------------------------------------------------------

test('OpenWeatherMap condition ids map onto the shared vocabulary', () => {
    const cases = [
        [200, '01d', 'lightning-rainy'],
        [211, '11d', 'lightning'],
        [300, '09d', 'rainy'],
        [502, '09d', 'pouring'],
        [511, '13d', 'snowy-rainy'],
        [601, '13d', 'snowy'],
        [613, '13d', 'snowy-rainy'],
        [741, '50d', 'fog'],
        [781, '50d', 'windy'],
        [800, '01d', 'sunny'],
        [800, '01n', 'clear-night'],
        [801, '02d', 'partlycloudy'],
        [804, '04d', 'cloudy'],
    ];

    for (const [id, icon, expected] of cases) {
        assert.equal(owm.conditionFromOwm(id, icon), expected, `id ${id} (${icon})`);
    }

    // Every mapped value must be a real vocabulary member.
    for (const [id, icon] of cases) {
        assert.ok(payload.CONDITIONS.includes(owm.conditionFromOwm(id, icon)));
    }
});

test('the geocode fallback cascade from issue #80 survives the move server-side', () => {
    // Bare city gets a ",US" retry appended.
    assert.deepEqual(owm.geocodeCandidates('Rochester'), ['Rochester', 'Rochester,US']);
    // Already US-qualified, or carrying three segments, is left alone.
    assert.deepEqual(owm.geocodeCandidates('Rochester,US'), ['Rochester,US']);
    assert.deepEqual(owm.geocodeCandidates('Paris,FR,EU'), ['Paris,FR,EU']);
    assert.deepEqual(owm.geocodeCandidates(''), []);

    // "Sydney,AU" still gets a nonsense ",US" candidate appended. That is the
    // original client behaviour preserved on purpose: the first candidate
    // resolves, so the second is never requested. Pinned here so the quirk is
    // a decision rather than a surprise.
    assert.deepEqual(owm.geocodeCandidates('Sydney,AU'), ['Sydney,AU', 'Sydney,AU,US']);
});

test('the 3-hour forecast rolls into daily highs and lows at the location\'s midnight', () => {
    // Two days of 3-hourly points, tagged with a -5h (Eastern) offset.
    const base = Date.UTC(2026, 6, 8, 0, 0, 0) / 1000;
    const list = [];
    for (let i = 0; i < 16; i++) {
        list.push({
            dt: base + i * 3 * 3600,
            main: { temp: 70 + i, temp_min: 60 + i, temp_max: 80 + i },
            weather: [{ id: 800, icon: '01d', description: 'clear sky' }],
            rain: { '3h': 0.1 },
        });
    }

    const { forecast, hourly } = owm.summarizeForecast(list, -5 * 3600);

    assert.ok(forecast.length >= 2, 'spans more than one local day');
    assert.equal(hourly.length, 8, 'chart window is the first eight points');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(forecast[0].date), 'machine date, not a label');
    assert.ok(forecast[0].high >= forecast[0].low);
    assert.ok(forecast[0].precipitation > 0, 'precipitation accumulates across the day');
    assert.equal(typeof hourly[0].timestamp, 'number');
});

// --- Home Assistant --------------------------------------------------------

test('Home Assistant units convert to whatever the widget asked for', () => {
    // Celsius source -> imperial request.
    assert.equal(Math.round(haProvider.convertTemp(20, '°C', 'imperial')), 68);
    // Fahrenheit source -> metric request.
    assert.equal(Math.round(haProvider.convertTemp(68, '°F', 'metric')), 20);
    // Matching units pass through untouched.
    assert.equal(haProvider.convertTemp(20, '°C', 'metric'), 20);
    assert.equal(haProvider.convertTemp(null, '°C', 'metric'), null);

    // km/h -> mph and -> m/s.
    assert.equal(Math.round(haProvider.convertWind(36, 'km/h', 'imperial')), 22);
    assert.equal(Math.round(haProvider.convertWind(36, 'km/h', 'metric')), 10);
    // An unrecognized unit passes through rather than being scaled wrongly.
    assert.equal(haProvider.convertWind(5, 'furlongs/fortnight', 'metric'), 5);
});

test('the Home Assistant adapter maps an entity plus forecast service response', async () => {
    // Stub Home Assistant: entity state, plus the modern get_forecasts service.
    const requests = [];
    const server = http.createServer((req, res) => {
        requests.push(`${req.method} ${req.url}`);
        res.setHeader('Content-Type', 'application/json');

        if (req.url.startsWith('/api/states/weather.home')) {
            return res.end(JSON.stringify({
                entity_id: 'weather.home',
                state: 'partlycloudy',
                attributes: {
                    friendly_name: 'Home',
                    temperature: 20,
                    temperature_unit: '°C',
                    humidity: 65,
                    wind_speed: 36,
                    wind_speed_unit: 'km/h',
                    apparent_temperature: 22,
                },
            }));
        }

        if (req.url.startsWith('/api/services/weather/get_forecasts')) {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            return req.on('end', () => {
                const { type } = JSON.parse(body);
                const forecast = type === 'daily'
                    ? [
                        { datetime: '2026-07-08T00:00:00+00:00', condition: 'sunny', temperature: 25, templow: 15, precipitation: 0 },
                        { datetime: '2026-07-09T00:00:00+00:00', condition: 'rainy', temperature: 22, templow: 14, precipitation: 3 },
                    ]
                    : Array.from({ length: 12 }, (_, i) => ({
                        datetime: new Date(Date.UTC(2026, 6, 8, i) ).toISOString(),
                        condition: 'sunny',
                        temperature: 18 + i,
                        precipitation: 0,
                    }));
                res.end(JSON.stringify({ changed_states: [], service_response: { 'weather.home': { forecast } } }));
            });
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'not found' }));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    // A minimal stand-in for services/homeAssistant, pointed at the stub.
    const stubHomeAssistant = {
        async homeAssistantFetch(_db, method, apiPath, body) {
            const res = await fetch(`http://127.0.0.1:${port}${apiPath}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return await res.json();
        },
        async getState(db, entityId) {
            return await this.homeAssistantFetch(db, 'GET', `/api/states/${entityId}`);
        },
    };

    try {
        const result = await haProvider.fetchWeather({
            db: {},
            homeAssistant: stubHomeAssistant,
            entityId: 'weather.home',
            coordinates: { lat: 43.08, lon: -77.75 },
            units: 'imperial',
        });

        assert.deepEqual(payload.validatePayload(result), [], 'HA payload satisfies the shared contract');
        assert.equal(result.provider, 'homeassistant');
        assert.equal(result.resolvedName, 'Home');

        // 20°C -> 68°F, 36 km/h -> ~22 mph, apparent 22°C -> ~72°F.
        assert.equal(Math.round(result.current.temp), 68);
        assert.equal(Math.round(result.current.windSpeed), 22);
        assert.equal(Math.round(result.current.feelsLike), 72);
        assert.equal(result.current.humidity, 65);

        // The entity's state IS the condition token.
        assert.equal(result.current.condition, 'partlycloudy');
        // Home Assistant has no localized text, so the client translates.
        assert.equal(result.current.description, null);

        // Air quality is the documented gap.
        assert.equal(result.airQuality, null, 'Home Assistant carries no air quality');

        assert.equal(result.forecast.length, 2);
        assert.equal(result.forecast[0].date, '2026-07-08');
        assert.equal(Math.round(result.forecast[0].high), 77);
        assert.equal(result.hourly.length, 8, 'hourly is capped at the chart window');

        assert.ok(
            requests.some((r) => r.includes('get_forecasts')),
            'used the service call rather than reading a forecast attribute',
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('a Home Assistant without the forecast service falls back to the legacy attribute', async () => {
    // Pre-2024 instances 400 on get_forecasts but carry forecast in attributes.
    const legacyHomeAssistant = {
        async homeAssistantFetch(_db, method, apiPath) {
            if (apiPath.includes('get_forecasts')) {
                const err = new Error('Service not found.');
                err.status = 400;
                throw err;
            }
            throw new Error(`unexpected call: ${method} ${apiPath}`);
        },
    };

    const forecast = await haProvider.fetchForecast(
        legacyHomeAssistant,
        {},
        'weather.home',
        'daily',
        { forecast: [{ datetime: '2026-07-08T00:00:00+00:00', condition: 'sunny', temperature: 25, templow: 15 }] },
    );

    assert.equal(forecast.length, 1, 'fell back to attributes instead of failing');
    assert.equal(forecast[0].condition, 'sunny');
});

test('a missing entity is a 404, not a crash', async () => {
    const emptyHomeAssistant = { async getState() { return null; } };

    await assert.rejects(
        () => haProvider.fetchWeather({
            db: {},
            homeAssistant: emptyHomeAssistant,
            entityId: 'weather.nope',
            coordinates: { lat: 0, lon: 0 },
            units: 'imperial',
        }),
        (error) => error.status === 404,
    );
});

// --- sun -------------------------------------------------------------------

test('sunrise and sunset are computed within a few minutes of published values', () => {
    // New York, summer solstice 2026: sunrise 05:25, sunset 20:31 EDT.
    const nyc = computeSunTimes(40.7128, -74.0060, new Date('2026-06-21T12:00:00Z'));
    const minutesInZone = (unix, timeZone) => {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date(unix * 1000)).split(':');
        return Number(parts[0]) * 60 + Number(parts[1]);
    };

    const withinMinutes = (actual, expected, tolerance) =>
        Math.abs(actual - expected) <= tolerance;

    assert.ok(
        withinMinutes(minutesInZone(nyc.sunrise, 'America/New_York'), 5 * 60 + 25, 5),
        'NYC solstice sunrise',
    );
    assert.ok(
        withinMinutes(minutesInZone(nyc.sunset, 'America/New_York'), 20 * 60 + 31, 5),
        'NYC solstice sunset',
    );

    // London, equinox: roughly twelve hours of daylight.
    const london = computeSunTimes(51.5074, -0.1278, new Date('2026-03-20T12:00:00Z'));
    const daylightHours = (london.sunset - london.sunrise) / 3600;
    assert.ok(daylightHours > 11.5 && daylightHours < 12.5, `equinox daylight was ${daylightHours}h`);
});

test('polar day and night resolve instead of returning nonsense', () => {
    const midnightSun = computeSunTimes(69.6492, 18.9553, new Date('2026-06-21T12:00:00Z'));
    assert.equal(midnightSun.sunrise, null);
    assert.equal(midnightSun.alwaysUp, true);
    assert.equal(isDaytime(69.6492, 18.9553, new Date('2026-06-21T23:00:00Z')), true);

    const polarNight = computeSunTimes(69.6492, 18.9553, new Date('2026-12-21T12:00:00Z'));
    assert.equal(polarNight.alwaysDown, true);
    assert.equal(isDaytime(69.6492, 18.9553, new Date('2026-12-21T12:00:00Z')), false);
});
