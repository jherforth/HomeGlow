import { useEffect, useRef } from 'react';

// Timestamp-based auto-refresh scheduler (issue #75).
//
// Calls `onRefresh` every `intervalMs`, measured against a real timestamp
// instead of a bare setInterval. While `isActive` is false the timer is fully
// stopped — no wakeups, no fetches — but elapsed time still counts: when
// `isActive` flips back to true, an overdue refresh fires immediately once,
// then the normal cadence resumes from that moment.
//
// Pass `intervalMs <= 0` to disable scheduling entirely (e.g. while settings
// are still loading). `fireImmediately` makes the first eligible tick run
// right away instead of waiting a full interval.
export default function useDataRefresh(intervalMs, onRefresh, { isActive = true, fireImmediately = false } = {}) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const lastRefreshedAtRef = useRef(fireImmediately ? 0 : Date.now());

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0 || !isActive) return undefined;

    let timeoutId;
    const schedule = () => {
      const delay = Math.max(0, intervalMs - (Date.now() - lastRefreshedAtRef.current));
      timeoutId = setTimeout(() => {
        lastRefreshedAtRef.current = Date.now();
        onRefreshRef.current();
        schedule();
      }, delay);
    };
    schedule();

    return () => clearTimeout(timeoutId);
  }, [intervalMs, isActive]);
}
