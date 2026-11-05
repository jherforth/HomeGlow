import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrange, levelRank, stepRules, withAsk } from '../utils/takeovers.js';
import { PLUGIN_ATTENTION_EVENT } from '../components/PluginWidgetWrapper.jsx';
import { wakeDisplay } from '../utils/displayDim.js';
import { playSound, soundUrl } from '../utils/choreSound.js';

const TICK_MS = 1000;
const NONE = { candidates: [], byKey: {} };
const CHIME = 'chime.wav';

/**
 * Runs a display's takeovers (utils/takeovers.js): which rules are on, what
 * the plugins showing asked for (HomeGlow.attention), what was closed with ✕,
 * and where each goes. An urgent one wakes the screen and chimes, once.
 *
 * - rules: the display's takeover rules
 * - haStates: Home Assistant's states for them, or null while it's away
 * - pinned: a mode is pinned on the wall (only urgent ones show)
 * - enabled: false on a phone or before settings load
 *
 * Returns { slots: { full, top, bottom } ({ key, widget, level } or null),
 * showing (a Set of widget names), dismiss(key) }.
 */
export default function useTakeovers({ rules, haStates, pinned, enabled }) {
  const [now, setNow] = useState(() => Date.now());
  const [requests, setRequests] = useState({}); // widget -> { level, size, at }
  const [dismissed, setDismissed] = useState({}); // key -> { since, rank }
  const memoryRef = useRef({});
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const announcedRef = useRef(new Set());

  const active = enabled && rules.some((rule) => rule.enabled);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  // A plugin raising or closing its own takeover.
  useEffect(() => {
    if (!active) return undefined;
    const onAttention = (event) => {
      const { widget, level, size } = event.detail || {};
      if (!rules.some((rule) => rule.enabled && rule.widget === widget)) return;
      // The same ask again (a plugin asking on every update) changes nothing:
      // no new start, no second chime, and a ✕ on it stays closed.
      const at = Date.now();
      if (level !== null && withAsk(requestsRef.current, widget, level, size, at) === requestsRef.current) return;
      setRequests((prev) => withAsk(prev, widget, level, size, at));
      if (level === null) {
        // Closing is the plugin's ✕: hide what's showing for it now.
        setDismissed((prev) => {
          const next = { ...prev };
          rules.filter((rule) => rule.widget === widget).forEach((rule) => {
            const since = memoryRef.current[rule.id]?.since ?? 0;
            next[rule.id] = { since, rank: levelRank('urgent') };
          });
          next[`ask:${widget}`] = { since: 0, rank: levelRank('urgent') };
          return next;
        });
      }
    };
    window.addEventListener(PLUGIN_ATTENTION_EVENT, onAttention);
    return () => window.removeEventListener(PLUGIN_ATTENTION_EVENT, onAttention);
  }, [active, rules]);

  // The once-a-second tick re-checks the rules, but the answer is kept as
  // it was unless something changed, so the dashboard (which rebuilds its
  // widgets when what's showing changes) is left alone between changes.
  const lastRef = useRef(NONE);
  const { candidates, byKey } = useMemo(() => {
    if (!active) { lastRef.current = NONE; return NONE; }
    const step = stepRules(rules, haStates, memoryRef.current, now);
    memoryRef.current = step.memory;
    const list = [];
    const seenWidget = new Set();
    const keyed = {};
    const add = (key, widget, level, place, since) => {
      if (seenWidget.has(widget)) return;
      const hidden = dismissed[key];
      if (hidden && hidden.since === since && levelRank(level) <= hidden.rank) return;
      seenWidget.add(widget);
      const item = { key, widget, level, place, since };
      list.push(item);
      keyed[key] = item;
    };
    // The plugin's ask, layered on its rule: urgent fills the screen unless
    // it asked to keep to its half.
    const askOn = (rule) => {
      const ask = requests[rule.widget];
      const level = ask?.level || rule.level;
      const place = ask?.size === 'full' || (ask?.level === 'urgent' && ask.size !== 'half') ? 'full' : rule.place;
      return { level, place };
    };
    const live = step.live.slice().sort((a, b) => levelRank(askOn(b.rule).level) - levelRank(askOn(a.rule).level));
    for (const { rule, since } of live) {
      const { level, place } = askOn(rule);
      add(rule.id, rule.widget, level, place, since);
    }
    // An urgent ask from a plugin on screen whose rule isn't on (the food hit
    // its target on the Patio tab): it takes over too.
    for (const [widget, ask] of Object.entries(requests)) {
      if (ask.level !== 'urgent' || seenWidget.has(widget)) continue;
      const rule = rules.find((item) => item.enabled && item.widget === widget);
      if (!rule) continue;
      add(`ask:${widget}`, widget, 'urgent', ask.size === 'half' ? rule.place : 'full', ask.at);
    }
    const next = { candidates: list, byKey: keyed };
    if (JSON.stringify(next) === JSON.stringify(lastRef.current)) return lastRef.current;
    lastRef.current = next;
    return next;
  }, [active, rules, haStates, now, requests, dismissed]);

  const placed = useMemo(() => arrange(candidates, { pinned }), [candidates, pinned]);

  const slots = useMemo(() => {
    const pick = (key) => (key ? byKey[key] || null : null);
    return { full: pick(placed.full), top: pick(placed.top), bottom: pick(placed.bottom) };
  }, [placed, byKey]);

  // Urgent: wake the screen and chime, once each time it becomes urgent.
  useEffect(() => {
    for (const item of [slots.full, slots.top, slots.bottom]) {
      if (!item || item.level !== 'urgent') continue;
      const id = `${item.key}:${item.since}`;
      if (announcedRef.current.has(id)) continue;
      announcedRef.current.add(id);
      wakeDisplay();
      playSound(soundUrl(CHIME), 0.7);
    }
  }, [slots]);

  // Requests outlive nothing: once a plugin's rule is off and it isn't
  // urgent on its own, its last ask is forgotten.
  useEffect(() => {
    const liveWidgets = new Set(candidates.map((item) => item.widget));
    setRequests((prev) => {
      const stale = Object.keys(prev).filter((widget) => !liveWidgets.has(widget) && prev[widget].level !== 'urgent');
      if (stale.length === 0) return prev;
      const next = { ...prev };
      stale.forEach((widget) => { delete next[widget]; });
      return next;
    });
  }, [candidates]);

  const dismiss = useCallback((key) => {
    const item = byKey[key];
    if (!item) return;
    // The plugin's ask is kept, so asking the same again stays closed; a
    // new ask (after attention(null), or a higher level) shows again.
    setDismissed((prev) => ({ ...prev, [key]: { since: item.since, rank: levelRank(item.level) } }));
  }, [byKey]);

  const showing = useMemo(
    () => new Set([slots.full, slots.top, slots.bottom].filter(Boolean).map((item) => item.widget)),
    [slots]
  );

  return { slots, showing, dismiss };
}
