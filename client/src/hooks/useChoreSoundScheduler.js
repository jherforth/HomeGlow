import { useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiConfig.js';
import { shouldShowChoreToday, getTodayDateString } from '../utils/choreHelpers.js';
import { getServerTimezoneSync } from '../utils/timezone.js';
import {
  getMinutesSinceMidnightInTz,
  getElapsedDueSlots,
  playSound,
  soundUrl,
} from '../utils/choreSound.js';

const FIRED_STORAGE_KEY = 'choreSoundFired';
const TICK_MS = 20 * 1000;          // check for due chores every 20s
const DATA_REFRESH_MS = 3 * 60 * 1000; // refresh schedules/history every 3 min

const loadFired = () => {
  try {
    const raw = localStorage.getItem(FIRED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const persistFired = (fired, today) => {
  try {
    // Keep only today's keys so the store doesn't grow unbounded.
    const kept = [...fired].filter((key) => key.includes(`:${today}:`));
    localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

// Always-on ringer for chore due-time notifications. Mounted once at the app
// level so sounds fire regardless of which tab/widget is visible.
//
// `enabled` is the combined gate (global master ON and this device not muted).
export default function useChoreSoundScheduler({ enabled, defaultSound, volume = 1 }) {
  const schedulesRef = useRef([]);
  const historyRef = useRef([]);
  const firedRef = useRef(loadFired());
  const primedRef = useRef(false);
  const optionsRef = useRef({ defaultSound, volume });

  useEffect(() => {
    optionsRef.current = { defaultSound, volume };
  }, [defaultSound, volume]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const today = getTodayDateString();
        const [schedulesRes, historyRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/chore-schedules?usage=chart`),
          axios.get(`${API_BASE_URL}/api/chore-history?date=${today}`),
        ]);
        if (cancelled) return;
        schedulesRef.current = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];
        historyRef.current = Array.isArray(historyRes.data) ? historyRes.data : [];
      } catch (error) {
        console.error('ChoreSoundScheduler: failed to fetch data', error);
      }
    };

    const isCompletedToday = (schedule, today) =>
      historyRef.current.some((h) => h.chore_schedule_id === schedule.id && h.date === today);

    const tick = () => {
      const today = getTodayDateString();
      const tz = getServerTimezoneSync();
      const nowMinutes = getMinutesSinceMidnightInTz(tz);
      let soundToPlay = null;

      for (const schedule of schedulesRef.current) {
        if (!schedule.sound_enabled) continue;
        if (!shouldShowChoreToday(schedule)) continue;
        if (isCompletedToday(schedule, today)) continue;

        const slots = getElapsedDueSlots(schedule, nowMinutes);
        for (const slot of slots) {
          const key = `${schedule.id}:${today}:${slot}`;
          if (firedRef.current.has(key)) continue;
          firedRef.current.add(key);
          // On the very first pass we only "prime" already-elapsed slots so we
          // don't blast sounds for due times that passed before the app loaded.
          if (primedRef.current) {
            soundToPlay = schedule.sound || optionsRef.current.defaultSound || null;
          }
        }
      }

      persistFired(firedRef.current, today);

      if (soundToPlay) {
        playSound(soundUrl(soundToPlay), optionsRef.current.volume);
      }
      primedRef.current = true;
    };

    // Prime + first evaluation once data is available.
    fetchData().then(() => {
      if (!cancelled) tick();
    });

    const tickInterval = setInterval(tick, TICK_MS);
    const dataInterval = setInterval(fetchData, DATA_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(tickInterval);
      clearInterval(dataInterval);
    };
  }, [enabled]);
}
