// Takeovers: a widget that takes over part of the wall when something needs
// you (the grill is on, someone's at the door), then hands it back.
//
// Each display keeps its rules with its modes (device settings,
// displayModes.takeovers): "show <widget> when <entity> is <state>", how
// important it is, where it goes (top half, bottom half, the whole screen)
// and how long it stays. Home Assistant decides when a rule is on; once a
// widget is showing, a plugin can raise it (HomeGlow.attention('urgent'),
// food at target) or close it (HomeGlow.attention(null)).
//
// Two can share the screen, one per half. If both want the same half, the
// less important one takes the other half; one that wants the whole screen
// gets it when it's the most important. While a mode is pinned only urgent
// takeovers show.
//
// Pure, for tests; hooks/useTakeovers.js runs it.

import { conditionMet } from './haConditions.js';

export { conditionMet };

export const LEVELS = ['normal', 'high', 'urgent'];
export const PLACES = ['bottom', 'top', 'full'];
export const OPS = ['is', 'is_not'];
// How long a rule's takeover stays once it starts: 0 = while the rule is on.
export const DURATIONS = [0, 30, 60, 120, 300, 600];

const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
const WIDGET = /^(calendar|weather|chores|photos|plugin:[^\s/\\]{1,200})$/;

export const levelRank = (level) => Math.max(0, LEVELS.indexOf(level));

export function normalizeTakeover(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.widget !== 'string' || !WIDGET.test(raw.widget)) return null;
  if (typeof raw.entity !== 'string' || !ENTITY_ID.test(raw.entity)) return null;
  if (typeof raw.state !== 'string' || !raw.state) return null;
  const seconds = Number(raw.seconds);
  return {
    id: raw.id,
    widget: raw.widget,
    entity: raw.entity,
    op: OPS.includes(raw.op) ? raw.op : 'is',
    state: raw.state.slice(0, 100),
    level: LEVELS.includes(raw.level) ? raw.level : 'high',
    place: PLACES.includes(raw.place) ? raw.place : 'bottom',
    seconds: Number.isFinite(seconds) ? Math.min(3600, Math.max(0, Math.round(seconds))) : 0,
    enabled: raw.enabled !== false,
  };
}

export function normalizeTakeovers(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeTakeover)
    .filter((rule) => rule && !seen.has(rule.id) && seen.add(rule.id))
    .slice(0, 30);
}

export function newTakeoverId() {
  return `takeover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}


/**
 * Follow each rule over time: when its condition turns on it starts (and any
 * ✕ from before is forgotten); a rule with a duration ends that long after.
 * `memory` is { [ruleId]: { since, on } }; returns the next memory and the
 * rules showing now: [{ rule, since }].
 * `states` null is Home Assistant away: nothing shows, and nothing is
 * forgotten, so a rule still on when it's back carries on as before (no new
 * start, no second chime, a ✕ still holds).
 */
export function stepRules(rules, states, memory, nowMs) {
  if (states == null) return { memory: memory || {}, live: [] };
  const next = {};
  const live = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const met = conditionMet(rule, states);
    const before = memory?.[rule.id];
    if (!met) continue;
    const since = before?.on ? before.since : nowMs;
    next[rule.id] = { since, on: true };
    if (rule.seconds > 0 && nowMs - since >= rule.seconds * 1000) continue;
    live.push({ rule, since });
  }
  return { memory: next, live };
}

/**
 * A plugin's ask (HomeGlow.attention(level, { size })) on top of what it
 * asked before. `requests` is { [widget]: { level, size, at } }. Asking the
 * same again returns `requests` itself: no new start, so no second chime,
 * and a ✕ on it holds. A new level starts again; a new size alone doesn't.
 * level null drops the ask.
 */
export function withAsk(requests, widget, level, size, nowMs) {
  const was = requests[widget];
  if (level === null) {
    if (!was) return requests;
    const { [widget]: _gone, ...rest } = requests;
    return rest;
  }
  if (was && was.level === level && was.size === size) return requests;
  return { ...requests, [widget]: { level, size, at: was && was.level === level ? was.at : nowMs } };
}

/**
 * Who goes where. `candidates` is [{ key, level, place, since }], already
 * leaving out anything dismissed. Most important first (then the earliest):
 * one wanting the whole screen gets it if it's first; otherwise each takes the
 * half it asked for, or the other half if that's taken; the rest wait.
 * While `pinned`, only urgent ones show. Returns { full, top, bottom } (keys
 * or null) and `waiting` (keys).
 */
export function arrange(candidates, { pinned = false } = {}) {
  const list = candidates
    .filter((item) => !pinned || item.level === 'urgent')
    .slice()
    .sort((a, b) => levelRank(b.level) - levelRank(a.level) || a.since - b.since);
  const out = { full: null, top: null, bottom: null, waiting: [] };
  if (list.length && list[0].place === 'full') {
    out.full = list[0].key;
    out.waiting = list.slice(1).map((item) => item.key);
    return out;
  }
  for (const item of list) {
    const wants = item.place === 'full' ? 'bottom' : item.place;
    const other = wants === 'top' ? 'bottom' : 'top';
    if (!out[wants]) out[wants] = item.key;
    else if (!out[other]) out[other] = item.key;
    else out.waiting.push(item.key);
  }
  return out;
}
