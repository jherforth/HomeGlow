// Mobile dashboard widget ordering (issue #118).
//
// On phones the kiosk's 12-column grid is replaced by a single vertical
// stack. This pure helper decides what appears in that stack and in what
// order; grid metadata (x/y/w/h, saved layouts) is intentionally ignored.
//
// Rules (from docs/architecture/mobile-experience.md):
// - Fixed order: chores → calendar → weather → plugins ("quick access to
//   chores" = chores always first). Plugins keep their relative order.
// - Photos are excluded on mobile even if enabled for the device — the photo
//   widget is a kiosk ambient feature.

const MOBILE_ORDER_RANK = {
    'chores-widget': 0,
    'calendar-widget': 1,
    'weather-widget': 2,
};

const PLUGIN_RANK = 3;
const UNKNOWN_RANK = 4;

const rankOf = (widget) => {
    if (Object.prototype.hasOwnProperty.call(MOBILE_ORDER_RANK, widget.id)) {
        return MOBILE_ORDER_RANK[widget.id];
    }
    if (typeof widget.id === 'string' && widget.id.startsWith('plugin-')) {
        return PLUGIN_RANK;
    }
    return UNKNOWN_RANK;
};

/**
 * Filter + order the kiosk widget list for the mobile stack.
 * Accepts the entries produced by app.jsx's `widgets` useMemo (only `id` is
 * inspected); returns a new array, input untouched.
 */
export const buildMobileWidgetList = (widgets) => {
    if (!Array.isArray(widgets)) return [];

    return widgets
        .filter((widget) => widget && widget.id !== 'photos-widget')
        .map((widget, index) => ({ widget, index }))
        .sort((a, b) => (rankOf(a.widget) - rankOf(b.widget)) || (a.index - b.index))
        .map(({ widget }) => widget);
};

/** True for widgets that need an explicit card height in the stack (they
 * size to their container rather than their content). */
export const needsFixedMobileHeight = (widget) =>
    widget.id === 'calendar-widget' || (typeof widget.id === 'string' && widget.id.startsWith('plugin-'));
