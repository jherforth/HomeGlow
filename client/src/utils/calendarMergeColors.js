// Merged-calendar pie dot (issue #125).
//
// When cross-calendar dedup merges an event, the surviving event carries
// `merged_from: [{ source_id, source_name, source_color }]`. The bullet dot at
// the top of the event bubble becomes a pie of the calendars' colors — the
// winning calendar first, then each merged one — capped at four wedges, which
// covers any realistic household. The text bubble keeps the winning calendar's
// color; the dot alone tells the "how many calendars have this" story.

export const MAX_MERGED_DOT_COLORS = 4;

/**
 * Ordered wedge colors for an event's dot: winner first, then merged sources,
 * capped at MAX_MERGED_DOT_COLORS. `fallbackColor` fills any missing color.
 */
export const buildMergedDotColors = (event, fallbackColor) => {
    const winner = event?.source_color || fallbackColor;
    const merged = Array.isArray(event?.merged_from) ? event.merged_from : [];
    return [winner, ...merged.map((m) => m?.source_color || fallbackColor)]
        .slice(0, MAX_MERGED_DOT_COLORS);
};

/**
 * CSS background for the dot. One color → plain color; several → an equal-wedge
 * conic-gradient pie.
 */
export const buildMergedDotBackground = (colors) => {
    if (!Array.isArray(colors) || colors.length === 0) return 'transparent';
    if (colors.length === 1) return colors[0];

    const wedge = 360 / colors.length;
    const stops = colors
        .map((color, index) => `${color} ${index * wedge}deg ${(index + 1) * wedge}deg`)
        .join(', ');
    return `conic-gradient(${stops})`;
};

/** Human summary for the tooltip: "On 3 calendars: Family, Mom, Dad". */
export const describeMergedCalendars = (event) => {
    const merged = Array.isArray(event?.merged_from) ? event.merged_from : [];
    if (merged.length === 0) return null;
    const names = [event?.source_name, ...merged.map((m) => m?.source_name)]
        .filter(Boolean);
    return `On ${merged.length + 1} calendars: ${names.join(', ')}`;
};
