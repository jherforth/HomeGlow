import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

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
    let stopped = false;
    const read = async () => {
      try {
        const { data } = await axios.get(`${apiDeviceUrl}/stacks/ha`);
        if (stopped) return;
        const next = data?.connected && data.reachable !== false ? data.states || {} : null;
        const text = JSON.stringify(next);
        if (text !== lastRef.current) {
          lastRef.current = text;
          setStates(next);
        }
      } catch {
        if (!stopped && lastRef.current !== 'null') {
          lastRef.current = 'null';
          setStates(null);
        }
      }
    };
    void read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [apiDeviceUrl, key]);

  return states;
}
