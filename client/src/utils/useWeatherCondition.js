// The weather outside, for a theme's weather scenes (#247).
//
// Polls /api/weather/condition, which the server answers from any fresh
// reading of the place, as often as the server's reading lasts (10 minutes):
// more often would only ask the same question, and less often would show a
// storm late. It checks again when the display comes back into view. Polling,
// not the plugin event stream, which some installs never receive.
//
// The last condition is kept in localStorage, so a reload paints the scene at
// once. On an error the last condition stands; with none, the theme shows
// its default scene.
import { useEffect, useState, useSyncExternalStore } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';

const CACHE_KEY = 'homeglow_weather_condition';
const FALLBACK_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

function readCachedCondition() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return typeof cached?.condition === 'string' ? cached.condition : null;
  } catch {
    return null;
  }
}

function writeCachedCondition(condition) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ condition, at: Date.now() }));
  } catch {
    // The cache only saves a moment of the default scene after a reload.
  }
}

/** How long to wait before asking again, from the server's answer. */
export function nextCheckDelay(answer) {
  const maxAge = Number(answer?.maxAgeMs);
  return Number.isFinite(maxAge) && maxAge > 0 ? Math.max(MIN_INTERVAL_MS, maxAge) : FALLBACK_INTERVAL_MS;
}

/**
 * The current condition token, or null. Only polls while `enabled` (the
 * active theme has weather scenes). `lat`/`lon` are the appearance location;
 * Home Assistant needs none.
 */
export function useWeatherCondition({ enabled, lat, lon }) {
  const [condition, setCondition] = useState(readCachedCondition);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    let cancelled = false;
    let inFlight = false;
    const hasPlace = typeof lat === 'number' && typeof lon === 'number';

    const check = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      clearTimeout(timer);
      let wait = FALLBACK_INTERVAL_MS;
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/weather/condition`, {
          params: hasPlace ? { lat, lon } : {},
        });
        if (!cancelled && typeof data?.condition === 'string') {
          setCondition(data.condition);
          writeCachedCondition(data.condition);
        }
        wait = nextCheckDelay(data);
      } catch (error) {
        console.warn('Weather scenes: could not read the weather:', error?.response?.data?.error || error.message);
      } finally {
        inFlight = false;
      }
      if (!cancelled) timer = setTimeout(check, wait);
    };

    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, lat, lon]);

  return enabled ? condition : null;
}

// A scene previewed from Admin → Look → Appearance: shown on this display
// in place of the weather's for a while, never saved, so a forgotten preview
// cannot pin a kiosk to one scene.
export const PREVIEW_MS = 10 * 60 * 1000;
let preview = null;
let previewTimer = null;
const previewListeners = new Set();

const publishPreview = (next) => {
  preview = next;
  previewListeners.forEach((listener) => listener());
};

/** Show `scene` on this display for PREVIEW_MS; null ends the preview. */
export function setWeatherScenePreview(scene) {
  clearTimeout(previewTimer);
  if (!scene) {
    publishPreview(null);
    return;
  }
  publishPreview(scene);
  previewTimer = setTimeout(() => publishPreview(null), PREVIEW_MS);
}

/** The scene being previewed on this display, or null. */
export function useWeatherScenePreview() {
  return useSyncExternalStore(
    (listener) => {
      previewListeners.add(listener);
      return () => previewListeners.delete(listener);
    },
    () => preview,
  );
}
