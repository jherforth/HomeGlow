import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_TOUCH_EVENT,
  FRAME_TOUCH_MESSAGE_TYPE,
  FRAME_TOUCH_SETTINGS_MESSAGE_TYPE,
  acceptFrameTouchMessage,
  attachTwoFingerSwipe,
  buildFrameTouchSettingsMessage,
  createSwipeDetector,
  swipeTargetTab,
} from './twoFingerSwipe.js';

// Two fingers 100px apart, their midpoint at (x, y).
const pair = (x, y, gap = 100) => [{ x: x - gap / 2, y }, { x: x + gap / 2, y }];

describe('createSwipeDetector', () => {
  it('reads fingers moving left as the next tab and right as the previous one', () => {
    const left = createSwipeDetector();
    left.start(pair(500, 300), 0);
    left.move(pair(400, 305));
    expect(left.end(0, 300)).toBe(1);

    const right = createSwipeDetector();
    right.start(pair(500, 300), 0);
    right.move(pair(620, 290));
    expect(right.end(0, 300)).toBe(-1);
  });

  it('finishes when the second-to-last finger lifts, not before', () => {
    const detector = createSwipeDetector();
    detector.start(pair(500, 300), 0);
    detector.move(pair(380, 300));
    // A third finger was down and lifted: two remain, the gesture goes on.
    expect(detector.end(2, 100)).toBe(0);
    expect(detector.end(1, 200)).toBe(1);
  });

  it('leaves short, slow, mostly vertical and pinching gestures alone', () => {
    const short = createSwipeDetector();
    short.start(pair(500, 300), 0);
    short.move(pair(440, 300));
    expect(short.end(0, 200)).toBe(0);

    const slow = createSwipeDetector();
    slow.start(pair(500, 300), 0);
    slow.move(pair(300, 300));
    expect(slow.end(0, 2000)).toBe(0);

    const vertical = createSwipeDetector();
    vertical.start(pair(500, 300), 0);
    vertical.move(pair(400, 400));
    expect(vertical.end(0, 200)).toBe(0);

    // The fingers spread apart while they drift sideways: a zoom.
    const pinch = createSwipeDetector();
    pinch.start(pair(500, 300, 100), 0);
    pinch.move(pair(400, 300, 220));
    pinch.move(pair(380, 300, 100));
    expect(pinch.end(0, 200)).toBe(0);
  });

  it('ignores one finger, and drops a gesture once a third finger lands', () => {
    const one = createSwipeDetector();
    one.start([{ x: 500, y: 300 }], 0);
    expect(one.move([{ x: 300, y: 300 }])).toBe(false);
    expect(one.end(0, 100)).toBe(0);

    const three = createSwipeDetector();
    three.start(pair(500, 300), 0);
    three.start([...pair(500, 300), { x: 600, y: 300 }], 10);
    three.move(pair(350, 300));
    expect(three.end(0, 200)).toBe(0);
  });

  it('claims the touch only once it is clearly sideways and not a pinch', () => {
    const detector = createSwipeDetector();
    detector.start(pair(500, 300), 0);
    expect(detector.move(pair(490, 300))).toBe(false);
    expect(detector.move(pair(470, 302))).toBe(true);

    const upward = createSwipeDetector();
    upward.start(pair(500, 300), 0);
    expect(upward.move(pair(470, 250))).toBe(false);
  });

  it("lets a second finger join late, counting the first finger's travel since it landed", () => {
    const detector = createSwipeDetector();
    // The first finger landed 300ms ago at x=500 and has moved 60px left.
    detector.start([
      { id: 1, x: 440, y: 300, x0: 500, y0: 300, downAt: 0 },
      { id: 2, x: 560, y: 300, x0: 560, y0: 300, downAt: 300 },
    ], 300);
    // Both then travel 40px more: (100 + 40) / 2 = 70 on average.
    detector.move([{ id: 1, x: 400, y: 300 }, { id: 2, x: 520, y: 300 }]);
    expect(detector.end(0, 700)).toBe(1);
  });

  it('times a joined gesture from its first finger', () => {
    const detector = createSwipeDetector();
    detector.start([
      { id: 1, x: 500, y: 300, x0: 500, y0: 300, downAt: 0 },
      { id: 2, x: 600, y: 300, x0: 600, y0: 300, downAt: 500 },
    ], 500);
    detector.move([{ id: 1, x: 350, y: 300 }, { id: 2, x: 450, y: 300 }]);
    expect(detector.end(0, 1200)).toBe(0);
  });

  it('starts afresh when the second finger lands long after the first', () => {
    const detector = createSwipeDetector();
    // The first finger dragged 200px left on its own a second ago; that was
    // something else, and doesn't count.
    detector.start([
      { id: 1, x: 300, y: 300, x0: 500, y0: 300, downAt: 0 },
      { id: 2, x: 400, y: 300, x0: 400, y0: 300, downAt: 1000 },
    ], 1000);
    detector.move([{ id: 1, x: 280, y: 300 }, { id: 2, x: 380, y: 300 }]);
    expect(detector.end(0, 1200)).toBe(0);
  });

  it('matches fingers by id, whatever order the browser lists them in', () => {
    const detector = createSwipeDetector();
    detector.start([{ id: 4, x: 500, y: 300 }, { id: 9, x: 600, y: 300 }], 0);
    detector.move([{ id: 9, x: 500, y: 300 }, { id: 4, x: 400, y: 300 }]);
    expect(detector.end(0, 300)).toBe(1);
  });

  it('forgets the gesture on cancel', () => {
    const detector = createSwipeDetector();
    detector.start(pair(500, 300), 0);
    detector.move(pair(350, 300));
    detector.cancel();
    expect(detector.end(0, 200)).toBe(0);
  });
});

