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
// updateDisplayDimming() whenever the resolved appearance changes. Kiosk
// URL query parameters still work as a temporary override on top of the
// settings, so existing kiosk launch URLs keep working during transition:
//   ?dim=0.6        daytime target brightness (0-1)
//   ?dimNight=0.08  night target brightness
//   ?nightStart=0   night window start hour, local time
//   ?nightEnd=6     night window end hour, local time
//   ?dimAfter=20    idle seconds before dimming (0 = always)
// Any dim parameter present also enables dimming for this session, even if
// the settings have it off. Live tuning from devtools: hgSetDim(0.6) sets a
// runtime day level, hgSetDim() clears the runtime override (settings win
// again); unlike the old localStorage build it does not persist.
//
// While dimmed, the page background is forced black (unpainted canvas
// would otherwise show as a bright edge) and scrollbars are hidden
// (Chrome composites them outside the filtered layer, full-brightness).
// Wake detection uses a transparent full-screen shield while dimmed:
// plugin widgets render in iframes whose pointer events never reach this
// document, but the shield sits above them and catches the first tap.

import { DEFAULT_DIMMING, normalizeDimming } from './appearance.js';

// Effective config: the resolved settings, with any URL parameters present
// layered on top. Pure, so it is unit-testable without a DOM.
export function resolveDimmingConfig({ settings, search = '' } = {}) {
  const base = normalizeDimming(settings);
  let params = null;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = null;
  }
  if (!params) return base;
  const has = (name) => params.get(name) !== null;
  if (!has('dim') && !has('dimNight') && !has('dimAfter') && !has('nightStart') && !has('nightEnd')) {
    return base;
  }
  const level = (name) => {
    const v = parseFloat(params.get(name));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
  };
  const hour = (name) => {
    const v = parseInt(params.get(name), 10);
    return Number.isFinite(v) ? Math.min(23, Math.max(0, v)) : undefined;
  };
  const after = params.get('dimAfter');
  const afterValue = after === null ? undefined : parseFloat(after);
  return normalizeDimming({
    ...base,
    enabled: true,
    ...(level('dim') !== undefined ? { day: level('dim') } : {}),
    ...(level('dimNight') !== undefined ? { night: level('dimNight') } : {}),
    ...(Number.isFinite(afterValue) && afterValue >= 0 ? { after: afterValue } : {}),
    ...(hour('nightStart') !== undefined ? { nightStart: hour('nightStart') } : {}),
    ...(hour('nightEnd') !== undefined ? { nightEnd: hour('nightEnd') } : {}),
  });
}

// Pure night-window test: start inclusive, end exclusive; a window whose
// start and end are equal never applies. Wraps past midnight.
export function isNightAt(nightStart, nightEnd, date = new Date()) {
  if (nightStart === nightEnd) return false;
  const h = date.getHours();
  if (nightStart < nightEnd) return h >= nightStart && h < nightEnd;
  return h >= nightStart || h < nightEnd;
}

// The brightness target right now, or null when dimming is off.
export function activeDimTarget(config, now = new Date()) {
  if (!config || !config.enabled) return null;
  return isNightAt(config.nightStart, config.nightEnd, now) ? config.night : config.day;
}

let config = { ...DEFAULT_DIMMING };
let runtimeDay = null;
let dimmed = false;
let lastActivity = Date.now();
let shield = null;
let started = false;
let settingsApplied = false;

function searchString() {
  try {
    return window.location.search;
  } catch {
    return '';
  }
}

// The live target: a devtools runtime level wins for the day target only;
// the night level, window, and delay always come from the config.
function liveTarget(now = new Date()) {
  if (!config.enabled) return null;
  if (isNightAt(config.nightStart, config.nightEnd, now)) return config.night;
  return runtimeDay ?? config.day;
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

// Apply the resolved appearance dimming, live. URL parameters still win
// per-field (see resolveDimmingConfig). Saving in Admin counts as
// activity, so a freshly enabled dimming never fires instantly.
export function updateDisplayDimming(settings) {
  config = resolveDimmingConfig({ settings, search: searchString() });
  settingsApplied = true;
  lastActivity = Date.now();
  if (!started) return;
  if (liveTarget() == null) setDimmed(false);
  else if (config.after === 0) setDimmed(true);
  else setDimmed(false);
}

// Devtools tuning: a runtime day level (null clears it, settings win again).
export function applyDim(v) {
  const parsed = v == null ? null : parseFloat(v);
  runtimeDay = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : null;
  if (started) {
    if (liveTarget() == null) setDimmed(false);
    else if (config.after === 0) setDimmed(true);
    else render();
  }
}

export function initDisplayDim() {
  if (started) return;
  started = true;
  // URL overrides apply immediately at boot, before settings have loaded;
  // updateDisplayDimming() re-resolves with settings once they arrive. If
  // settings already arrived first, keep them instead of re-resolving.
  if (!settingsApplied) config = resolveDimmingConfig({ settings: undefined, search: searchString() });
  ensureStyle();
  ensureShield();
  window.hgSetDim = (v) => applyDim(v == null ? null : v);
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'wheel']) {
    window.addEventListener(ev, poke, { passive: true, capture: true });
  }
  lastActivity = Date.now();
  if (liveTarget() != null && config.after === 0) setDimmed(true);
  window.setInterval(() => {
    if (!dimmed && liveTarget() != null && Date.now() - lastActivity >= config.after * 1000) {
      setDimmed(true);
    } else if (dimmed) {
      // Re-render so a day/night boundary crossing retargets the level.
      render();
    }
  }, 1000);
}
