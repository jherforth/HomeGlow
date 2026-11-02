import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPressHold, HOLD_MS, HOLD_SLOP_PX } from './pressHold.js';

describe('createPressHold', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a press that stays put long enough is a hold, and its release says so', () => {
    const onHold = vi.fn();
    const hold = createPressHold({ onHold });
    hold.down(100, 200, 'photo-7');
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledWith('photo-7', { x: 100, y: 200 });
    expect(hold.up()).toBe(true);
  });

  it('a quick tap is not a hold', () => {
    const onHold = vi.fn();
    const hold = createPressHold({ onHold });
    hold.down(10, 10, 'a');
    vi.advanceTimersByTime(120);
    expect(hold.up()).toBe(false);
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('sliding past the slop turns the press into a drag, not a hold', () => {
    const onHold = vi.fn();
    const hold = createPressHold({ onHold });
    hold.down(50, 50, 'a');
    hold.move(50 + HOLD_SLOP_PX, 50); // on the edge: still a press
    vi.advanceTimersByTime(HOLD_MS / 2);
    hold.move(50 + HOLD_SLOP_PX + 1, 50); // past it
    vi.advanceTimersByTime(HOLD_MS);
    expect(onHold).not.toHaveBeenCalled();
    expect(hold.up()).toBe(false);
  });

  it('a new press restarts the clock, and a cancelled one never holds', () => {
    const onHold = vi.fn();
    const hold = createPressHold({ onHold });
    hold.down(0, 0, 'first');
    vi.advanceTimersByTime(HOLD_MS - 50);
    hold.down(0, 0, 'second');
    vi.advanceTimersByTime(100);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(HOLD_MS);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledWith('second', { x: 0, y: 0 });
    hold.up();

    hold.down(0, 0, 'third');
    hold.cancel();
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(hold.up()).toBe(false);
  });
});
