import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haAnswered, startHaPoll } from './haPoll.js';

const flush = () => new Promise((resolve) => { setImmediate(resolve); });

describe('startHaPoll', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }); });
  afterEach(() => { vi.useRealTimers(); });

  const run = (answers) => {
    const seen = { answers: [], down: [], calls: 0 };
    const stop = startHaPoll({
      intervalMs: 1000,
      graceMs: 10000,
      maxBackoffMs: 4000,
      fetch: async () => {
        seen.calls += 1;
        const next = answers.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      onAnswer: (answer) => seen.answers.push(answer),
      onDown: (answer) => seen.down.push(answer),
    });
    return { seen, stop };
  };
  const step = async (ms) => {
    vi.advanceTimersByTime(ms);
    await flush();
  };

  it('keeps what it read through a short blip', async () => {
    const good = { connected: true, states: { a: 1 } };
    const { seen, stop } = run([good, new Error('x'), { connected: true, reachable: false }, good]);
    await flush();
    expect(seen.answers).toEqual([good]);
    await step(1000); // fails
    await step(1000); // fails again
    await step(2000); // waited twice as long: back
    expect(seen.down).toEqual([]);
    expect(seen.answers).toHaveLength(2);
    stop();
  });

  it('goes down once reads have failed for the grace time, once', async () => {
    const fail = new Error('x');
    const { seen, stop } = run([{ connected: true }, ...Array(20).fill(fail)]);
    await flush();
    for (let i = 0; i < 16; i += 1) await step(1000);
    expect(seen.down).toHaveLength(1);
    expect(seen.calls).toBeLessThan(10); // backed off
    stop();
  });

  it('goes down at once when nothing was ever read', async () => {
    const { seen, stop } = run([new Error('x')]);
    await flush();
    expect(seen.down).toHaveLength(1);
    stop();
  });

  it('never overlaps reads', async () => {
    let calls = 0;
    let release;
    const stop = startHaPoll({
      intervalMs: 1000,
      fetch: () => { calls += 1; return new Promise((resolve) => { release = resolve; }); },
      onAnswer: () => {},
      onDown: () => {},
    });
    await step(5000);
    expect(calls).toBe(1);
    release({ connected: true });
    await flush();
    await step(1000);
    expect(calls).toBe(2);
    stop();
  });

  it('counts Home Assistant not set up as an answer', () => {
    expect(haAnswered({ connected: false })).toBe(true);
    expect(haAnswered({ connected: true, reachable: false })).toBe(false);
    expect(haAnswered(null)).toBe(false);
  });
});
