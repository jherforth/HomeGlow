import { describe, expect, it } from 'vitest';
import { dropNotice, emptyNotices, pushUndo, showMessage, shownNotice } from './undoNotices.js';

const removed = (name) => ({ message: `Removed ${name}`, undo: { name } });

describe('undo notices', () => {
  it('a plain message shows over an Undo, which comes back after it', () => {
    let state = pushUndo(emptyNotices, removed('weather'));
    const undoKey = shownNotice(state).key;
    state = showMessage(state, 'Already on Kitchen');
    expect(shownNotice(state).message).toBe('Already on Kitchen');
    expect(shownNotice(state).undo).toBeUndefined();
    state = dropNotice(state, shownNotice(state).key);
    expect(shownNotice(state).undo).toEqual({ name: 'weather' });
    expect(shownNotice(state).key).toBe(undoKey);
  });

  it('a second removal shows its own Undo; the first returns when that one is done', () => {
    let state = pushUndo(emptyNotices, removed('weather'));
    state = pushUndo(state, removed('calendar'));
    expect(shownNotice(state).undo.name).toBe('calendar');
    state = dropNotice(state, shownNotice(state).key);
    expect(shownNotice(state).undo.name).toBe('weather');
    state = dropNotice(state, shownNotice(state).key);
    expect(shownNotice(state)).toBeNull();
  });

  it('a notice that comes back gets a new key, so its time starts over', () => {
    let state = pushUndo(emptyNotices, removed('weather'));
    const first = shownNotice(state);
    state = dropNotice(state, first.key);
    state = pushUndo(state, first);
    expect(shownNotice(state).key).not.toBe(first.key);
    expect(shownNotice(state).undo).toEqual(first.undo);
  });

  it('closing a message leaves Undos alone, and clearing works', () => {
    let state = showMessage(pushUndo(emptyNotices, removed('a')), 'x');
    state = showMessage(state, null);
    expect(shownNotice(state).undo.name).toBe('a');
  });

  it('keeps at most five waiting', () => {
    let state = emptyNotices;
    for (let i = 0; i < 7; i += 1) state = pushUndo(state, removed(String(i)));
    expect(state.undos).toHaveLength(5);
    expect(state.undos[0].undo.name).toBe('2');
  });
});
