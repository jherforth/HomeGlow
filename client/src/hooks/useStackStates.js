import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { startHaPoll } from '../utils/haPoll.js';

// How often a display rereads what its Stacks watch in Home Assistant.
const POLL_MS = 3 * 1000;

/**
 * The Home Assistant states this display's Stacks read for "Bring to front
 * when…" (utils/widgetStacks.js), from GET /stacks/ha. Only while a Stack
 * has such a rule. { [entity_id]: { state, attributes } }, or null when Home
 * Assistant isn't connected or can't be reached.
 */
export default function useStackStates({ apiDeviceUrl, stacks, enabled = true }) {
  const watching = enabled && stacks.some((stack) => stack.attention.length > 0);
  // A new rule should be read now, not on the next tick.
  const key = watching ? stacks.flatMap((stack) => stack.attention.map((rule) => rule.entity)).sort().join(',') : '';
  const [states, setStates] = useState(null);
  const lastRef = useRef('');

  useEffect(() => {
    if (!key) {
      setStates(null);
      lastRef.current = '';
      return undefined;
    }
    const show = (next) => {
      const text = JSON.stringify(next);
      if (text !== lastRef.current) {
        lastRef.current = text;
        setStates(next);
      }
    };
    // One read at a time; a missed read or two keeps what was read last
    // (utils/haPoll.js), so a Stack doesn't jump back and forth over a blip.
    return startHaPoll({
      fetch: () => axios.get(`${apiDeviceUrl}/stacks/ha`, { timeout: 10000 }).then(({ data }) => data),
      onAnswer: (data) => show(data?.connected ? data.states || {} : null),
      onDown: () => show(null),
      intervalMs: POLL_MS,
      holding: lastRef.current !== '' && lastRef.current !== 'null',
    });
  }, [apiDeviceUrl, key]);

  return states;
}
