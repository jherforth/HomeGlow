import { API_BASE_URL } from './apiConfig.js';

// ---- Pure, testable scheduling helpers -------------------------------------

// Parse an 'HH:MM' 24-hour string into minutes since midnight, or null.
export function parseDueTimeToMinutes(dueTime) {
  if (typeof dueTime !== 'string') return null;
  const match = dueTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// Minutes since local midnight in the given IANA timezone.
export function getMinutesSinceMidnightInTz(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    let hour = 0;
    let minute = 0;
    for (const part of parts) {
      if (part.type === 'hour') hour = parseInt(part.value, 10);
      if (part.type === 'minute') minute = parseInt(part.value, 10);
    }
    if (hour === 24) hour = 0; // some engines emit 24 for midnight
    return hour * 60 + minute;
  } catch {
    const d = date;
    return d.getHours() * 60 + d.getMinutes();
  }
}

// Given a schedule and the current minutes-since-midnight, return the list of
// "ring slots" (in minutes) that have already elapsed today: the due time plus
// each reminder-interval repeat up to now (and before end of day). Empty if the
// schedule has no due time or nothing has elapsed yet.
export function getElapsedDueSlots(schedule, nowMinutes) {
  const due = parseDueTimeToMinutes(schedule?.due_time);
  if (due === null || nowMinutes < due) return [];

  const slots = [due];
  const interval = Number(schedule?.reminder_interval_minutes) || 0;
  if (interval > 0) {
    let next = due + interval;
    while (next <= nowMinutes && next < 24 * 60) {
      slots.push(next);
      next += interval;
    }
  }
  return slots;
}

// ---- Audio playback (browser side effects) ---------------------------------

// A near-silent 1-sample WAV used to satisfy autoplay-gesture requirements.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let audioUnlocked = false;

// Attach one-time listeners so the first user interaction unlocks audio on
// kiosk browsers that block autoplay until a gesture.
export function unlockAudio() {
  if (audioUnlocked || typeof window === 'undefined') return;

  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      const a = new Audio(SILENT_WAV);
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Ignore — playback will be retried on the real sound.
    }
    remove();
  };

  const remove = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

// Build the served URL for a sound filename stored on a schedule/setting.
export function soundUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//.test(filename) || filename.startsWith('/')) return filename;
  return `${API_BASE_URL}/Uploads/sounds/${encodeURIComponent(filename)}`;
}

// Play a sound. `source` may be a full URL/path or a bare filename.
// `volume` is 0..1. Returns the Audio element (or null on failure).
export function playSound(source, volume = 1) {
  if (typeof Audio === 'undefined' || !source) return null;
  try {
    const url = /^https?:\/\/|^\//.test(source) ? source : soundUrl(source);
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    return audio;
  } catch {
    return null;
  }
}
