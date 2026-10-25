// Kiosk display dimming for wall panels whose backlight floor is still too
// bright: dims the rendered pixels themselves with a CSS brightness filter,
// so the screen can go darker than the hardware allows. The video signal
// stays live (a dim-but-live image does not trip the panel's no-signal
// power save) and Chrome does the compositing internally.
//
// Behavior mirrors a screensaver overlay: full brightness while the panel
// is being used, fading to the target level after an idle delay, and back
// to full brightness on the next interaction. Two target levels are
// supported on a schedule: a milder daytime level and a much darker
// night level (default window 00:00-06:00).
//
// Configuration lives in the appearance settings (household default plus
// per-display override, see utils/appearance.js) and is applied live by
// updateDisplayDimming() whenever the resolved appearance changes. The
// night window is read in the household timezone (passed in by app.jsx),
// not the device's own clock, so a display set to another zone still dims
// on the household's night.
//
// While dimmed, the page background is forced black (unpainted canvas
// would otherwise show as a bright edge) and scrollbars are hidden
// (Chrome composites them outside the filtered layer, full-brightness).
// Wake detection uses a transparent full-screen shield while dimmed:
// plugin widgets render in iframes whose pointer events never reach this
// document, but the shield sits above them and catches the first tap.
// Activity inside a plugin frame while NOT dimmed reaches the parent as a
// `homeglow:activity` postMessage (see server/utils/pluginFrameTouch.js),
// so using a plugin counts as use and holds the dim off.
//
// Dimming pauses while the Admin Panel is open (app.jsx calls
// setDimmingPaused): Admin must stay readable, and saving settings there
// counts as activity, so the timer restarts from Admin closing.

import { DEFAULT_DIMMING, normalizeDimming } from './appearance.js';

// The hour of `date` in `timeZone` (0-23), or the device's own hour when no
// zone is given or the zone is not one Intl knows. Pure, for tests.
export function hourInZone(date, timeZone) {
  if (!timeZone) return date.getHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour');
    const h = hour ? parseInt(hour.value, 10) : NaN;
    return Number.isFinite(h) ? h % 24 : date.getHours();
  } catch {
    return date.getHours();
  }
}

// Pure night-window test: start inclusive, end exclusive; a window whose
// start and end are equal never applies. Wraps past midnight. The hour is
// read in `timeZone` when given (the household zone), else local time.
export function isNightAt(nightStart, nightEnd, date = new Date(), timeZone) {
  if (nightStart === nightEnd) return false;
  const h = hourInZone(date, timeZone);
  if (nightStart < nightEnd) return h >= nightStart && h < nightEnd;
  return h >= nightStart || h < nightEnd;
}

// The brightness target right now, or null when dimming is off.
export function activeDimTarget(config, now = new Date(), timeZone) {
  if (!config || !config.enabled) return null;
  return isNightAt(config.nightStart, config.nightEnd, now, timeZone) ? config.night : config.day;
}

let config = { ...DEFAULT_DIMMING };
let timeZone;
let dimmed = false;
let lastActivity = Date.now();
let shield = null;
let started = false;
let adminPaused = false;

// The live target: the night level inside the household night window, else
// the day level.
function liveTarget(now = new Date()) {
  if (!config.enabled) return null;
  if (isNightAt(config.nightStart, config.nightEnd, now, timeZone)) return config.night;
  return config.day;
}

function render() {
  const el = document.documentElement;
  const t = liveTarget();
  el.style.transition = 'filter 0.6s ease';
  // Scrollbars are composited by Chrome outside the filtered layer and
  // would stay full-brightness (a white strip at the edge); hide them
  // while dimmed via the hg-dimmed class styled in ensureStyle().
  el.classList.toggle('hg-dimmed', dimmed && t != null);
  if (shield) shield.style.display = dimmed && t != null ? 'block' : 'none';
  if (dimmed && t != null) {
    el.style.filter = `brightness(${t})`;
    el.style.backgroundColor = '#000';
    if (document.body) document.body.style.backgroundColor = '#000';
  } else {
    el.style.filter = '';
    el.style.backgroundColor = '';
    if (document.body) document.body.style.backgroundColor = '';
  }
}

function ensureStyle() {
  if (document.getElementById('hg-dim-style')) return;
  const style = document.createElement('style');
  style.id = 'hg-dim-style';
  style.textContent =
    'html.hg-dimmed, html.hg-dimmed * { scrollbar-width: none !important; }' +
    'html.hg-dimmed::-webkit-scrollbar, html.hg-dimmed *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
  document.head.appendChild(style);
}

// Plugin widgets render in iframes, whose pointer events never reach this
// document — a wake listener here is blind to taps/scrolls inside plugins.
// While dimmed, a transparent shield above everything (iframes included)
// catches the first interaction anywhere and wakes the panel; the wake
// gesture is consumed, like a screensaver dismiss.
function ensureShield() {
  if (shield) return;
  shield = document.createElement('div');
  shield.id = 'hg-dim-shield';
  shield.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:transparent;display:none;touch-action:none;';
  for (const ev of ['pointerdown', 'touchstart', 'wheel']) {
    shield.addEventListener(ev, poke, { passive: true });
  }
  document.body.appendChild(shield);
}

function setDimmed(next) {
  if (dimmed === next) return;
  dimmed = next;
  render();
}

function poke() {
  lastActivity = Date.now();
  if (dimmed) setDimmed(false);
}

// A plugin frame reporting use (see server/utils/pluginFrameTouch.js).
// The message carries nothing sensitive, and plugins are household
// installed, so the type alone is enough to count it as activity.
function onPluginActivity(event) {
  if (event?.data?.type === 'homeglow:activity') poke();
}

// Apply the resolved appearance dimming, live. `timeZone` is the household
// zone for the night window; once set it sticks until a new one arrives.
// Saving in Admin counts as activity, so a freshly enabled dimming never
// fires instantly.
export function updateDisplayDimming(settings, zone) {
  config = normalizeDimming(settings);
  if (zone !== undefined) timeZone = zone;
  lastActivity = Date.now();
  if (!started) return;
  if (liveTarget() == null) setDimmed(false);
  else if (config.after === 0) setDimmed(true);
  else setDimmed(false);
}

// Pause the idle timer while the Admin Panel is open: Admin must stay
// readable. If dimming somehow fired already, opening Admin undims at
// once; closing restarts the idle clock from zero, so dimming resumes
// only after a full idle delay.
export function setDimmingPaused(paused) {
  adminPaused = paused;
  if (paused) {
    if (dimmed) setDimmed(false);
  } else {
    lastActivity = Date.now();
  }
}

export function initDisplayDim() {
  if (started) return;
  started = true;
  ensureStyle();
  ensureShield();
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'wheel']) {
    window.addEventListener(ev, poke, { passive: true, capture: true });
  }
  window.addEventListener('message', onPluginActivity);
  lastActivity = Date.now();
  if (liveTarget() != null && config.after === 0) setDimmed(true);
  window.setInterval(() => {
    if (adminPaused) return;
    if (!dimmed && liveTarget() != null && Date.now() - lastActivity >= config.after * 1000) {
      setDimmed(true);
    } else if (dimmed) {
      // Re-render so a day/night boundary crossing retargets the level.
      render();
    }
  }, 1000);
}
