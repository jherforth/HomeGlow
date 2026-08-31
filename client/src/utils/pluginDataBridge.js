// Plugin -> host "I changed core data" channel.
//
// Plugins run in a sandboxed iframe and can write core data through the REST
// API like any other client — completing a chore, spending clams. Nothing in
// the host noticed when they did, so a widget showing that same data kept
// rendering a stale copy until its own refresh timer fired (off by default,
// and five minutes at the shortest).
//
// The plugin posts one message to window.parent; PluginWidgetWrapper validates
// it came from its own iframe and re-broadcasts it as a window event that any
// host widget can subscribe to.
//
// Deliberately NOT routed through the plugin event stream. The server already
// emits chore.completed on that bus and subscribing would be fewer lines, but
// the stream is SSE and does not reach the browser on every deployment — the
// failure that made the issue #140 celebration invisible. Two frames on one
// page need no network at all, so this works wherever the page itself works.
//
// The tradeoff that buys: this refreshes only the display that was tapped.
// A second wall display still waits for its own timer. Fixing that genuinely
// does need the event stream.

/** postMessage `type` a plugin sends to window.parent. */
export const PLUGIN_DATA_MESSAGE_TYPE = 'homeglow:data-changed';

/** Window event the host re-broadcasts it as. */
export const PLUGIN_DATA_CHANGED_EVENT = 'homeglow:plugin-data-changed';

// What a plugin may claim to have changed. Closed set: an unknown scope is
// dropped rather than waking every refetch in the app, so a typo in a plugin
// is inert instead of expensive. Grow it additively as widgets learn to listen.
export const PLUGIN_DATA_SCOPES = Object.freeze([
  'chores',   // chore completions, schedules, clam balances
  'users',    // profiles, avatars
  'calendar', // events and sources
  'prizes',   // prizes and offers
]);

const scopeSet = new Set(PLUGIN_DATA_SCOPES);

export function isKnownPluginDataScope(scope) {
  return typeof scope === 'string' && scopeSet.has(scope);
}

/**
 * Validate a raw postMessage payload. Returns the scope, or null if this is
 * not a well-formed data-changed message.
 *
 * Note this checks the payload only — proving the message came from a real
 * plugin iframe is the wrapper's job, since only it knows which frame is which.
 */
export function readPluginDataMessage(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.type !== PLUGIN_DATA_MESSAGE_TYPE) return null;
  return isKnownPluginDataScope(data.scope) ? data.scope : null;
}

/**
 * Decide whether a received `message` event is a genuine data-changed signal
 * from one specific plugin iframe. Returns the scope, or null.
 *
 * Trust is anchored on the frame, not the payload. Any page can postMessage to
 * the app, and a plugin is untrusted third-party HTML, so the message counts
 * only when it came from the exact contentWindow we handed the plugin and from
 * the origin that window's document was loaded from.
 */
export function acceptPluginDataMessage(event, expectedSource, expectedOrigin) {
  if (!event || !expectedSource) return null;
  if (event.source !== expectedSource) return null;
  if (event.origin !== expectedOrigin) return null;
  return readPluginDataMessage(event.data);
}

/** Broadcast to host widgets that `scope` changed. */
export function emitPluginDataChanged(scope, detail = {}) {
  if (!isKnownPluginDataScope(scope)) return false;
  window.dispatchEvent(new CustomEvent(PLUGIN_DATA_CHANGED_EVENT, {
    detail: { ...detail, scope },
  }));
  return true;
}

/**
 * Subscribe to changes in one scope. Returns an unsubscribe function, so it
 * drops straight into a useEffect.
 */
export function subscribePluginDataChanged(scope, handler) {
  const listener = (event) => {
    if (event.detail?.scope !== scope) return;
    handler(event.detail);
  };
  window.addEventListener(PLUGIN_DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(PLUGIN_DATA_CHANGED_EVENT, listener);
}
