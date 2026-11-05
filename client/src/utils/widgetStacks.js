// Stacks: one spot on the dashboard holding several widgets, swiped between
// like an iPhone Smart Stack. The rest of the dashboard never moves.
//
// A display's stacks live in its device settings under `widgetStacks`. A stack is placed on a tab like any widget, under the name
// `stack:<id>`. It shows its first widget, goes back to it after a while
// untouched, and can jump to a widget that needs attention ("the Grill card
// while the grill is on", read from Home Assistant).
//
// Pure, for tests; components/StackWidget.jsx draws one.

import { conditionMet } from './haConditions.js';

export const WIDGET_STACKS_KEY = 'widgetStacks';
export const STACK_PREFIX = 'stack:';
// The most widgets one Stack holds.
export const STACK_MAX_WIDGETS = 12;
export const RETURN_CHOICES = [0, 30, 60, 120, 300, 600];
export const ROTATE_CHOICES = [0, 10, 20, 30, 60];
const MODE_ID = /^[A-Za-z0-9_-]{1,40}$/;

const ENTITY_ID = /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/;
const MEMBER = /^(calendar|weather|chores|photos|plugin:[^\s/\\]{1,200})$/;
const ID = /^[a-z0-9]{4,24}$/;

export const isStackName = (name) => typeof name === 'string' && name.startsWith(STACK_PREFIX);
export const stackName = (id) => `${STACK_PREFIX}${id}`;
export const stackIdOf = (name) => (isStackName(name) ? name.slice(STACK_PREFIX.length) : null);
export const newStackId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 16);

function normalizeAttention(raw, members) {
  if (!raw || typeof raw !== 'object') return null;
  if (!members.includes(raw.widget) || !ENTITY_ID.test(raw.entity || '') || typeof raw.state !== 'string' || !raw.state) return null;
  return { widget: raw.widget, entity: raw.entity, op: raw.op === 'is_not' ? 'is_not' : 'is', state: raw.state.slice(0, 100) };
}

const seconds = (value, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : null;
};

// What a Stack does in one mode: each part left out means "as usual".
//   widgets: which of its widgets it holds then (in the Stack's order)
//   first: the one it shows first and goes back to
//   returnSeconds: how long untouched before it goes back
//   noJump: true, no "Bring to front when…" in that mode
//   rotateSeconds: turn to the next widget this often, untouched (0 off)
export function normalizeModeSetting(raw, members) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  if (Array.isArray(raw.widgets)) {
    const keep = members.filter((name) => raw.widgets.includes(name));
    if (keep.length > 0 && keep.length < members.length) out.widgets = keep;
  }
  const shown = out.widgets || members;
  if (typeof raw.first === 'string' && shown.includes(raw.first) && raw.first !== shown[0]) out.first = raw.first;
  const back = raw.returnSeconds == null ? null : seconds(raw.returnSeconds, 3600);
  if (back != null) out.returnSeconds = back;
  if (raw.noJump === true) out.noJump = true;
  const rotate = seconds(raw.rotateSeconds, 3600);
  if (rotate) out.rotateSeconds = Math.max(5, rotate);
  return Object.keys(out).length ? out : null;
}

function normalizeModes(raw, members) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).slice(0, 30).forEach(([id, setting]) => {
    if (!MODE_ID.test(id)) return;
    const clean = normalizeModeSetting(setting, members);
    if (clean) out[id] = clean;
  });
  return out;
}

export function normalizeStack(raw) {
  if (!raw || typeof raw !== 'object' || !ID.test(raw.id || '')) return null;
  const widgets = [...new Set((Array.isArray(raw.widgets) ? raw.widgets : []).filter((w) => typeof w === 'string' && MEMBER.test(w)))].slice(0, STACK_MAX_WIDGETS);
  if (widgets.length === 0) return null;
  const seconds = Number(raw.returnSeconds);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : '',
    widgets,
    returnSeconds: Number.isFinite(seconds) ? Math.min(3600, Math.max(0, Math.round(seconds))) : 60,
    attention: (Array.isArray(raw.attention) ? raw.attention : []).map((rule) => normalizeAttention(rule, widgets)).filter(Boolean).slice(0, 12),
    modes: normalizeModes(raw.modes, widgets),
  };
}

export function normalizeStacks(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  return {
    stacks: (Array.isArray(source.stacks) ? source.stacks : [])
      .map(normalizeStack)
      .filter((stack) => stack && !seen.has(stack.id) && seen.add(stack.id))
      .slice(0, 20),
  };
}

/**
 * A Stack as it is in a mode (modeId null: no mode on): the widgets it
 * holds, the one it shows first, how long before it goes back, its jump
 * rules (none when the mode says no jumping), and how often it turns on its
 * own (0 never).
 */
export function stackInMode(stack, modeId) {
  const setting = (modeId && stack.modes?.[modeId]) || {};
  const widgets = setting.widgets?.length ? stack.widgets.filter((name) => setting.widgets.includes(name)) : stack.widgets;
  const shown = widgets.length ? widgets : stack.widgets;
  return {
    ...stack,
    widgets: shown,
    first: shown.includes(setting.first) ? setting.first : shown[0],
    returnSeconds: setting.returnSeconds ?? stack.returnSeconds,
    attention: setting.noJump ? [] : stack.attention.filter((rule) => shown.includes(rule.widget)),
    rotateSeconds: setting.rotateSeconds || 0,
  };
}

/** A Stack with one mode's setting changed (null: back to as usual). */
export function withModeSetting(stack, modeId, setting) {
  const modes = { ...(stack.modes || {}) };
  const clean = setting ? normalizeModeSetting(setting, stack.widgets) : null;
  if (clean) modes[modeId] = clean;
  else delete modes[modeId];
  return { ...stack, modes };
}

/** The widget a stack should jump to now (first rule met, in stack order), or null. */
export function attentionWidget(stack, states) {
  if (!states) return null;
  const met = new Set(stack.attention.filter((rule) => conditionMet(rule, states)).map((rule) => rule.widget));
  return stack.widgets.find((widget) => met.has(widget)) || null;
}

// A quick, clearly sideways flick: past 60px within 350ms, at least twice as
// far across as up or down. 1 for the next widget, -1 for the previous, or 0.
export const FLICK_MS = 350;
export const FLICK_PX = 60;
export function flickDirection(start, end) {
  if (!start || !end) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (end.t - start.t > FLICK_MS || Math.abs(dx) < FLICK_PX || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * A new stack from dropping `dragged` onto `target` (target first), or
 * `dragged` added to a stack. null when that Stack is full: nothing changes.
 */
export function stackWith(target, dragged, existing = null) {
  if (existing) {
    if (existing.widgets.includes(dragged)) return existing;
    if (existing.widgets.length >= STACK_MAX_WIDGETS) return null;
    return { ...existing, widgets: [...existing.widgets, dragged] };
  }
  return { id: newStackId(), name: '', widgets: [target, dragged], returnSeconds: 60, attention: [], modes: {} };
}
