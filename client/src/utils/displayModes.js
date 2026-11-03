// Display modes: named looks the wall switches to on a schedule (Morning,
// Dinner prep, Night...). Each mode is this display's own, kept in its device
// settings under `displayModes`.
//
// A mode can:
//   - turn on by schedule: days of the week plus a start and end time, read
//     in the household time zone; an end at or before the start runs past
//     midnight into the next day. Schedules may not overlap (findOverlaps).
//   - start on a tab, and go back to it after the display sits idle.
//   - hold the screen dimmed almost to black (displayDim.js setDimmingHold).
//   - change what a Stack shows (utils/widgetStacks.js stackInMode).
// The dashboard's layout itself never changes with the mode, so everything
// stays where people expect it.
//
// Everything here is pure, for tests; hooks/useDisplayModes.js runs it.

import { normalizeTakeovers } from './takeovers.js';

// Where a display keeps its modes in its device settings.
export const DISPLAY_MODES_KEY = 'displayModes';

export const MINUTES_PER_DAY = 24 * 60;
export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export const MODE_COLORS = ['#D9A441', '#B4683F', '#A24E2A', '#7C8B6A', '#5B7A99', '#8A6FA8', '#4A3A2E', '#9A8F82'];

export const DEFAULT_MODES_SETTINGS = {
  modes: [],
  showLabel: true,
  returnMinutes: 3,
};

// The dim level a mode holds the screen at: "basically off".
export const MODE_DIM_LEVEL = 0.04;

// A mode change waits this long after the last touch, so the wall never
// switches tabs or dims under someone's finger.
export const TOUCH_WAIT_MS = 60 * 1000;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(value) {
  const match = typeof value === 'string' ? value.match(TIME_PATTERN) : null;
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  const start = parseTime(raw.start);
  const end = parseTime(raw.end);
  if (days.length === 0 || start == null || end == null) return null;
  return { days, start: raw.start, end: raw.end };
}

export function normalizeMode(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
  if (!name) return null;
  const startTab = Number(raw.startTab);
  return {
    id: raw.id,
    name,
    color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : MODE_COLORS[0],
    schedule: normalizeSchedule(raw.schedule),
    startTab: Number.isInteger(startTab) && startTab > 0 ? startTab : null,
    dim: raw.dim === true,
    // Home Assistant: turn on when a phone's alarm goes off (until a time),
    // or when an entity is in a state; only while someone is home.
    alarm: isEntityId(raw.alarm?.entity) && parseTime(raw.alarm?.until) != null
      ? { entity: raw.alarm.entity, until: raw.alarm.until }
      : null,
    when: isEntityId(raw.when?.entity) && typeof raw.when?.state === 'string' && raw.when.state
      ? { entity: raw.when.entity, state: raw.when.state.slice(0, 100) }
      : null,
    onlyHome: Array.isArray(raw.onlyHome) ? [...new Set(raw.onlyHome.filter(isEntityId))].slice(0, 20) : [],
  };
}

const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
export const isEntityId = (value) => typeof value === 'string' && ENTITY_ID.test(value);

/** A display's Home Assistant settings (the server's services/displayModesHa.js). */
export function normalizeHa(raw) {
  const ha = raw && typeof raw === 'object' ? raw : {};
  return {
    helper: isEntityId(ha.helper) && ha.helper.startsWith('input_select.') ? ha.helper : null,
    helperId: typeof ha.helperId === 'string' ? ha.helperId : null,
    title: typeof ha.title === 'string' ? ha.title : null,
    report: ha.report !== false,
    wake: Array.isArray(ha.wake) ? [...new Set(ha.wake.filter(isEntityId))].slice(0, 20) : [],
  };
}

export function normalizeModesSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const modes = (Array.isArray(source.modes) ? source.modes : [])
    .map(normalizeMode)
    .filter((mode) => mode && !seen.has(mode.id) && seen.add(mode.id));
  return {
    modes,
    showLabel: source.showLabel !== false,
    returnMinutes: clampInt(source.returnMinutes, 0, 120, DEFAULT_MODES_SETTINGS.returnMinutes),
    ha: normalizeHa(source.ha),
    takeovers: normalizeTakeovers(source.takeovers),
  };
}

