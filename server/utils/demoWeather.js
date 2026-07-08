// Demo-mode weather data. The demo has no OpenWeatherMap API key, so the
// weather widget would sit empty; instead the client asks GET /api/demo/weather
// and gets this canned payload, shaped exactly like the client's own
// fetchWeatherPayload() output (raw OWM "current weather" response plus the
// widget's pre-digested forecast/chart arrays).
//
// The numbers are a real snapshot of Chili, NY (Monroe County) taken
// 2026-07-08 1:00 PM EDT from open-meteo.com. They are intentionally static —
// the demo just needs something believable on screen.

const CHILI_NY = { lat: 43.0848, lon: -77.7522 };

// Base snapshot in imperial units (°F, mph).
const SNAPSHOT = {
  current: {
    tempF: 84,
    feelsLikeF: 91,
    humidity: 51,
    windMph: 5.4,
    weather: { id: 800, main: 'Clear', description: 'clear sky', icon: '01d' },
  },
  // Three days starting at the snapshot date.
  daily: [
    { dayName: 'Wed', highF: 87, lowF: 64, avgF: 76, precipIn: 0, weather: { id: 801, main: 'Clouds', description: 'few clouds', icon: '02d' } },
    { dayName: 'Thu', highF: 90, lowF: 66, avgF: 78, precipIn: 0, weather: { id: 804, main: 'Clouds', description: 'overcast clouds', icon: '04d' } },
    { dayName: 'Fri', highF: 77, lowF: 65, avgF: 71, precipIn: 0.11, weather: { id: 300, main: 'Drizzle', description: 'light drizzle', icon: '09d' } },
  ],
  // Eight 3-hour steps from the snapshot time (the widget's chart window).
  hourly: [
    { time: '2 PM', tempF: 86, precip: 0 },
    { time: '5 PM', tempF: 84, precip: 0 },
    { time: '8 PM', tempF: 81, precip: 0 },
    { time: '11 PM', tempF: 73, precip: 0 },
    { time: '2 AM', tempF: 69, precip: 0 },
    { time: '5 AM', tempF: 66, precip: 0 },
    { time: '8 AM', tempF: 73, precip: 0 },
    { time: '11 AM', tempF: 87, precip: 0 },
  ],
  // open-meteo air quality: US AQI 22 ("good") maps to OWM's 1-5 scale as 1.
  airQuality: { aqi: 1, pm2_5: 13.9, pm10: 14.2, o3: 92 },
};

const fToC = (f) => Math.round(((f - 32) * 5 / 9) * 10) / 10;
const mphToMs = (mph) => Math.round(mph * 0.44704 * 10) / 10;

// units: 'imperial' (default, °F/mph) or 'metric' (°C/m/s) — mirrors the OWM
// `units` query parameter the client uses.
function buildDemoWeatherPayload(units = 'imperial') {
  const metric = units === 'metric';
  const t = (f) => (metric ? fToC(f) : f);

  return {
    coordinates: { ...CHILI_NY },
    resolvedName: 'Chili',
    weatherData: {
      name: 'Chili',
      coord: { ...CHILI_NY },
      weather: [{ ...SNAPSHOT.current.weather }],
      main: {
        temp: t(SNAPSHOT.current.tempF),
        feels_like: t(SNAPSHOT.current.feelsLikeF),
        temp_min: t(SNAPSHOT.daily[0].lowF),
        temp_max: t(SNAPSHOT.daily[0].highF),
        humidity: SNAPSHOT.current.humidity,
      },
      wind: { speed: metric ? mphToMs(SNAPSHOT.current.windMph) : SNAPSHOT.current.windMph },
    },
    airQualityData: {
      list: [{
        main: { aqi: SNAPSHOT.airQuality.aqi },
        components: {
          pm2_5: SNAPSHOT.airQuality.pm2_5,
          pm10: SNAPSHOT.airQuality.pm10,
          o3: SNAPSHOT.airQuality.o3,
        },
      }],
    },
    forecastData: SNAPSHOT.daily.map((day) => ({
      dayName: day.dayName,
      tempHigh: Math.round(t(day.highF)),
      tempLow: Math.round(t(day.lowF)),
      tempAvg: Math.round(t(day.avgF)),
      weather: { ...day.weather },
      precipitation: day.precipIn,
    })),
    chartData: SNAPSHOT.hourly.map((h) => ({
      time: h.time,
      temperature: Math.round(t(h.tempF)),
      precipitation: h.precip,
    })),
  };
}

module.exports = { buildDemoWeatherPayload };
