import { describe, it, expect } from 'vitest';
import { pickWeatherScene, weatherScenesOf, WEATHER_SCENE_KEYS, WEATHER_SCENE_FALLBACKS } from './weatherScenes.js';
import { resolveTheme, validateThemePackage, MANIFEST_VERSION } from './themes.js';
import { nextCheckDelay } from './useWeatherCondition.js';

const scene = { ambience: [{ layer: 'blobs', colors: ['#ffffff'] }] };
const scenes = (...keys) => ({ scenes: Object.fromEntries(keys.map((key) => [key, scene])) });

describe('pickWeatherScene', () => {
  it('shows a condition\'s own scene when the theme has one', () => {
    expect(pickWeatherScene(scenes('rainy', 'pouring'), 'pouring')).toBe('pouring');
    expect(pickWeatherScene(scenes('hail', 'snowy'), 'hail')).toBe('hail');
    expect(pickWeatherScene(scenes('lightning'), 'lightning')).toBe('lightning');
  });

  it('falls back to a related scene, then to default', () => {
    const weather = scenes('rainy', 'snowy', 'cloudy', 'windy');
    expect(pickWeatherScene(weather, 'pouring')).toBe('rainy');
    expect(pickWeatherScene(weather, 'lightning-rainy')).toBe('rainy');
    expect(pickWeatherScene(weather, 'hail')).toBe('snowy');
    expect(pickWeatherScene(weather, 'snowy-rainy')).toBe('snowy');
    expect(pickWeatherScene(weather, 'windy-variant')).toBe('windy');
    expect(pickWeatherScene(weather, 'partlycloudy')).toBe('cloudy');
    expect(pickWeatherScene(weather, 'fog')).toBe('default');
    expect(pickWeatherScene(scenes('lightning', 'rainy'), 'lightning-rainy')).toBe('lightning');
  });

  it('a clear night is the sunny scene: night is the mode, not a scene', () => {
    expect(pickWeatherScene(scenes('sunny'), 'clear-night')).toBe('sunny');
  });

  it('with no condition, or one outside the vocabulary, shows default', () => {
    const weather = scenes('sunny');
    expect(pickWeatherScene(weather, null)).toBe('default');
    expect(pickWeatherScene(weather, 'exceptional')).toBe('default');
    expect(pickWeatherScene(weather, 'meteor-shower')).toBe('default');
    expect(pickWeatherScene(undefined, 'sunny')).toBe('default');
  });

  it('every fallback names real scenes', () => {
    Object.entries(WEATHER_SCENE_FALLBACKS).forEach(([key, chain]) => {
      expect(WEATHER_SCENE_KEYS).toContain(key);
      chain.forEach((fallback) => expect(WEATHER_SCENE_KEYS).toContain(fallback));
    });
  });

  it('lists a theme\'s scenes in a fixed order, default last', () => {
    expect(weatherScenesOf(scenes('snowy', 'sunny'))).toEqual(['sunny', 'snowy', 'default']);
    expect(weatherScenesOf(null)).toEqual([]);
  });
});

// A weather theme in miniature.
const skies = {
  manifestVersion: 4,
  id: 'skies',
  name: 'Skies',
  extends: 'classic',
  colors: { primary: '#ffffff', secondary: '#eeeeee', accent: '#3366ff' },
  tokens: { all: { '--hg-grid-gap': '16px' }, dark: { '--background': '#101820' } },
  weather: {
    default: { ambience: [{ layer: 'blobs', colors: ['#9fc5ff'] }] },
    scenes: {
      rainy: {
        colors: { accent: '#5a7d9a' },
        tokens: { dark: { '--background': '#0b1119' } },
        ambience: [
          { layer: 'particles', src: 'assets/drop.svg', motion: 'fall', count: 30 },
          { layer: 'flash', every: [10, 30], strength: 0.3 },
        ],
      },
      snowy: { confetti: { colors: ['#ffffff'] } },
    },
  },
};
const assets = ['assets/drop.svg'];

