// Plugin event bus (issue #105 Phase 3, capability b — Model B delivery).
//
// Core mutation routes call emit() after their DB write succeeds; SSE
// connections (and, in Phase 4, the declarative-reaction executor) subscribe.
// This is a deliberately tiny in-process bus — no persistence, no replay:
// events are ephemeral UI signals, and durable state belongs in plugin storage.

// The catalog is the versioned contract: manifests may only declare events
// listed here (validated at install time), so a typo'd subscription fails
// loudly instead of never firing. Grow it additively.
const PLUGIN_EVENT_CATALOG = Object.freeze([
    'clam.deposited',    // { userId, amount, newTotal }
    'clam.withdrawn',    // { userId, amount, newTotal }
    'chore.completed',   // { userId, choreId, scheduleId, clamValue, date }
    'chore.uncompleted', // { userId, choreId, scheduleId, clamValue, date } — mirror of chore.completed
]);

const catalogSet = new Set(PLUGIN_EVENT_CATALOG);
const subscribers = new Set();

/**
 * Broadcast an event to all subscribers. Never throws — a bad subscriber or
 * unknown event name must not break the core mutation that emitted it.
 */
function emit(event, payload) {
    if (!catalogSet.has(event)) {
        console.warn(`pluginEvents: refusing to emit unknown event "${event}" (not in catalog)`);
        return;
    }
    const message = { event, payload, emittedAt: new Date().toISOString() };
    for (const subscriber of subscribers) {
        try {
            subscriber(message);
        } catch (error) {
            console.error(`pluginEvents: subscriber failed for ${event}:`, error);
        }
    }
}

/** Register a subscriber; returns an unsubscribe function. */
function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
}

function isKnownEvent(event) {
    return catalogSet.has(event);
}

module.exports = { PLUGIN_EVENT_CATALOG, emit, subscribe, isKnownEvent };
