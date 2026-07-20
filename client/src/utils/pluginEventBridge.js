import { API_BASE_URL } from './apiConfig.js';

// Shared SSE bridge for plugin events (issue #105 Phase 3). The whole dashboard
// keeps ONE EventSource open to /api/plugin/v1/events/stream; each mounted
// PluginWidgetWrapper subscribes here and forwards matching events into its
// iframe via postMessage. The connection is opened lazily with the first
// subscriber and closed with the last, so dashboards with no event-subscribing
// plugins never hold a stream open.

let eventSource = null;
let closeTimer = null;
const subscribers = new Set();

// Grace period before an idle EventSource is closed. Tab switches and
// plugin-list refetches momentarily drop the subscriber count to zero; closing
// immediately would churn the connection and lose events emitted during the
// reconnect window (the server bus has no replay).
const CLOSE_DEBOUNCE_MS = 10000;

const ensureEventSource = () => {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
    if (eventSource) return;
    eventSource = new EventSource(`${API_BASE_URL}/api/plugin/v1/events/stream`);
    eventSource.onmessage = (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (!message || typeof message.event !== 'string') return;
        subscribers.forEach((subscriber) => {
            try {
                subscriber(message);
            } catch (error) {
                console.error('Plugin event subscriber failed:', error);
            }
        });
    };
    // EventSource reconnects automatically on transient errors; nothing to do.
};

/**
 * Subscribe to the plugin event stream. Returns an unsubscribe function.
 * @param {(message: { event: string, payload: any, emittedAt: string }) => void} handler
 */
export const subscribePluginEvents = (handler) => {
    subscribers.add(handler);
    ensureEventSource();
    return () => {
        subscribers.delete(handler);
        if (subscribers.size === 0 && eventSource && !closeTimer) {
            closeTimer = setTimeout(() => {
                closeTimer = null;
                if (subscribers.size === 0 && eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
            }, CLOSE_DEBOUNCE_MS);
        }
    };
};
