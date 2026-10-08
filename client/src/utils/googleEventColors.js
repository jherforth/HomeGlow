// Google Calendar's eleven per-event colors (issue #244), in the order Google's
// own picker lists them. `id` is what Google stores as the event's colorId;
// `hex` is the color Google's UI shows, and the one the server resolves a
// synced colorId to (EVENT_COLORS in server/services/googleCalendar.js), so a
// swatch picked here is the color the event then wears on the dashboard.
// `key` names the translated label (calendar:event.colors.<key>).
export const GOOGLE_EVENT_COLORS = [
  { id: '11', key: 'tomato', hex: '#d50000' },
  { id: '4', key: 'flamingo', hex: '#e67c73' },
  { id: '6', key: 'tangerine', hex: '#f4511e' },
  { id: '5', key: 'banana', hex: '#f6bf26' },
  { id: '2', key: 'sage', hex: '#33b679' },
  { id: '10', key: 'basil', hex: '#0b8043' },
  { id: '7', key: 'peacock', hex: '#039be5' },
  { id: '9', key: 'blueberry', hex: '#3f51b5' },
  { id: '1', key: 'lavender', hex: '#7986cb' },
  { id: '3', key: 'grape', hex: '#8e24aa' },
  { id: '8', key: 'graphite', hex: '#616161' },
];

/**
 * The `color_id` to send with a saved event, or undefined to send none.
 * A new event sends its color only if one was picked. An edit sends it only
 * when it changed ('' back to null, the calendar's color): an edit that leaves
 * it alone must not touch it, since the event may wear a custom Google label
 * that the picker cannot show.
 */
export const eventColorToSend = (mode, picked, original) => {
  if (mode === 'create') return picked || undefined;
  if (picked === (original || '')) return undefined;
  return picked || null;
};