describe('swipeTargetTab', () => {
  const tabs = [{ number: 1 }, { number: 4 }, { number: 2 }];

  it('follows the dock order and wraps around at both ends', () => {
    expect(swipeTargetTab(tabs, 1, 1)).toBe(4);
    expect(swipeTargetTab(tabs, 4, 1)).toBe(2);
    expect(swipeTargetTab(tabs, 2, 1)).toBe(1);
    expect(swipeTargetTab(tabs, 1, -1)).toBe(2);
  });

  it('starts from the first tab when the active one is gone', () => {
    expect(swipeTargetTab(tabs, 9, 1)).toBe(4);
  });

  it('falls back to a tab id when there is no number', () => {
    expect(swipeTargetTab([{ id: 1 }, { id: 3 }], 1, 1)).toBe(3);
  });

  it('has nowhere to go with fewer than two tabs or no direction', () => {
    expect(swipeTargetTab([{ number: 1 }], 1, 1)).toBeNull();
    expect(swipeTargetTab([], 1, 1)).toBeNull();
    expect(swipeTargetTab(null, 1, 1)).toBeNull();
    expect(swipeTargetTab(tabs, 1, 0)).toBeNull();
  });
});

describe('frame messages', () => {
  const frame = {};
  const origin = 'http://homeglow.local';
  const message = (data, overrides = {}) => ({ source: frame, origin, data, ...overrides });

  it('builds the settings message with strict booleans', () => {
    expect(buildFrameTouchSettingsMessage({ swipe: true, blockPinchZoom: 'yes' })).toEqual({
      type: FRAME_TOUCH_SETTINGS_MESSAGE_TYPE,
      swipe: true,
      blockPinchZoom: false,
      expand: false,
    });
  });

  it('passes on how the plugin expands, and nothing else', () => {
    expect(buildFrameTouchSettingsMessage({ swipe: false, blockPinchZoom: false, expand: 'doubleTap' }).expand).toBe('doubleTap');
    expect(buildFrameTouchSettingsMessage({ swipe: false, blockPinchZoom: false, expand: 'button' }).expand).toBe('button');
    expect(buildFrameTouchSettingsMessage({ swipe: false, blockPinchZoom: false, expand: 'wiggle' }).expand).toBe(false);
  });

  it("accepts a touch report from the wrapper's own frame and origin only", () => {
    const data = { type: FRAME_TOUCH_MESSAGE_TYPE, phase: 'start', points: pair(10, 10), fingers: 2 };
    expect(acceptFrameTouchMessage(message(data), frame, origin)).toEqual({
      phase: 'start',
      points: pair(10, 10),
      fingers: 2,
    });
    expect(acceptFrameTouchMessage(message(data, { source: {} }), frame, origin)).toBeNull();
    expect(acceptFrameTouchMessage(message(data, { origin: 'http://elsewhere' }), frame, origin)).toBeNull();
    expect(acceptFrameTouchMessage(message(data), null, origin)).toBeNull();
  });

  it('rejects other messages and cleans up malformed points', () => {
    expect(acceptFrameTouchMessage(message({ type: 'homeglow:celebrate' }), frame, origin)).toBeNull();
    expect(acceptFrameTouchMessage(message({ type: FRAME_TOUCH_MESSAGE_TYPE, phase: 'wave' }), frame, origin)).toBeNull();
    expect(acceptFrameTouchMessage(message('text'), frame, origin)).toBeNull();

    const messy = { type: FRAME_TOUCH_MESSAGE_TYPE, phase: 'move', points: [{ x: 1, y: 2, extra: 'no' }, { x: 'a', y: 3 }, null] };
    expect(acceptFrameTouchMessage(message(messy), frame, origin)).toEqual({
      phase: 'move',
      points: [{ x: 1, y: 2 }],
      fingers: 1,
    });
  });
});

