import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('./pluginEventBridge.js', () => ({ subscribePluginEvents: vi.fn(() => () => {}) }));

const axios = (await import('axios')).default;
const {
  CHECK_INTERVAL_MS,
  changedDomains,
  checkHouseholdChanges,
  resetHouseholdChangesForTests,
  setHouseholdChangesMode,
  subscribeHouseholdChanges,
} = await import('./householdChanges.js');

const revisions = (overrides = {}) => ({ chores: 10, users: 10, prizes: 10, settings: 10, calendar: 10, ...overrides });
const answer = (data, etag = `"${Object.values(data).join('-')}"`) => ({ status: 200, data, headers: { etag } });
const notModified = { status: 304, data: '', headers: {} };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// A document whose visibility the tests set, with its visibilitychange listeners.
function stubDocument() {
  const listeners = new Set();
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.delete(fn); },
  };
  return {
    set(state) {
      globalThis.document.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
}

describe('changedDomains', () => {
  it('names the kinds whose counters differ, and none before the first answer', () => {
    expect(changedDomains(revisions(), revisions({ chores: 11, calendar: 3 }))).toEqual(['chores', 'calendar']);
    expect(changedDomains(revisions(), revisions())).toEqual([]);
    expect(changedDomains(null, revisions())).toEqual([]);
  });
});

describe('household changes', () => {
  let visibility;
  beforeEach(() => {
    resetHouseholdChangesForTests();
    axios.get.mockReset();
    visibility = stubDocument();
  });
  afterEach(() => {
    resetHouseholdChangesForTests();
    vi.useRealTimers();
    delete globalThis.document;
  });

  it('tells each subscriber only about the kinds it asked for, after a baseline', async () => {
    axios.get.mockResolvedValueOnce(answer(revisions()));
    const chores = vi.fn();
    const calendar = vi.fn();
    subscribeHouseholdChanges(['chores', 'users'], chores);
    subscribeHouseholdChanges(['calendar'], calendar);
    await flush();
    expect(chores).not.toHaveBeenCalled();

    axios.get.mockResolvedValueOnce(answer(revisions({ chores: 11, users: 11 })));
    await checkHouseholdChanges();
    expect(chores).toHaveBeenCalledWith(['chores', 'users']);
    expect(calendar).not.toHaveBeenCalled();
  });

  it('sends the last ETag, and a 304 changes nothing', async () => {
    axios.get.mockResolvedValueOnce(answer(revisions(), '"abc"'));
    const handler = vi.fn();
    subscribeHouseholdChanges(['chores'], handler);
    await flush();
    axios.get.mockResolvedValueOnce(notModified);
    await checkHouseholdChanges();
    expect(axios.get.mock.calls[1][1].headers).toEqual({ 'If-None-Match': '"abc"' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a restart reads as everything changed', async () => {
    axios.get.mockResolvedValueOnce(answer(revisions()));
    const handler = vi.fn();
    subscribeHouseholdChanges(['chores', 'settings'], handler);
    await flush();
    axios.get.mockResolvedValueOnce(answer({ chores: 5000, users: 5000, prizes: 5000, settings: 5000, calendar: 5000 }));
    await checkHouseholdChanges();
    expect(handler).toHaveBeenCalledWith(['chores', 'settings']);
  });

  it('a display checks every 15 seconds while visible, and at once when it comes back', async () => {
    vi.useFakeTimers();
    axios.get.mockResolvedValue(notModified);
    subscribeHouseholdChanges(['chores'], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(axios.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(axios.get).toHaveBeenCalledTimes(2);

    visibility.set('hidden');
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
    expect(axios.get).toHaveBeenCalledTimes(2);

    visibility.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(axios.get).toHaveBeenCalledTimes(3);
  });

  it('a phone checks only when it becomes visible', async () => {
    vi.useFakeTimers();
    axios.get.mockResolvedValue(notModified);
    setHouseholdChangesMode('visible');
    subscribeHouseholdChanges(['chores'], () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(axios.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 4);
    expect(axios.get).toHaveBeenCalledTimes(1);

    visibility.set('hidden');
    visibility.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it('stops checking when the last subscriber leaves', async () => {
    vi.useFakeTimers();
    axios.get.mockResolvedValue(notModified);
    const stop = subscribeHouseholdChanges(['chores'], () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(visibility.listeners.size).toBe(0);
  });

  it('a failed check is quiet and the next one tries again', async () => {
    axios.get.mockResolvedValueOnce(answer(revisions()));
    const handler = vi.fn();
    subscribeHouseholdChanges(['chores'], handler);
    await flush();
    axios.get.mockRejectedValueOnce(new Error('Network Error'));
    await checkHouseholdChanges();
    axios.get.mockResolvedValueOnce(answer(revisions({ chores: 12 })));
    await checkHouseholdChanges();
    expect(handler).toHaveBeenCalledWith(['chores']);
  });
});
