import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { startHaPoll } from '../utils/haPoll.js';
import {
  DISPLAY_MODES_KEY,
  TOUCH_WAIT_MS,
  HELPER_AUTOMATIC,
  automaticModeAt,
  decideMode,
  helperCommand,
  helperOptionFor,
  isHome,
  readHelper,
  normalizeModesSettings,
  pinWhileHaAway,
  rememberAlarms,
} from '../utils/displayModes.js';
import { getServerTimezoneSync } from '../utils/timezone.js';
import { wakeDisplay } from '../utils/displayDim.js';

// How often the schedule is checked. A mode starts within this of its time.
const TICK_MS = 15 * 1000;
// How often Home Assistant's side is read, when the modes use it. HomeGlow's
// server answers from its live link, so this costs Home Assistant nothing.
const HA_POLL_MS = 3 * 1000;
// The current-mode sensor is posted on every change, and again this often so
// it comes back after Home Assistant restarts.
const REPORT_EVERY_MS = 10 * 60 * 1000;
const PIN_STORAGE_KEY = 'homeglow:displayModePin';
const ALARM_STORAGE_KEY = 'homeglow:displayModeAlarms';
const ACTIVITY_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'wheel'];

const readJson = (key, check) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (check(raw)) return raw;
  } catch { /* storage unavailable */ }
  return null;
};
const writeJson = (key, value) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch { /* per-display convenience only */ }
};
const readPin = () => readJson(PIN_STORAGE_KEY, (raw) => raw && typeof raw === 'object' && 'modeId' in raw && 'scheduledAtPin' in raw);

// Does this display's mode setup read anything from Home Assistant?
const usesHa = (settings) => Boolean(settings.ha.helper)
  || settings.ha.wake.length > 0
  || settings.takeovers.some((rule) => rule.enabled)
  || settings.modes.some((mode) => mode.alarm || mode.when || mode.onlyHome.length > 0);

/**
 * Runs this display's modes (utils/displayModes.js): which one is on, the pin,
 * waiting while the screen is touched, and Home Assistant:
 * its mode helper (read and written), the triggers and conditions the modes
 * name, the current-mode sensor, and waking the screen when someone arrives.
 *
 * - deviceSettings: this display's raw device settings
 * - apiDeviceUrl: this display's device API base
 * - onSaved(settings): told the device settings a save returned
 * - enabled: false on a phone or before settings load; no mode is shown then
 */
