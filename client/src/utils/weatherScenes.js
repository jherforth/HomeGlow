// Weather scenes (#247): a theme can change with the weather. Its manifest's
// `weather` lists a scene per condition, and the display shows the scene for
// the condition outside. Night is not a scene of its own: a scene's dark-mode
// look is its night, so on Auto mode night follows sunset.
//
// The conditions are the server's normalized vocabulary (Home Assistant's
// tokens; server/services/weather/payload.js). Every one can have a scene but
// `clear-night`, which is `sunny` in dark mode, and `exceptional`, which is
// what `default` is for.

export const WEATHER_SCENE_KEYS = [
  'sunny', 'partlycloudy', 'cloudy', 'fog', 'windy', 'windy-variant',
  'rainy', 'pouring', 'snowy', 'snowy-rainy', 'hail', 'lightning', 'lightning-rainy',
];

// Where a missing scene falls back to, before `default`, so a theme can be
// made a few scenes at a time: a downpour shows the rain scene until the
// theme has a pouring one.
export const WEATHER_SCENE_FALLBACKS = {
  pouring: ['rainy'],
  'lightning-rainy': ['lightning', 'rainy'],
  lightning: ['rainy'],
  hail: ['snowy-rainy', 'snowy'],
  'snowy-rainy': ['snowy'],
  'windy-variant': ['windy'],
  partlycloudy: ['cloudy'],
};

// Night comes from the display mode, so a clear night is the sunny scene.
const ALIASES = { 'clear-night': 'sunny' };

/**
 * The scene to show for a condition: the condition's own, else the first of
 * its fallbacks the theme has, else 'default'. With no condition (no weather
 * set up, or not heard yet), 'default'.
 */
export function pickWeatherScene(weather, condition) {
  const scenes = weather?.scenes || {};
  const key = ALIASES[condition] || condition;
  if (!key) return 'default';
  return [key, ...(WEATHER_SCENE_FALLBACKS[key] || [])].find((candidate) => scenes[candidate]) || 'default';
}

/** The scenes a theme can show, in the order of WEATHER_SCENE_KEYS, then 'default'. */
export function weatherScenesOf(weather) {
  if (!weather) return [];
  return [...WEATHER_SCENE_KEYS.filter((key) => weather.scenes?.[key]), 'default'];
}