describe('validating weather scenes', () => {
  it('accepts a well-formed weather theme', () => {
    expect(validateThemePackage(skies, { assets })).toEqual([]);
    expect(MANIFEST_VERSION).toBeGreaterThanOrEqual(4);
  });

  it('weather and flash need manifest version 4', () => {
    expect(validateThemePackage({ ...skies, manifestVersion: 3 }, { assets })).toEqual(['weather, flash need manifestVersion 4']);
    const flashOnly = { manifestVersion: 3, id: 'storm', name: 'Storm', ambience: [{ layer: 'flash' }] };
    expect(validateThemePackage(flashOnly)).toEqual(['flash need manifestVersion 4']);
  });

  it('checks each scene as strictly as the theme itself', () => {
    const bad = (weather) => validateThemePackage({ ...skies, weather }, { assets });
    expect(bad({ scenes: { tornado: scene } })[0]).toMatch(/weather.scenes.tornado: not a weather condition/);
    expect(bad({ scenes: { 'clear-night': scene } })[0]).toMatch(/not a weather condition/);
    expect(bad({ scenes: { rainy: { sound: 'rain.mp3' } } })).toEqual([expect.stringMatching(/weather.scenes.rainy: unknown field sound/)]);
    expect(bad({ scenes: { rainy: { colors: { accent: 'blue' } } } })).toEqual(['weather.scenes.rainy.colors.accent must be a hex color']);
    expect(bad({ scenes: { rainy: { tokens: { all: { '--background': 'red; x: url(y)' } } } } })[0]).toMatch(/weather.scenes.rainy.tokens.all: --background/);
    expect(bad({ scenes: { rainy: { ambience: [{ layer: 'particles', src: 'assets/missing.svg', count: 3 }] } } })[0])
      .toMatch(/weather.scenes.rainy.ambience\[0\].src/);
    expect(bad({ default: { ambience: [{ layer: 'flash', strength: 0.9 }] } })[0]).toMatch(/weather.default.ambience\[0\].strength/);
    expect(bad({ seasons: {} })).toEqual(['weather: unknown field seasons (use default and scenes)']);
    expect(bad([])).toEqual(['weather must be an object']);
  });
});

describe('resolveTheme with a weather scene', () => {
  const themes = [{ manifestVersion: 1, id: 'classic', name: 'Classic' }, skies];
  const files = { skies: { 'assets/drop.svg': '/themes/skies/assets/drop.svg' } };

  it('lays the scene over the theme: colors and tokens merge, ambience replaces', () => {
    const rainy = resolveTheme('skies', themes, files, { scene: 'rainy' });
    expect(rainy.scene).toBe('rainy');
    expect(rainy.colors).toEqual({ primary: '#ffffff', secondary: '#eeeeee', accent: '#5a7d9a' });
    expect(rainy.tokens.all).toEqual({ '--hg-grid-gap': '16px' });
    expect(rainy.tokens.dark).toEqual({ '--background': '#0b1119' });
    expect(rainy.ambience.map((layer) => layer.layer)).toEqual(['particles', 'flash']);
    expect(rainy.ambienceAssets).toEqual(files.skies);
  });

  it('a scene that sets less keeps the rest of the theme', () => {
    const snowy = resolveTheme('skies', themes, files, { scene: 'snowy' });
    expect(snowy.colors.accent).toBe('#3366ff');
    expect(snowy.tokens.dark).toEqual({ '--background': '#101820' });
    expect(snowy.confetti).toEqual({ colors: ['#ffffff'] });
    expect(snowy.confettiAssets).toEqual(files.skies);
  });

  it('with no scene, or an unknown one, the theme shows its default scene', () => {
    expect(resolveTheme('skies', themes, files).scene).toBe('default');
    expect(resolveTheme('skies', themes, files).ambience).toEqual(skies.weather.default.ambience);
    expect(resolveTheme('skies', themes, files, { scene: 'fog' }).ambience).toBeUndefined();
  });

  it('a theme without weather is untouched by a scene', () => {
    const classic = resolveTheme('classic', themes, files, { scene: 'rainy' });
    expect(classic.scene).toBeUndefined();
    expect(classic.weather).toBeUndefined();
  });
});

describe('nextCheckDelay', () => {
  it('asks again when the server\'s reading runs out, never more than once a minute', () => {
    expect(nextCheckDelay({ maxAgeMs: 600000 })).toBe(600000);
    expect(nextCheckDelay({ maxAgeMs: 1000 })).toBe(60000);
    expect(nextCheckDelay({})).toBe(600000);
    expect(nextCheckDelay(null)).toBe(600000);
  });
});
