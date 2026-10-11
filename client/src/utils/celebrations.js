// One celebration for the whole board.
//
// Finishing every chore for the day sets off the theme's confetti (issue
// #140), and a plugin can ask for the same moment: Routines when a child ticks
// off a list. Both go through one host (components/CelebrationHost.jsx), so
// the two never pile up when one action triggers both.
//
// Nothing interrupts a celebration that is playing: a second request then
// (Routines finishing the day's last chore, so both it and the chore widget
// ask) joins the one on screen. A plugin also gets one per SOURCE_GAP_MS, so
// a plugin that asks in a loop cannot keep the board covered; the chore widget
// has no gap, since it celebrates each person once a day.

/** Window event a host widget fires to ask for a celebration. */
export const CELEBRATE_EVENT = 'homeglow:celebrate';

/** postMessage `type` a plugin sends to window.parent (HomeGlow.celebrate()). */
export const PLUGIN_CELEBRATE_MESSAGE_TYPE = 'homeglow:celebrate';

export const SOURCE_GAP_MS = 15000;

/** Ask for a celebration. `source` is 'chores' or `plugin:<filename>`. */
export function requestCelebration(source) {
  window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT, { detail: { source } }));
}

const isTrusted = (source) => source === 'chores';

/**
 * Decides which requests play. `admit(source)` says whether this one may;
 * `finished()` is called when a celebration has run its course.
 */
export function createCelebrationGate({ gapMs = SOURCE_GAP_MS, now = Date.now } = {}) {
  const lastBySource = new Map();
  let playing = false;
  return {
    admit(source) {
      if (typeof source !== 'string' || !source || playing) return false;
      if (!isTrusted(source)) {
        const last = lastBySource.get(source);
        if (last !== undefined && now() - last < gapMs) return false;
        lastBySource.set(source, now());
      }
      playing = true;
      return true;
    },
    finished() {
      playing = false;
    },
  };
}

/**
 * Whether a received `message` event is a celebrate request from one specific
 * plugin iframe. Trust is anchored on the frame, as for data-changed
 * (pluginDataBridge.js): the exact contentWindow and the origin it loaded from.
 */
export function acceptPluginCelebrateMessage(event, expectedSource, expectedOrigin) {
  if (!event || !expectedSource) return false;
  if (event.source !== expectedSource || event.origin !== expectedOrigin) return false;
  return !!event.data && typeof event.data === 'object' && event.data.type === PLUGIN_CELEBRATE_MESSAGE_TYPE;
}
