import { describe, expect, it } from 'vitest';
import { handlesSideways, ownsSideways } from './flickTarget.js';

// Just enough of an element for the walk up the tree.
const el = (parent, { matches = false, style = {}, scrollWidth = 100, clientWidth = 100 } = {}) => ({
  nodeType: 1, parentElement: parent, scrollWidth, clientWidth, style,
  matches: () => matches,
});
const styleOf = (node) => ({ touchAction: 'auto', overflowX: 'visible', ...node.style });

describe('flick targets', () => {
  it('touch-action that leaves sideways moves to the page script', () => {
    expect(handlesSideways('auto')).toBe(false);
    expect(handlesSideways('manipulation')).toBe(false);
    expect(handlesSideways('pan-x pan-y')).toBe(false);
    expect(handlesSideways('none')).toBe(true);
    expect(handlesSideways('pan-y')).toBe(true);
    expect(handlesSideways('pan-y pinch-zoom')).toBe(true);
  });

  it('plain content is the Stack\'s; a slider, a scroller, a scrubbed graph are theirs', () => {
    const stop = el(null, { style: { touchAction: 'pan-y' } }); // the Stack itself
    const card = el(stop);
    expect(ownsSideways(el(card), stop, styleOf)).toBe(false);
    expect(ownsSideways(el(card, { matches: true }), stop, styleOf)).toBe(true);
    expect(ownsSideways(el(el(card, { style: { overflowX: 'auto' }, scrollWidth: 900, clientWidth: 300 })), stop, styleOf)).toBe(true);
    expect(ownsSideways(el(card, { style: { overflowX: 'auto' } }), stop, styleOf)).toBe(false);
    expect(ownsSideways(el(el(card, { style: { touchAction: 'none' } })), stop, styleOf)).toBe(true);
  });
});
