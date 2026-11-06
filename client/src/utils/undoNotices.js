// The notices at the top of the dashboard (components/WidgetRemoveUndo.jsx):
// one plain message ("Moved", "That didn't work") and the Undos still
// waiting. A plain message shows first; when it goes, the newest Undo comes
// back with its full time. So "already on that tab" or a second removal never
// silently throws away the Undo for the widget removed a moment ago.
//
// Each shown notice has its own `key`, so the notice's timer starts over
// whenever a different one comes up.

const MAX_UNDOS = 5;
let lastKey = 0;
const nextKey = () => {
  lastKey += 1;
  return lastKey;
};

export const emptyNotices = { message: null, undos: [] };

/** Show a plain message (null clears it). Undos waiting stay waiting. */
export const showMessage = (state, message) => ({
  ...state,
  message: message ? { key: nextKey(), message } : null,
});

/** A notice with an Undo ({ message, undo }), newest on top. */
export const pushUndo = (state, notice) => ({
  ...state,
  undos: [...state.undos, { message: notice.message, undo: notice.undo, key: nextKey() }].slice(-MAX_UNDOS),
});

/** What shows now: the plain message, else the newest Undo, else null. */
export const shownNotice = (state) => state.message || state.undos[state.undos.length - 1] || null;

/** That notice is done (timed out, closed or used). */
export const dropNotice = (state, key) => (state.message?.key === key
  ? { ...state, message: null }
  : { ...state, undos: state.undos.filter((item) => item.key !== key) });
