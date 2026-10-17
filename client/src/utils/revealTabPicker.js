// When Save is refused because an enabled widget or plugin has no tab, the
// message sits at the top of Admin, often off screen on a phone. This brings
// the first such tab picker into view and puts the cursor in it.
//
// Each picker carries data-tab-picker="<widget name>" ('chores',
// 'plugin:chore-metrics.html').

// A quoted attribute value only needs its quotes and backslashes escaped.
const quoted = (value) => `"${String(value).replace(/["\\]/g, '\\$&')}"`;

/** Scroll to the first named picker found and focus its input. False when none is on the page. */
export function revealTabPicker(widgetNames, doc = document) {
  for (const name of widgetNames || []) {
    const picker = doc.querySelector(`[data-tab-picker=${quoted(name)}]`);
    if (!picker) continue;
    picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    picker.querySelector('input')?.focus({ preventScroll: true });
    return true;
  }
  return false;
}
