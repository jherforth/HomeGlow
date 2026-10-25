// The touch script every plugin page is served with: two-finger swipes between
// tabs and the pinch-zoom block reach plugins, which the dashboard can't see
// into. Run here in a sandbox with a stand-in window and document.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { PLUGIN_FRAME_TOUCH_SCRIPT } = require('../utils/pluginFrameTouch');

// A plugin frame: its window, its parent (the dashboard) and its document.
function frame({ topLevel = false } = {}) {
    const listeners = new Map();
    const posted = [];
    // Messages are copied out of the sandbox, as postMessage would clone them.
    const parent = { postMessage: (data, origin) => posted.push({ data: JSON.parse(JSON.stringify(data)), origin }) };
    const window = {
        addEventListener: (type, fn, options) => listeners.set(type, { fn, options }),
        removeEventListener: (type) => listeners.delete(type),
    };
    window.parent = topLevel ? window : parent;
    const document = { documentElement: { style: { touchAction: '' } } };
    let clock = 1000;
    const Date = { now: () => clock };
    // Timers run when the test moves the clock past them.
    let timers = [];
    let nextTimer = 1;
    const setTimeout = (fn, ms) => { const id = nextTimer++; timers.push({ id, fn, at: clock + ms }); return id; };
    const clearTimeout = (id) => { timers = timers.filter((t) => t.id !== id); };
    class MouseEvent {
        constructor(type, init) { Object.assign(this, { type }, init); }
    }
    vm.runInNewContext(PLUGIN_FRAME_TOUCH_SCRIPT, { window, document, Math, Date, setTimeout, clearTimeout, MouseEvent });
    const runTimers = () => {
        const due = timers.filter((t) => t.at <= clock);
        timers = timers.filter((t) => t.at > clock);
        due.forEach((t) => t.fn());
    };
    return {
        window,
        parent,
        document,
        posted,
        listeners,
        fire: (type, event) => listeners.get(type)?.fn(event),
        tick: (ms) => { clock += ms; runTimers(); },
        settings: (data, source = parent) => listeners.get('message').fn({ source, data: { type: 'homeglow:touch-settings', ...data } }),
    };
}

const touches = (...points) => points.map(([x, y, id], i) => ({ identifier: id ?? i, clientX: x, clientY: y }));
const touchEvent = (...points) => {
    const list = touches(...points);
    // Every finger counts as just landed or lifted; tests that need otherwise
    // pass changedTouches themselves.
    const event = { touches: list, changedTouches: list, cancelable: true, prevented: false };
    event.preventDefault = () => { event.prevented = true; };
    return event;
};

test('before settings, only activity reporting is on (swipe/expand stay off)', () => {
    const f = frame();
    // Use reporting is always on; the swipe/expand listeners still wait
    // for the dashboard's settings message.
    assert.deepEqual([...f.listeners.keys()].sort(), ['keydown', 'message', 'pointerdown', 'wheel']);
    assert.equal(f.document.documentElement.style.touchAction, '');
});

test('reports use inside the frame as homeglow:activity, throttled to once a second', () => {
    const f = frame();
    f.fire('pointerdown', {});
    f.fire('keydown', {});
    f.fire('wheel', {});
    assert.deepEqual(f.posted.map(({ data }) => data.type), ['homeglow:activity']);
    f.tick(1100);
    f.fire('keydown', {});
    assert.deepEqual(f.posted.map(({ data }) => data.type), ['homeglow:activity', 'homeglow:activity']);
});

test('ignores settings from anyone but its parent', () => {
    const f = frame();
    f.settings({ swipe: true, blockPinchZoom: true }, {});
    // Only the always-on activity reporting is present; no swipe listeners.
    assert.deepEqual([...f.listeners.keys()].sort(), ['keydown', 'message', 'pointerdown', 'wheel']);
    assert.equal(f.document.documentElement.style.touchAction, '');
});

test('is inert in a page opened on its own, outside the dashboard', () => {
    const f = frame({ topLevel: true });
    assert.equal(f.listeners.size, 0);
});

