// The dock Refresh button: sync calendars from Google, then reload the
// page. A plain reload only re-reads the locally cached calendar events,
// which the server refreshes from Google on its per-source sync interval —
// so events changed since the last sync never appear no matter how often
// the page is reloaded. The reload always happens, even when the sync fails
// or takes too long: the button must never hang the wall display.
//
// Extracted from app.jsx so the never-hangs behavior is testable without
// rendering the whole dashboard.

export const CALENDAR_SYNC_TIMEOUT_MS = 15000;

export async function syncCalendarsThenReload({
  post,
  apiBaseUrl,
  reload,
  timeoutMs = CALENDAR_SYNC_TIMEOUT_MS,
}) {
  try {
    await post(`${apiBaseUrl}/api/calendar-sync/all`, {}, { timeout: timeoutMs });
  } catch (error) {
    console.error('Error syncing calendar sources before refresh:', error);
  }
  reload();
}
