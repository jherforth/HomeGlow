import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';
import { subscribePluginEvents } from './pluginEventBridge.js';

// Keeping every display in step (issue #325). The server keeps a revision
// counter for each kind of household data (server/utils/householdChanges.js)
// and moves it on every write. This page learns the counters two ways, and
// tells whoever subscribed which kinds moved, so they reload them:
//
//   - GET /api/changes, a few bytes and 304 when nothing changed. A display
//     checks every 15 seconds while it's visible, and right away when it
//     becomes visible again. A phone checks only when it becomes visible:
//     it's opened, glanced at and put away, so a timer would mostly spend
//     its battery while nobody looks.
//   - The event stream, where it reaches the browser: the same counters
//     arrive within a second of the write. Where it doesn't (some proxies
//     and tunnels), the check above still catches up.
//
// Coarse on purpose: a subscriber learns that a kind of data changed, never
// what, and reloads all of it. No write can be missed by a widget asking
// the wrong question.

export const HOUSEHOLD_DOMAINS = Object.freeze(['chores', 'users', 'prizes', 'settings', 'calendar']);
export const CHECK_INTERVAL_MS = 15 * 1000;

/** The kinds whose counters differ between two snapshots; none before the first. Pure. */
export function changedDomains(known, next) {
  if (!known || !next) return [];
  return HOUSEHOLD_DOMAINS.filter((domain) => next[domain] !== undefined && next[domain] !== known[domain]);
}

const subscribers = new Set();
let known = null;
let etag = null;
let mode = 'interval';
let running = false;
let checking = false;
let timer = null;
let stopEvents = null;

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function apply(next) {
  if (!next || typeof next !== 'object') return;
  if (!known) {
    known = { ...next };
    return;
  }
  const moved = changedDomains(known, next);
  if (!moved.length) return;
  known = { ...known, ...next };
  for (const { domains, handler } of subscribers) {
    const theirs = moved.filter((domain) => domains.has(domain));
    if (!theirs.length) continue;
    try {
      handler(theirs);
    } catch (error) {
      console.error('Household change subscriber failed:', error);
    }
  }
}

/** Ask the server now. Resolves when the answer has been applied. */
export async function checkHouseholdChanges() {
  if (checking) return;
  checking = true;
  try {
    const response = await axios.get(`${API_BASE_URL}/api/changes`, {
      headers: etag ? { 'If-None-Match': etag } : {},
      validateStatus: (status) => status === 200 || status === 304,
    });
    if (response.status === 200) {
      etag = response.headers?.etag || null;
      apply(response.data);
    }
  } catch {
    // Offline or restarting: the next check, or the next visibility, retries.
  } finally {
    checking = false;
  }
}

function onVisibilityChange() {
  if (isVisible()) void checkHouseholdChanges();
}

function startTimer() {
  clearInterval(timer);
  timer = null;
  if (mode !== 'interval') return;
  timer = setInterval(() => {
    if (isVisible()) void checkHouseholdChanges();
  }, CHECK_INTERVAL_MS);
}

function start() {
  if (running) return;
  running = true;
  void checkHouseholdChanges();
  startTimer();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  // The fast path. Without EventSource (tests, very old browsers) the
  // checks alone keep up.
  if (typeof EventSource !== 'undefined') {
    stopEvents = subscribePluginEvents((message) => {
      if (message?.event === 'household.changed') apply(message.payload?.revisions);
    });
  }
}

function stop() {
  if (!running) return;
  running = false;
  clearInterval(timer);
  timer = null;
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
  stopEvents?.();
  stopEvents = null;
}

/**
 * 'interval' (a wall display, a desktop): every 15 seconds while visible.
 * 'visible' (a phone): only when it becomes visible.
 */
export function setHouseholdChangesMode(next) {
  if (next !== 'interval' && next !== 'visible') return;
  if (next === mode) return;
  mode = next;
  if (running) startTimer();
}

/**
 * Call `handler(movedDomains)` whenever any of `domains` changes on the
 * server. Returns an unsubscribe function, so it drops into a useEffect.
 * The checks run while anything is subscribed.
 */
export function subscribeHouseholdChanges(domains, handler) {
  const entry = { domains: new Set(domains), handler };
  subscribers.add(entry);
  start();
  return () => {
    subscribers.delete(entry);
    if (!subscribers.size) stop();
  };
}

/** The counters this page last saw, or null before the first answer. */
export const knownHouseholdRevisions = () => (known ? { ...known } : null);

/** Tests only: forget everything. */
export function resetHouseholdChangesForTests() {
  stop();
  subscribers.clear();
  known = null;
  etag = null;
  mode = 'interval';
  checking = false;
}
