// Mirror-exit reload command: which row is read, and the clear-before-
// reload ordering that makes the command one-time. The fetch is injected
// and recorded, so the ordering is pinned without a browser.
import { describe, it, expect } from 'vitest';
import {
  MIRROR_RELOAD_FIELD,
  mirrorReloadRequestUrl,
  isMirrorReloadRequestValue,
  requestMirrorReload,
  checkMirrorReload,
} from './mirrorReload.js';

const API = 'http://localhost:3001';
const WALL = 'Kitchen Wall Display';
const PHONE = 'Adam HomeGlow app';

const fakeFetch = (routes) => {
  const calls = [];
  const impl = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method });
    const handler = routes[`${method} ${url}`];
    if (!handler) return { ok: false, json: async () => ({}) };
    return handler();
  };
  return { impl, calls };
};

const okJson = (body) => ({ ok: true, json: async () => body });

describe('mirror reload request URL and value', () => {
  it('encodes the device name in the URL', () => {
    expect(mirrorReloadRequestUrl(API, WALL)).toBe(
      `${API}/api/devices/${encodeURIComponent(WALL)}/reload-request`
    );
  });

  it('only finite numbers count as a pending command', () => {
    expect(isMirrorReloadRequestValue(Date.now())).toBe(true);
    for (const bad of [null, undefined, 'now', NaN, Infinity, {}, []]) {
      expect(isMirrorReloadRequestValue(bad)).toBe(false);
    }
  });
});

describe('requestMirrorReload (mirror exit)', () => {
  it('POSTs to the TARGET row and returns the stored timestamp', async () => {
    const { impl, calls } = fakeFetch({
      [`POST ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ ok: true, [MIRROR_RELOAD_FIELD]: 123456789 }),
    });
    const result = await requestMirrorReload(impl, API, WALL);
    expect(result).toBe(123456789);
    expect(calls).toEqual([{ url: mirrorReloadRequestUrl(API, WALL), method: 'POST' }]);
  });

  it('never touches the caller row, and never throws', async () => {
    const { impl, calls } = fakeFetch({});
    expect(await requestMirrorReload(impl, API, WALL)).toBe(null);
    expect(calls).toEqual([{ url: mirrorReloadRequestUrl(API, WALL), method: 'POST' }]);

    const throwing = async () => { throw new Error('offline'); };
    expect(await requestMirrorReload(throwing, API, WALL)).toBe(null);
  });
});

describe('checkMirrorReload (target dashboard)', () => {
  it('GETs only the local row, DELETEs before signalling reload, in that order', async () => {
    const { impl, calls } = fakeFetch({
      [`GET ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ [MIRROR_RELOAD_FIELD]: 987654321 }),
      [`DELETE ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ ok: true }),
    });
    expect(await checkMirrorReload(impl, API, WALL)).toBe('reload');
    expect(calls).toEqual([
      { url: mirrorReloadRequestUrl(API, WALL), method: 'GET' },
      { url: mirrorReloadRequestUrl(API, WALL), method: 'DELETE' },
    ]);
  });

  it('no pending command means no DELETE and no reload', async () => {
    const { impl, calls } = fakeFetch({
      [`GET ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ [MIRROR_RELOAD_FIELD]: null }),
    });
    expect(await checkMirrorReload(impl, API, WALL)).toBe('none');
    expect(calls).toEqual([{ url: mirrorReloadRequestUrl(API, WALL), method: 'GET' }]);
  });

  it('a failed clear means no reload, so the command stays pending for a later check', async () => {
    const { impl, calls } = fakeFetch({
      [`GET ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ [MIRROR_RELOAD_FIELD]: 555 }),
      [`DELETE ${mirrorReloadRequestUrl(API, WALL)}`]: () => ({ ok: false, json: async () => ({}) }),
    });
    expect(await checkMirrorReload(impl, API, WALL)).toBe('none');
    expect(calls).toHaveLength(2);
  });

  it('adopt mode clears without signalling reload (fresh page already has current state)', async () => {
    const { impl, calls } = fakeFetch({
      [`GET ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ [MIRROR_RELOAD_FIELD]: 555 }),
      [`DELETE ${mirrorReloadRequestUrl(API, WALL)}`]: () => okJson({ ok: true }),
    });
    expect(await checkMirrorReload(impl, API, WALL, { adopt: true })).toBe('adopted');
    expect(calls).toHaveLength(2);
  });

  it('a non-target row is never read: the phone checks only the phone row', async () => {
    const { impl, calls } = fakeFetch({
      [`GET ${mirrorReloadRequestUrl(API, PHONE)}`]: () => okJson({ [MIRROR_RELOAD_FIELD]: null }),
    });
    expect(await checkMirrorReload(impl, API, PHONE)).toBe('none');
    expect(calls).toEqual([{ url: mirrorReloadRequestUrl(API, PHONE), method: 'GET' }]);
  });
});