export default function useDisplayModes({ deviceSettings, apiDeviceUrl, onSaved, enabled }) {
  const settings = useMemo(
    () => normalizeModesSettings(deviceSettings?.[DISPLAY_MODES_KEY]),
    [deviceSettings]
  );
  const [pin, setPinState] = useState(readPin);
  const [shownId, setShownId] = useState(null);
  const [source, setSource] = useState('none');
  const [haState, setHaState] = useState(null); // the last /modes/ha answer
  const lastActivityRef = useRef(0);
  const pinRef = useRef(pin);
  const shownRef = useRef(shownId);
  const haRef = useRef(haState);
  const automaticRef = useRef({ id: null, source: 'none' });
  // What the schedule alone says (Home Assistant's triggers left out): a pin
  // remembers it, so Home Assistant going away isn't taken for a change.
  const scheduleOnlyRef = useRef(null);
  // A pin that ended while Home Assistant was away couldn't hand the helper
  // back to Automatic; this does it once Home Assistant answers again (the
  // helper option the pin had set, or null).
  const helperBackDueRef = useRef(null);
  // When the read now under way was asked for (one at a time).
  const readStartedRef = useRef(0);
  // The wall's helper choice until Home Assistant shows it (readHelper).
  const pendingHelperRef = useRef(null);
  // Whether Home Assistant was away at the last check (for a new pin).
  const haAwayRef = useRef(false);
  // The helper's option and when this display saw it change (its own clock,
  // so a pin and a choice made in Home Assistant compare fairly).
  const helperSeenRef = useRef({ option: undefined, at: 0 });
  const alarmsRef = useRef(readJson(ALARM_STORAGE_KEY, (raw) => raw && typeof raw === 'object') || {});
  pinRef.current = pin;
  shownRef.current = shownId;
  haRef.current = haState;

  const setPin = useCallback((next) => {
    writeJson(PIN_STORAGE_KEY, next);
    pinRef.current = next;
    setPinState(next);
  }, []);

  const haOn = enabled && usesHa(settings);
  const helper = settings.ha.helper;

  // Set this display's helper in Home Assistant (the wall chose).
  // Pending until Home Assistant shows it; sent again when Home Assistant
  // answers, if it couldn't be sent (utils/displayModes.js readHelper).
  const sendHelper = useCallback((pending) => {
    pending.sends = (pending.sends || 0) + 1;
    axios.post(`${apiDeviceUrl}/modes/ha/select`, { option: pending.option }, { timeout: 15000 })
      .then(() => {
        if (pendingHelperRef.current === pending) pendingHelperRef.current = { ...pending, acceptedAt: Date.now() };
      })
      .catch((error) => {
        if (pendingHelperRef.current === pending) pendingHelperRef.current = { ...pending, failed: true };
        console.warn('Display modes: could not set the Home Assistant helper:', error?.response?.data?.error || error.message);
      });
  }, [apiDeviceUrl]);
  const selectHelper = useCallback((option) => {
    if (!helper) return;
    helperSeenRef.current = { option, at: Date.now() };
    const pending = { option, acceptedAt: null, failed: false, sends: 0 };
    pendingHelperRef.current = pending;
    sendHelper(pending);
  }, [helper, sendHelper]);

  // Touches, keys and use inside a plugin frame all count as someone at the
  // screen, so a mode change waits for them.
  useEffect(() => {
    if (!enabled) return undefined;
    const poke = () => { lastActivityRef.current = Date.now(); };
    const onMessage = (event) => { if (event?.data?.type === 'homeglow:activity') poke(); };
    ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, poke, { passive: true, capture: true }));
    window.addEventListener('message', onMessage);
    return () => {
      ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, poke, { capture: true }));
      window.removeEventListener('message', onMessage);
    };
  }, [enabled]);

  const evaluate = useCallback(({ force = false } = {}) => {
    if (!enabled) {
      setShownId(null);
      return;
    }
    const known = new Set(settings.modes.map((mode) => mode.id));
    const ha = haRef.current;
    const haUp = Boolean(ha?.connected && ha.reachable !== false);
    const states = haUp ? ha.states || {} : {};
    const now = new Date();
    const timeZone = getServerTimezoneSync();
    const rang = alarmsRef.current.rang || {};
    const automatic = automaticModeAt({ modes: settings.modes, now, timeZone, ha: haUp ? { states } : null, rang });
    automaticRef.current = automatic;
    scheduleOnlyRef.current = haUp
      ? automaticModeAt({ modes: settings.modes, now, timeZone, ha: null, rang }).id
      : automatic.id;
    const haAway = haOn && !haUp;
    haAwayRef.current = haAway;

    let currentPin = pinRef.current;
    // A pin to a mode that was deleted is no pin.
    if (currentPin && currentPin.modeId !== null && !known.has(currentPin.modeId)) {
      setPin(null);
      currentPin = null;
    }
    // Pinned while Home Assistant was away: what was "automatic" then left
    // its triggers out. Now it's back, the pin starts from what's automatic
    // with them, unless the schedule itself moved on meanwhile.
    if (currentPin?.haAway && haUp && scheduleOnlyRef.current === currentPin.scheduleAtPin) {
      currentPin = { ...currentPin, scheduledAtPin: automatic.id, haAway: false };
      setPin(currentPin);
    }
    // The helper: Home Assistant's choice, unless the wall chose since (as
    // seen by this display: a read older than the wall's own choice can't
    // undo it).
    let option = helper && haUp ? helperSeenRef.current.option : undefined;
    // A pin ran out while Home Assistant was away: hand the helper back now,
    // unless Home Assistant has chosen something else in the meantime.
    if (option !== undefined && helperBackDueRef.current !== null) {
      const due = helperBackDueRef.current;
      helperBackDueRef.current = null;
      if (option === due && option !== HELPER_AUTOMATIC) {
        selectHelper(HELPER_AUTOMATIC);
        option = HELPER_AUTOMATIC;
      }
    }
    // Changed in Home Assistant since the wall pinned (to anything but the
    // wall's own choice, Automatic included): Home Assistant has the say.
    if (currentPin && option !== undefined && helperSeenRef.current.at > (currentPin.at || 0)
      && option !== helperOptionFor(settings.modes, currentPin.modeId)) {
      setPin(null);
      currentPin = null;
    }
    const command = helperCommand({ modes: settings.modes, option, pin: currentPin });
    const base = !currentPin && command ? command.modeId : automatic.id;
    const shown = known.has(shownRef.current) ? shownRef.current : null;
    const decision = decideMode({
      scheduledId: base,
      pin: pinWhileHaAway(currentPin, haAway),
      shownId: shown,
      lastActivityMs: force ? -Infinity : lastActivityRef.current,
      nowMs: Date.now(),
      touchWaitMs: TOUCH_WAIT_MS,
    });
    if (decision.pinExpired) {
      setPin(null);
      // The pin ran its course: hand the helper back to the schedule (once
      // Home Assistant is back, if it's away now).
      if (option && option !== HELPER_AUTOMATIC) selectHelper(HELPER_AUTOMATIC);
      else if (option === undefined && helper) helperBackDueRef.current = helperOptionFor(settings.modes, currentPin.modeId);
    }
    setShownId(decision.show);
    // Why it's showing, for Home Assistant: only once the wall has changed
    // (a change can wait for a finger to leave the screen).
    if (decision.show === decision.want) {
      const stillPinned = currentPin && !decision.pinExpired;
      setSource(stillPinned ? 'wall' : (command ? 'home_assistant' : automatic.source));
    }
  }, [enabled, settings, setPin, helper, selectHelper, haOn]);

  useEffect(() => {
    evaluate({ force: true });
    if (!enabled) return undefined;
    const timer = setInterval(() => evaluate(), TICK_MS);
    return () => clearInterval(timer);
  }, [enabled, evaluate]);

  // Read Home Assistant's side: the helper, triggers, conditions, people.
  const previousPeopleRef = useRef({});
  useEffect(() => {
    if (!haOn) {
      setHaState(null);
      return undefined;
    }
    // One read at a time; a missed read or two keeps what was read last
    // (utils/haPoll.js), so takeovers and modes don't flip over a blip.
    const onAnswer = (data) => {
      const states = data?.states || {};
      // Alarms that went off.
      const alarmStates = {};
      settings.modes.forEach((mode) => {
        if (mode.alarm && states[mode.alarm.entity]) alarmStates[mode.alarm.entity] = states[mode.alarm.entity];
      });
      const remembered = rememberAlarms(alarmsRef.current, alarmStates, Date.now());
      if (JSON.stringify(remembered) !== JSON.stringify(alarmsRef.current)) {
        alarmsRef.current = remembered;
        writeJson(ALARM_STORAGE_KEY, remembered);
      }
      // The helper's option, and when it changed.
      const option = helper ? states[helper]?.state : undefined;
      const read = readHelper({
        seen: helperSeenRef.current,
        pending: pendingHelperRef.current,
        option,
        readStartedAt: readStartedRef.current,
        now: Date.now(),
      });
      helperSeenRef.current = read.seen;
      pendingHelperRef.current = read.pending;
      if (read.resend && read.pending) sendHelper(read.pending);
      // Someone arriving home wakes the screen.
      const before = previousPeopleRef.current;
      const arrived = settings.ha.wake.some((id) => before[id] === false && isHome(states[id]));
      previousPeopleRef.current = Object.fromEntries(settings.ha.wake.map((id) => [id, isHome(states[id])]));
      if (arrived) wakeDisplay();
      const changed = JSON.stringify(data) !== JSON.stringify(haRef.current);
      if (changed) {
        haRef.current = data;
        setHaState(data);
        evaluate();
      }
    };
    const onDown = () => {
      const down = { connected: true, reachable: false, states: {} };
      if (haRef.current?.reachable !== false) {
        haRef.current = down;
        setHaState(down);
        evaluate();
      }
    };
    return startHaPoll({
      fetch: () => {
        readStartedRef.current = Date.now();
        return axios.get(`${apiDeviceUrl}/modes/ha`, { timeout: 10000 }).then(({ data }) => data);
      },
      onAnswer,
      onDown,
      intervalMs: HA_POLL_MS,
      holding: Boolean(haRef.current) && haRef.current.reachable !== false,
    });
  }, [haOn, apiDeviceUrl, helper, settings, evaluate, sendHelper]);

  // Keep the helper's options in step with the mode names.
  const namesKey = settings.modes.map((mode) => mode.name).join('\u0000');
  useEffect(() => {
    if (!enabled || !helper) return;
    axios.post(`${apiDeviceUrl}/modes/ha/sync`, {})
      .catch((error) => console.warn('Display modes: could not update the helper\'s options:', error?.response?.data?.error || error.message));
  }, [enabled, apiDeviceUrl, helper, namesKey]);

  // Tell Home Assistant which mode is showing.
  const reportKey = `${shownId}|${source}|${Boolean(pin)}`;
  useEffect(() => {
    if (!enabled || !helper || !settings.ha.report) return undefined;
    const send = () => axios.post(`${apiDeviceUrl}/modes/ha/report`, {
      mode: helperOptionFor(settings.modes, shownRef.current),
      source,
      pinned: Boolean(pinRef.current),
    }).catch(() => { /* Home Assistant away: the next one catches up */ });
    void send();
    const timer = setInterval(send, REPORT_EVERY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, apiDeviceUrl, helper, settings.ha.report, reportKey, namesKey]);

  // Pin a mode (or null, Normal) until the schedule next changes.
  // Someone chose it at the screen, so it shows at once, and the helper says so.
  const pinMode = useCallback((modeId) => {
    helperBackDueRef.current = null;
    setPin({
      modeId,
      scheduledAtPin: automaticRef.current.id,
      scheduleAtPin: scheduleOnlyRef.current,
      haAway: haAwayRef.current,
      at: Date.now(),
    });
    setShownId(modeId);
    setSource('wall');
    selectHelper(helperOptionFor(settings.modes, modeId));
  }, [settings.modes, setPin, selectHelper]);

  const unpin = useCallback(() => {
    helperBackDueRef.current = null;
    setPin(null);
    selectHelper(HELPER_AUTOMATIC);
    evaluate({ force: true });
  }, [setPin, selectHelper, evaluate]);

  const shownMode = settings.modes.find((mode) => mode.id === shownId) || null;

  return {
    settings,
    shownMode,
    source,
    scheduledId: automaticRef.current.id,
    pinned: Boolean(pin),
    // What Home Assistant said last (takeovers read it too), or null.
    haStates: haState?.connected && haState.reachable !== false ? haState.states || {} : null,
    pinMode,
    unpin,
    lastActivityRef,
  };
}
