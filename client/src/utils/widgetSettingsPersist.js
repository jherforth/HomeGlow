// A widget loads its per-device settings, then saves them when the user changes
// one. Deciding *whether* to save is the whole problem: an effect that fires on
// "the load finished" cannot tell a real edit from the load itself, so it writes
// back what it just read on every mount.
//
// Two rules, and the second is the one that loses data:
//
//   1. Persist only when the values differ from the ones that were loaded.
//   2. Never persist when the load did not succeed. A failed GET leaves the
//      component holding its own defaults; writing those back replaces the
//      user's stored settings with defaults.
//
// Callers keep the loaded values in a ref — `null` until a load succeeds — and
// update it after each successful write.

// Stable-key JSON comparison. Settings values are JSON round-tripped through the
// API, so they are plain objects, arrays, and primitives; there are no Dates,
// Maps, or cycles to defeat this.
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

export function settingsEqual(a, b) {
  return stable(a) === stable(b);
}

// `loaded` is the snapshot taken when the settings were last known to agree with
// the server — or null/undefined if they never did.
export function shouldPersistSettings(loaded, current) {
  if (loaded === null || loaded === undefined) return false;
  return !settingsEqual(loaded, current);
}