test('with swiping on, reports two-finger touches and claims a sideways swipe', () => {
    const f = frame();
    f.settings({ swipe: true, blockPinchZoom: false });
    assert.equal(f.listeners.get('touchmove').options.passive, false);

    // One finger is never reported.
    f.fire('touchstart', touchEvent([100, 100]));
    f.fire('touchend', touchEvent());
    assert.equal(f.posted.length, 0);

    f.fire('touchstart', touchEvent([100, 100], [200, 100]));
    const small = touchEvent([95, 100], [195, 100]);
    f.fire('touchmove', small);
    const sideways = touchEvent([60, 100], [160, 100]);
    f.fire('touchmove', sideways);
    f.fire('touchend', touchEvent());

    assert.equal(small.prevented, false);
    assert.equal(sideways.prevented, true);
    assert.deepEqual(f.posted.map(({ data }) => data.phase), ['start', 'move', 'move', 'end']);
    assert.deepEqual(f.posted[0].data, {
        type: 'homeglow:touch',
        phase: 'start',
        points: [
            { id: 0, x: 100, y: 100, x0: 100, y0: 100, age: 0 },
            { id: 1, x: 200, y: 100, x0: 200, y0: 100, age: 0 },
        ],
        fingers: 2,
    });
    assert.equal(f.posted[3].data.fingers, 0);
});

test('never claims a pinch, and cancels when a third finger lands', () => {
    const f = frame();
    f.settings({ swipe: true });

    f.fire('touchstart', touchEvent([100, 100], [200, 100]));
    const pinch = touchEvent([20, 100], [260, 100]);
    f.fire('touchmove', pinch);
    assert.equal(pinch.prevented, false);

    f.fire('touchstart', touchEvent([20, 100], [260, 100], [300, 300]));
    assert.equal(f.posted.at(-1).data.phase, 'cancel');
    // The rest of that gesture isn't reported.
    const count = f.posted.length;
    f.fire('touchmove', touchEvent([0, 100], [100, 100]));
    f.fire('touchend', touchEvent());
    assert.equal(f.posted.length, count);
});

test('blocks pinch zoom on its page, and gives back what was there when unblocked', () => {
    const f = frame();
    f.document.documentElement.style.touchAction = 'manipulation';
    f.settings({ swipe: false, blockPinchZoom: true });
    assert.equal(f.document.documentElement.style.touchAction, 'pan-x pan-y');
    f.settings({ swipe: false, blockPinchZoom: false });
    assert.equal(f.document.documentElement.style.touchAction, 'manipulation');
});

test('removes its touch listeners when swiping is turned off', () => {
    const f = frame();
    f.settings({ swipe: true });
    assert.ok(f.listeners.has('touchstart'));
    f.settings({ swipe: false });
    // Only the always-on activity reporting remains alongside the settings
    // listener; the swipe listeners are gone.
    assert.deepEqual([...f.listeners.keys()].sort(), ['keydown', 'message', 'pointerdown', 'wheel']);
});

test("a second finger landing later says where and when the first landed, and the first finger's travel counts", () => {
    const f = frame();
    f.settings({ swipe: true });

    f.fire('touchstart', touchEvent([300, 100, 7]));
    f.tick(250);
    // The first finger has moved 30px left before the second lands.
    const second = touchEvent([270, 100, 7], [380, 100, 9]);
    second.changedTouches = [second.touches[1]];
    f.fire('touchstart', second);

    assert.deepEqual(f.posted[0].data.points, [
        { id: 7, x: 270, y: 100, x0: 300, y0: 100, age: 250 },
        { id: 9, x: 380, y: 100, x0: 380, y0: 100, age: 0 },
    ]);

    // Measured from where each landed: (-50 + -20) / 2 = -35, past the claim.
    const move = touchEvent([250, 100, 7], [360, 100, 9]);
    f.fire('touchmove', move);
    assert.equal(move.prevented, true);
});

// Expanding a widget: the frame reports touches and double-taps to the
// dashboard, and holds a plain single tap for a moment so a double-tap can win.

// A click on an element of the plugin page. `interactive` makes it a button.
function clickOn(f, { x = 50, y = 50, interactive = false, detail = 1 } = {}) {
    const target = {
        isConnected: true,
        closest: (selector) => (interactive && selector.includes('button') ? target : null),
        received: [],
        dispatchEvent: (event) => { target.received.push(event); f.fire('click', event); },
    };
    const event = { target, clientX: x, clientY: y, detail, stopped: false, prevented: false };
    event.stopImmediatePropagation = () => { event.stopped = true; };
    event.preventDefault = () => { event.prevented = true; };
    f.fire('click', event);
    return { event, target };
}

test('expanding off: no click or swipe listeners, only activity reporting', () => {
    const f = frame();
    f.settings({ swipe: false, expand: false });
    assert.deepEqual([...f.listeners.keys()].sort(), ['keydown', 'message', 'pointerdown', 'wheel']);
    assert.equal(f.document.documentElement.style.touchAction, '');
});