export function newModeId() {
  return `mode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---- Time --------------------------------------------------------------

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Minutes since Sunday 00:00 in `timeZone` (else the device's own zone).
export function minuteOfWeek(date = new Date(), timeZone) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
      }).formatToParts(date);
      const get = (type) => parts.find((part) => part.type === type)?.value;
      const day = WEEKDAYS[get('weekday')];
      const hour = Number(get('hour')) % 24;
      const minute = Number(get('minute'));
      if (day != null && Number.isFinite(hour) && Number.isFinite(minute)) {
        return day * MINUTES_PER_DAY + hour * 60 + minute;
      }
    } catch {
      // Unknown zone: fall through to the device's clock.
    }
  }
  return date.getDay() * MINUTES_PER_DAY + date.getHours() * 60 + date.getMinutes();
}

// The schedule as half-open [start, end) spans within one week, minutes since
// Sunday 00:00. A span that runs past Saturday midnight is split in two.
export function scheduleSpans(schedule) {
  const clean = normalizeSchedule(schedule);
  if (!clean) return [];
  const start = parseTime(clean.start);
  let end = parseTime(clean.end);
  if (end <= start) end += MINUTES_PER_DAY;
  const spans = [];
  for (const day of clean.days) {
    const a = day * MINUTES_PER_DAY + start;
    const b = day * MINUTES_PER_DAY + end;
    if (b <= MINUTES_PER_WEEK) spans.push([a, b]);
    else spans.push([a, MINUTES_PER_WEEK], [0, b - MINUTES_PER_WEEK]);
  }
  return spans;
}

export function isScheduleActive(schedule, date = new Date(), timeZone) {
  const now = minuteOfWeek(date, timeZone);
  return scheduleSpans(schedule).some(([a, b]) => now >= a && now < b);
}

// The scheduled mode right now, or null for the normal layout.
export function scheduledModeAt(modes, date = new Date(), timeZone) {
  const list = Array.isArray(modes) ? modes : [];
  const hit = list.find((mode) => mode.schedule && isScheduleActive(mode.schedule, date, timeZone));
  return hit ? hit.id : null;
}

// Every pair of modes whose schedules share a minute, with the first shared
// span, for the Admin warning. Schedules may not overlap.
export function findOverlaps(modes) {
  const list = (Array.isArray(modes) ? modes : []).filter((mode) => mode.schedule);
  const found = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const shared = sharedSpan(scheduleSpans(list[i].schedule), scheduleSpans(list[j].schedule));
      if (shared) found.push({ a: list[i].id, b: list[j].id, from: shared[0], to: shared[1] });
    }
  }
  return found;
}

function sharedSpan(spansA, spansB) {
  for (const [a1, b1] of spansA) {
    for (const [a2, b2] of spansB) {
      const from = Math.max(a1, a2);
      const to = Math.min(b1, b2);
      if (from < to) return [from, to];
    }
  }
  return null;
}

// ---- Which mode shows ------------------------------------------------------

// The director's one decision. `pin` is { modeId, scheduledAtPin }: what was
// pinned (null for the normal layout) and what the schedule said when it was.
// A pin lasts until the schedule changes its mind. `shownId` is on screen now;
// a change waits while someone has touched the screen in the last
// `touchWaitMs` (so it never moves under a finger).
//
// Returns { want, pinExpired, show }: the mode wanted now, whether the pin
// just ran out, and what to show (want, or shownId while held off).
export function decideMode({ scheduledId, pin, shownId, lastActivityMs, nowMs, touchWaitMs }) {
  const pinExpired = Boolean(pin) && pin.scheduledAtPin !== scheduledId;
  const want = pin && !pinExpired ? pin.modeId : scheduledId;
  const touchedRecently = Number.isFinite(lastActivityMs) && nowMs - lastActivityMs < touchWaitMs;
  const show = want !== shownId && touchedRecently ? shownId : want;
  return { want, pinExpired, show };
}

// ---- Layouts ---------------------------------------------------------------

// "Mon–Fri · 6:00 → 9:00" style summary pieces, for labels.
export function scheduleDaysKey(days) {
  const set = [...new Set(days)].sort().join(',');
  if (set === '0,1,2,3,4,5,6') return 'everyDay';
  if (set === '1,2,3,4,5') return 'weekdays';
  if (set === '0,6') return 'weekends';
  return null;
}

// ---- The layout editor's draft for one tab -------------------------------
// A draft is { saved: { name: {x,y,w,h} }, hidden: [names] }, what a mode
// stores for the tab in layouts[tab] and hidden[tab].


// ---- Home Assistant ------------------------------------------------------
// The mode helper's options: Automatic hands the choice back to schedules
// and triggers, Normal is the usual layout, then each mode by name. Fixed
// English, because Home Assistant automations name them.
export const HELPER_AUTOMATIC = 'Automatic';
export const HELPER_NORMAL = 'Normal';

export const helperOptionFor = (modes, modeId) => (modeId == null
  ? HELPER_NORMAL
  : (modes.find((mode) => mode.id === modeId)?.name ?? HELPER_NORMAL));

/** The mode a helper option names: a mode id, null (Normal), or undefined. */
export function modeForOption(modes, option) {
  if (option === HELPER_NORMAL) return null;
  const mode = modes.find((item) => item.name === option);
  return mode ? mode.id : undefined;
}

/** Is a person, tracker or zone at home? Zones count the people in them. */
export function isHome(state) {
  if (!state) return false;
  const value = String(state.state ?? '');
  if (/^\d+$/.test(value)) return Number(value) > 0;
  return value === 'home';
}

/**
 * When an alarm that went off keeps its mode on: [start, end) in ms, from the
 * alarm until the next `until` time after it (in the household zone), at most
 * 12 hours. Null when no alarm has gone off.
 */
export function alarmWindow(rangIso, until, timeZone) {
  const start = Date.parse(rangIso || '');
  const untilMinutes = parseTime(until);
  if (!Number.isFinite(start) || untilMinutes == null) return null;
  const startMinute = minuteOfWeek(new Date(start), timeZone) % MINUTES_PER_DAY;
  let wait = untilMinutes - startMinute;
  if (wait <= 0) wait += MINUTES_PER_DAY;
  const end = start + Math.min(wait, 12 * 60) * 60000;
  return [start, end];
}

/**
 * Remember when phones' alarms went off. A next-alarm sensor moves on to the
 * next alarm as soon as one rings, so the time it showed before is kept once
 * it has passed. `memory` is { seen: {entity: iso}, rang: {entity: iso} }.
 */
export function rememberAlarms(memory, states, nowMs) {
  const seen = { ...(memory?.seen || {}) };
  const rang = { ...(memory?.rang || {}) };
  for (const [entity, state] of Object.entries(states || {})) {
    const value = state?.state;
    const at = Date.parse(value || '');
    if (!Number.isFinite(at)) continue;
    const before = Date.parse(seen[entity] || '');
    if (Number.isFinite(before) && before !== at && before <= nowMs + 60000) rang[entity] = seen[entity];
    if (at <= nowMs) rang[entity] = value;
    seen[entity] = value;
  }
  return { seen, rang };
}

/**
 * Which mode this display would show on its own: a mode whose alarm or entity
 * trigger is on beats a scheduled one; either needs someone home when the
 * mode asks for it. Without Home Assistant (`ha` null) its triggers are off
 * and its conditions pass, so schedules carry on.
 * Returns { id, source } (id null for the normal layout).
 */
export function automaticModeAt({ modes, now = new Date(), timeZone, ha = null, rang = {} }) {
  const list = Array.isArray(modes) ? modes : [];
  const states = ha?.states || {};
  const nowMs = now.getTime();
  const someoneHome = (mode) => !ha || mode.onlyHome.length === 0 || mode.onlyHome.some((id) => isHome(states[id]));
  if (ha) {
    for (const mode of list) {
      if (!someoneHome(mode)) continue;
      if (mode.alarm) {
        const window = alarmWindow(rang[mode.alarm.entity], mode.alarm.until, timeZone);
        if (window && nowMs >= window[0] && nowMs < window[1]) return { id: mode.id, source: 'alarm' };
      }
      if (mode.when && states[mode.when.entity]?.state === mode.when.state) return { id: mode.id, source: 'entity' };
    }
  }
  const scheduled = list.find((mode) => mode.schedule && someoneHome(mode) && isScheduleActive(mode.schedule, now, timeZone));
  return scheduled ? { id: scheduled.id, source: 'schedule' } : { id: null, source: 'none' };
}

/**
 * What Home Assistant's helper asks for, or null when it doesn't (Automatic,
 * an option no mode has, or the wall's own choice echoed back while that pin
 * holds). { modeId } with modeId null for Normal.
 */
export function helperCommand({ modes, option, pin }) {
  if (!option || option === HELPER_AUTOMATIC) return null;
  const modeId = modeForOption(modes, option);
  if (modeId === undefined) return null;
  if (pin && helperOptionFor(modes, pin.modeId) === option) return null;
  return { modeId };
}
