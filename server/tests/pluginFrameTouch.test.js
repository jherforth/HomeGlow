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
    vm.runInNewContext(PLUGIN_FRAME_TOUCH_SCRIPT, { window, document, Math, Date });
    return {
        window,
        parent,
        document,
        posted,
        listeners,
        fire: (type, event) => listeners.get(type)?.fn(event),
        tick: (ms) => { clock += ms; },
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

test('does nothing until the dashboard turns it on', () => {
    const f = frame();
    assert.deepEqual([...f.listeners.keys()], ['message']);
    assert.equal(f.document.documentElement.style.touchAction, '');
});

test('ignores settings from anyone but its parent', () => {
    const f = frame();
    f.settings({ swipe: true, blockPinchZoom: true }, {});
    assert.deepEqual([...f.listeners.keys()], ['message']);
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
    assert.deepEqual([...f.listeners.keys()], ['message']);
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
