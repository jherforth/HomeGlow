import { useEffect, useState } from 'react';

// True while the browser tab is visible (Page Visibility API). This is the
// closest a web app can get to "the screen is on" — it fires for tab/window
// backgrounding and mobile app switching, but cannot see external power
// mechanisms (HDMI-CEC, DPMS, smart relays).
export function usePageVisibility() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    const handleChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return visible;
}

// Combines page visibility with any number of named app-level signals into a
// single "someone could plausibly be looking at this content" boolean.
// All signals must be truthy for the screen to count as active.
//
// Signals today: page visibility (built in) plus whatever the caller passes
// (e.g. "the photos-mode screensaver is not covering the widgets"). Future
// sources — like a Home Assistant presence or display-power entity (issue
// #57) — just become one more entry in `signals`; no consumer changes needed.
export default function useScreenActivity(signals = {}) {
  const pageVisible = usePageVisibility();
  return pageVisible && Object.values(signals).every(Boolean);
}