// A stand-in for window: records listeners and replays events to them.
const fakeTarget = () => {
  const listeners = new Map();
  return {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    fire: (type, event) => listeners.get(type)?.(event),
    count: () => listeners.size,
  };
};

const touchEvent = (points, extra = {}) => ({
  touches: points.map(({ x, y }) => ({ clientX: x, clientY: y })),
  cancelable: true,
  preventDefault: vi.fn(),
  ...extra,
});

describe('attachTwoFingerSwipe', () => {
  it('turns a two-finger swipe on the page into a tab change', () => {
    const target = fakeTarget();
    const onSwipe = vi.fn();
    let clock = 0;
    attachTwoFingerSwipe({ target, onSwipe, now: () => clock });

    target.fire('touchstart', touchEvent(pair(500, 300)));
    const move = touchEvent(pair(380, 300));
    target.fire('touchmove', move);
    clock = 250;
    target.fire('touchend', touchEvent([]));

    expect(move.preventDefault).toHaveBeenCalled();
    expect(onSwipe).toHaveBeenCalledWith(1);
  });

  it('leaves a gesture alone when told to ignore it', () => {
    const target = fakeTarget();
    const onSwipe = vi.fn();
    attachTwoFingerSwipe({ target, onSwipe, ignore: () => true, now: () => 0 });

    target.fire('touchstart', touchEvent(pair(500, 300)));
    const move = touchEvent(pair(380, 300));
    target.fire('touchmove', move);
    target.fire('touchend', touchEvent([]));

    expect(move.preventDefault).not.toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("follows each plugin frame's touches with a detector of its own", () => {
    const target = fakeTarget();
    const onSwipe = vi.fn();
    attachTwoFingerSwipe({ target, onSwipe, now: () => 0 });
    const frameTouch = (sourceKey, phase, points, fingers = points.length) =>
      target.fire(FRAME_TOUCH_EVENT, { detail: { sourceKey, phase, points, fingers } });

    frameTouch('a', 'start', pair(200, 100));
    // Another frame's touch in between doesn't disturb the first one.
    frameTouch('b', 'start', pair(200, 100));
    frameTouch('a', 'move', pair(330, 100));
    frameTouch('b', 'cancel', []);
    frameTouch('a', 'end', [], 0);

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(-1);
  });

  it("lets a page finger join a first one that's already moving", () => {
    const target = fakeTarget();
    const onSwipe = vi.fn();
    let clock = 0;
    attachTwoFingerSwipe({ target, onSwipe, now: () => clock });
    const touch = (identifier, clientX, clientY = 300) => ({ identifier, clientX, clientY });

    target.fire('touchstart', { touches: [touch(1, 500)], changedTouches: [touch(1, 500)] });
    clock = 250;
    target.fire('touchmove', { touches: [touch(1, 440)], cancelable: true, preventDefault: vi.fn() });
    target.fire('touchstart', { touches: [touch(1, 440), touch(2, 560)], changedTouches: [touch(2, 560)] });
    clock = 450;
    target.fire('touchmove', { touches: [touch(1, 400), touch(2, 520)], cancelable: true, preventDefault: vi.fn() });
    clock = 500;
    target.fire('touchend', { touches: [], changedTouches: [touch(1, 400), touch(2, 520)] });

    expect(onSwipe).toHaveBeenCalledWith(1);
  });

  it("uses a frame finger's landing, sent as an age because the frame's clock isn't the page's", () => {
    const target = fakeTarget();
    const onSwipe = vi.fn();
    let clock = 10000;
    attachTwoFingerSwipe({ target, onSwipe, now: () => clock });
    const fire = (phase, points, fingers = points.length) =>
      target.fire(FRAME_TOUCH_EVENT, { detail: { sourceKey: 'f', phase, points, fingers } });

    fire('start', [
      { id: 1, x: 440, y: 100, x0: 500, y0: 100, age: 300 },
      { id: 2, x: 560, y: 100, x0: 560, y0: 100, age: 0 },
    ]);
    clock = 10300;
    fire('move', [{ id: 1, x: 400, y: 100 }, { id: 2, x: 520, y: 100 }]);
    fire('end', [], 0);

    expect(onSwipe).toHaveBeenCalledWith(1);
  });

  it('removes every listener it added', () => {
    const target = fakeTarget();
    const detach = attachTwoFingerSwipe({ target, onSwipe: () => {} });
    expect(target.count()).toBe(5);
    detach();
    expect(target.count()).toBe(0);
  });
});
