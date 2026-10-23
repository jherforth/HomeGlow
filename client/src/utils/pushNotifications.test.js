import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  keyBytes, pushSupport, refreshSubscription, turnOffNotifications, turnOnNotifications,
} from './pushNotifications.js';

vi.mock('axios', () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn() } }));

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

// A browser window with just what push needs.
function fakeWindow({
  secure = true, ua = ANDROID, platform = 'Linux armv8l', touch = 5, standalone = false,
  push = true, permission = 'default', grant = 'granted', existing = null,
} = {}) {
  const subscribe = vi.fn(async (options) => ({
    options, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }),
  }));
  const pushManager = { getSubscription: vi.fn(async () => existing), subscribe };
  const registration = { pushManager };
  const win = {
    isSecureContext: secure,
    matchMedia: () => ({ matches: standalone }),
    navigator: {
      userAgent: ua, platform, maxTouchPoints: touch,
      ...(push ? { serviceWorker: { register: vi.fn(async () => registration), ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) } } : {}),
    },
    ...(push ? { PushManager: function PushManager() {}, Notification: { permission, requestPermission: vi.fn(async () => grant) } } : {}),
  };
  return { win, pushManager, subscribe };
}

// A real-looking server key: 65 bytes as URL-safe base64.
const KEY_BYTES = Uint8Array.from({ length: 65 }, (_, i) => (i * 7 + 4) % 256);
const KEY = btoa(String.fromCharCode(...KEY_BYTES)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

beforeEach(() => {
  vi.mocked(axios.get).mockReset();
  vi.mocked(axios.put).mockReset();
  vi.mocked(axios.delete).mockReset();
});

describe('pushSupport', () => {
  it('needs HTTPS before anything else', () => {
    expect(pushSupport(fakeWindow({ secure: false }).win)).toBe('insecure');
  });

  it('an iPhone needs HomeGlow on its Home Screen; there, it is ready', () => {
    expect(pushSupport(fakeWindow({ ua: IPHONE, platform: 'iPhone', push: false }).win)).toBe('install-first');
    expect(pushSupport(fakeWindow({ ua: IPHONE, platform: 'iPhone', standalone: true }).win)).toBe('ready');
  });

  it('an iPad that calls itself a Mac is still an iPad', () => {
    expect(pushSupport(fakeWindow({ ua: 'Macintosh', platform: 'MacIntel', touch: 5 }).win)).toBe('install-first');
    expect(pushSupport(fakeWindow({ ua: 'Macintosh', platform: 'MacIntel', touch: 0 }).win)).toBe('ready');
  });

  it('reports a browser without push, and a refusal', () => {
    expect(pushSupport(fakeWindow({ push: false }).win)).toBe('unsupported');
    expect(pushSupport(fakeWindow({ permission: 'denied' }).win)).toBe('blocked');
    expect(pushSupport(fakeWindow().win)).toBe('ready');
  });
});

describe('keyBytes', () => {
  it('reads URL-safe base64 without padding', () => {
    expect(Array.from(keyBytes(KEY))).toEqual(Array.from(KEY_BYTES));
  });
});

describe('turnOnNotifications', () => {
  it('asks, subscribes to the server key and saves it for this device', async () => {
    const { win, subscribe } = fakeWindow();
    vi.mocked(axios.get).mockResolvedValue({ data: { publicKey: KEY } });
    vi.mocked(axios.put).mockResolvedValue({ data: { enabled: true } });

    expect(await turnOnNotifications('Mom phone', { language: 'es' }, win)).toEqual({ enabled: true });
    expect(win.navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
    const [url, body] = vi.mocked(axios.put).mock.calls[0];
    expect(url).toMatch(/\/api\/devices\/Mom%20phone\/notifications$/);
    expect(body).toEqual({
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } },
      events: ['chore.completed', 'chore.allCompleted'],
      members: 'all',
      language: 'es',
    });
  });

  it('stops at a refusal, telling the server nothing', async () => {
    const { win, subscribe } = fakeWindow({ grant: 'denied' });
    await expect(turnOnNotifications('Mom phone', {}, win)).rejects.toMatchObject({ reason: 'blocked' });
    expect(subscribe).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  });

  it('replaces a subscription made for another server key', async () => {
    const old = { options: { applicationServerKey: new Uint8Array(65).buffer }, unsubscribe: vi.fn(async () => true) };
    const { win, subscribe } = fakeWindow({ existing: old });
    vi.mocked(axios.get).mockResolvedValue({ data: { publicKey: KEY } });
    vi.mocked(axios.put).mockResolvedValue({ data: { enabled: true } });
    await turnOnNotifications('Mom phone', {}, win);
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
  });
});

describe('turnOffNotifications', () => {
  it('on this device also drops the browser subscription', async () => {
    const existing = { unsubscribe: vi.fn(async () => true) };
    const { win } = fakeWindow({ existing });
    vi.mocked(axios.delete).mockResolvedValue({ data: { enabled: false } });
    await turnOffNotifications('Mom phone', { thisDevice: true }, win);
    expect(existing.unsubscribe).toHaveBeenCalled();
  });

  it('for another device only tells the server', async () => {
    const existing = { unsubscribe: vi.fn(async () => true) };
    const { win } = fakeWindow({ existing });
    vi.mocked(axios.delete).mockResolvedValue({ data: { enabled: false } });
    await turnOffNotifications('Kitchen', {}, win);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('refreshSubscription', () => {
  it('does nothing until permission was given', async () => {
    expect(await refreshSubscription('Mom phone', fakeWindow().win)).toBe(false);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('hands the server the current subscription when notifications are on', async () => {
    const existing = { options: { applicationServerKey: KEY_BYTES.buffer }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/same', keys: {} }) };
    const { win, subscribe } = fakeWindow({ permission: 'granted', existing });
    vi.mocked(axios.get).mockImplementation(async (url) => ({ data: url.endsWith('/key') ? { publicKey: KEY } : { enabled: true } }));
    vi.mocked(axios.put).mockResolvedValue({ data: {} });
    expect(await refreshSubscription('Mom phone', win)).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    expect(vi.mocked(axios.put).mock.calls[0][1]).toEqual({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/same', keys: {} } });
  });

  it('leaves a device with notifications off alone', async () => {
    const { win } = fakeWindow({ permission: 'granted' });
    vi.mocked(axios.get).mockResolvedValue({ data: { enabled: false } });
    expect(await refreshSubscription('Mom phone', win)).toBe(false);
    expect(axios.put).not.toHaveBeenCalled();
  });
});
