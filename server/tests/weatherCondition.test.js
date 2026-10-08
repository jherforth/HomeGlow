// The current condition for a theme's weather scenes (#247): answered from any
// fresh reading of the place, so polling it costs no extra upstream calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../services/weather');
const owm = require('../services/weather/openweathermap');
const demo = require('../services/weather/demo');

// A settings table holding only an OpenWeatherMap key.
const fakeDb = {
    prepare: () => ({ get: (key) => (key === 'WEATHER_API_KEY' ? { value: 'key' } : undefined) }),
};

// OpenWeatherMap, stubbed: a demo payload at Rochester, NY, raining.
function stubOwm() {
    const original = owm.fetchWeather;
    const calls = [];
    owm.fetchWeather = async (options) => {
        calls.push(options);
        const payload = demo.fetchWeather({ units: options.units });
        return {
            ...payload,
            coordinates: { lat: 43.1566, lon: -77.6088 },
            current: { ...payload.current, condition: 'rainy' },
        };
    };
    return { calls, restore: () => { owm.fetchWeather = original; } };
}

test.beforeEach(() => weather.clearCache());

test('a widget\'s reading by place name answers a condition asked by coordinates', async () => {
    const { calls, restore } = stubOwm();
    try {
        // The weather widget, by name, in Spanish and metric.
        await weather.getWeather(fakeDb, { locationQuery: 'Rochester, NY', units: 'metric', lang: 'es' });
        // The theme, by the coordinates auto dark mode stored: within ~1km.
        const answer = await weather.getCondition(fakeDb, { lat: 43.1610, lon: -77.6110 });

        assert.equal(answer.condition, 'rainy');
        assert.equal(answer.maxAgeMs, weather.CACHE_TTL_MS);
        assert.equal(typeof answer.checkedAt, 'number');
        assert.equal(calls.length, 1, 'no second upstream call');
    } finally {
        restore();
    }
});

test('a place nobody has asked about is fetched once, then shared', async () => {
    const { calls, restore } = stubOwm();
    try {
        await weather.getCondition(fakeDb, { lat: 43.1566, lon: -77.6088 });
        await weather.getCondition(fakeDb, { lat: 43.1566, lon: -77.6088 });
        assert.equal(calls.length, 1);
        assert.deepEqual(calls[0].coordinates, { lat: 43.1566, lon: -77.6088 });
    } finally {
        restore();
    }
});

test('a reading of another place does not answer', async () => {
    const { calls, restore } = stubOwm();
    try {
        await weather.getWeather(fakeDb, { locationQuery: 'Rochester, NY' });
        // Buffalo, about 100km away.
        await weather.getCondition(fakeDb, { lat: 42.8864, lon: -78.8784 });
        assert.equal(calls.length, 2);
    } finally {
        restore();
    }
});

test('OpenWeatherMap with no location is a 400, not an upstream call', async () => {
    const { calls, restore } = stubOwm();
    try {
        await assert.rejects(weather.getCondition(fakeDb, {}), (error) => error.status === 400);
        assert.equal(calls.length, 0);
    } finally {
        restore();
    }
});

test('demo mode answers with the demo snapshot\'s condition', async () => {
    const answer = await weather.getCondition(fakeDb, { demoMode: true });
    assert.equal(answer.condition, demo.fetchWeather().current.condition);
});