test('double-tap expanding: two close taps are one double-tap, and neither reaches the plugin', () => {
    const f = frame();
    f.settings({ expand: 'doubleTap' });
    assert.equal(f.listeners.get('click').options, true);
    assert.equal(f.document.documentElement.style.touchAction, 'manipulation');

    const first = clickOn(f, { x: 100, y: 100 });
    assert.equal(first.event.stopped, true);
    f.tick(150);
    const second = clickOn(f, { x: 110, y: 104 });
    assert.equal(second.event.stopped, true);
    f.tick(1000);

    assert.deepEqual(f.posted.map(({ data }) => data.type), ['homeglow:double-tap']);
    // The held first tap was dropped, not replayed.
    assert.equal(first.target.received.length, 0);
});

test('double-tap expanding: a lone tap is replayed on what it was meant for', () => {
    const f = frame();
    f.settings({ expand: 'doubleTap' });
    const { event, target } = clickOn(f, { x: 30, y: 40 });
    assert.equal(event.stopped, true);
    f.tick(200);
    assert.equal(target.received.length, 0);
    f.tick(200);
    assert.equal(target.received.length, 1);
    const replayed = target.received[0];
    assert.equal(replayed.type, 'click');
    assert.equal(replayed.clientX, 30);
    assert.equal(replayed.clientY, 40);
    // The replay goes through untouched.
    assert.equal(replayed.__homeglowReplayedClick, true);
    assert.equal(f.posted.length, 0);
});

test('double-tap expanding: taps far apart, or slow, are two single taps', () => {
    const f = frame();
    f.settings({ expand: 'doubleTap' });
    const a = clickOn(f, { x: 10, y: 10 });
    f.tick(100);
    const b = clickOn(f, { x: 300, y: 10 });
    f.tick(500);
    const c = clickOn(f, { x: 300, y: 10 });
    f.tick(500);
    assert.equal(f.posted.length, 0);
    // The second tap let the first through at once rather than wait.
    assert.equal(a.target.received.length, 1);
    assert.equal(b.target.received.length, 1);
    assert.equal(c.target.received.length, 1);
});

test('double-tap expanding: buttons and keyboard clicks act at once and never count', () => {
    const f = frame();
    f.settings({ expand: 'doubleTap' });
    const button1 = clickOn(f, { interactive: true });
    const button2 = clickOn(f, { interactive: true });
    const keyboard = clickOn(f, { detail: 0 });
    assert.equal(button1.event.stopped, false);
    assert.equal(button2.event.stopped, false);
    assert.equal(keyboard.event.stopped, false);
    f.tick(1000);
    assert.equal(f.posted.length, 0);
});

test('either method reports a touch at most once a second', () => {
    const f = frame();
    f.settings({ expand: 'button' });
    assert.ok(f.listeners.has('pointerdown'));
    // Button mode never holds a tap.
    const { event } = clickOn(f);
    assert.equal(event.stopped, false);
    assert.equal(f.document.documentElement.style.touchAction, '');

    f.fire('pointerdown', {});
    f.tick(300);
    f.fire('pointerdown', {});
    f.tick(1000);
    f.fire('pointerdown', {});
    assert.deepEqual(f.posted.map(({ data }) => data.type), ['homeglow:frame-activity', 'homeglow:frame-activity']);
});

test('turning expanding off removes its listeners and gives back the touch-action', () => {
    const f = frame();
    f.document.documentElement.style.touchAction = 'auto';
    f.settings({ expand: 'doubleTap' });
    assert.equal(f.document.documentElement.style.touchAction, 'manipulation');
    f.settings({ expand: false });
    // The expand listeners are gone; activity reporting stays. (This
    // harness stores one listener per type, so the always-on pointerdown
    // entry is shadowed here; in a real browser it survives, because it
    // is a different function from the expand handler.)
    assert.equal(f.listeners.has('click'), false);
    assert.equal(f.listeners.has('keydown'), true);
    assert.equal(f.listeners.has('wheel'), true);
    assert.equal(f.document.documentElement.style.touchAction, 'auto');
});

test('a blocked pinch wins over double-tap expanding, and both work together', () => {
    const f = frame();
    f.settings({ expand: 'doubleTap', blockPinchZoom: true });
    assert.equal(f.document.documentElement.style.touchAction, 'pan-x pan-y');
    f.settings({ expand: 'doubleTap', blockPinchZoom: false });
    assert.equal(f.document.documentElement.style.touchAction, 'manipulation');
});
