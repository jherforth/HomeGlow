// Push notifications on this device: whether its browser can have them, and
// turning them on and off (server: services/notifications.js; the worker that
// shows them: public/sw.js).
//
// A browser only allows push on a secure page (HTTPS), and an iPhone or iPad
// only from HomeGlow added to the Home Screen and opened from there. Asking
// permission must come straight from a tap.

import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';

export const NOTIFICATION_EVENTS = ['chore.completed', 'chore.allCompleted'];
const WORKER_URL = '/sw.js';

const isAppleMobile = (nav) => /iPad|iPhone|iPod/.test(nav.userAgent || '')
  // iPadOS reports itself as a Mac, but a Mac has no touch screen.
  || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1);

const isInstalled = (win) => win.navigator.standalone === true
  || !!win.matchMedia?.('(display-mode: standalone)').matches;

/**
 * Whether this device can turn notifications on now:
 * - 'ready'          it can
 * - 'insecure'       the page isn't HTTPS (or localhost)
 * - 'install-first'  an iPhone or iPad outside the Home Screen app
 * - 'unsupported'    the browser has no push
 * - 'blocked'        the person said no; only the browser's settings can undo it
 */
export function pushSupport(win = window) {
  if (!win.isSecureContext) return 'insecure';
  const nav = win.navigator;
  const hasPush = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  if (isAppleMobile(nav) && !isInstalled(win)) return 'install-first';
  if (!hasPush) return 'unsupported';
  if (win.Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

// The server's public key, as the bytes PushManager.subscribe wants.
export function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const devicePath = (deviceName) => `${API_BASE_URL}/api/devices/${encodeURIComponent(deviceName)}/notifications`;

/** This device's notifications as the server has them: { enabled, events, members, ... }. */
export async function readDeviceNotifications(deviceName) {
  const { data } = await axios.get(devicePath(deviceName));
  return data;
}

// This browser's subscription to the server's key, made if there isn't one.
// One made for another key (the server was reinstalled) is replaced.
async function subscription(win, publicKey) {
  const registration = await win.navigator.serviceWorker.register(WORKER_URL, { scope: '/' });
  await win.navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let current = await registration.pushManager.getSubscription();
  const currentKey = current?.options?.applicationServerKey;
  if (current && currentKey && !sameBytes(new Uint8Array(currentKey), key)) {
    await current.unsubscribe();
    current = null;
  }
  return current || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Turn notifications on for this device: ask permission (call from a tap),
 * subscribe, and tell the server. Resolves the server's view, or throws an
 * Error whose `reason` is 'blocked' when permission was refused.
 */
export async function turnOnNotifications(deviceName, { events = NOTIFICATION_EVENTS, members = 'all', language } = {}, win = window) {
  const permission = await win.Notification.requestPermission();
  if (permission !== 'granted') {
    throw Object.assign(new Error('Notifications were not allowed'), { reason: 'blocked' });
  }
  const { data: { publicKey } } = await axios.get(`${API_BASE_URL}/api/notifications/key`);
  const sub = await subscription(win, publicKey);
  const { data } = await axios.put(devicePath(deviceName), { subscription: sub.toJSON(), events, members, language });
  return data;
}

/** Change what this device hears about, keeping its subscription. */
export async function updateNotifications(deviceName, changes) {
  const { data } = await axios.put(devicePath(deviceName), changes);
  return data;
}

/**
 * Turn a device's notifications off. On this device, also drop the browser's
 * subscription, so nothing can arrive even if the server still had it.
 */
export async function turnOffNotifications(deviceName, { thisDevice = false } = {}, win = window) {
  const { data } = await axios.delete(devicePath(deviceName));
  if (thisDevice && 'serviceWorker' in win.navigator) {
    const registration = await win.navigator.serviceWorker.getRegistration('/');
    const sub = await registration?.pushManager.getSubscription();
    await sub?.unsubscribe();
  }
  return data;
}

export async function sendTestNotification(deviceName) {
  const { data } = await axios.post(`${devicePath(deviceName)}/test`, {});
  return data;
}

/**
 * On load: a browser can replace its subscription by itself, so when this
 * device has notifications on and permission is still granted, hand the
 * server the current one (the same one changes nothing there). Quiet: it never
 * asks for anything.
 */
export async function refreshSubscription(deviceName, win = window) {
  if (pushSupport(win) !== 'ready' || win.Notification.permission !== 'granted') return false;
  const state = await readDeviceNotifications(deviceName);
  if (!state.enabled) return false;
  const { data: { publicKey } } = await axios.get(`${API_BASE_URL}/api/notifications/key`);
  const sub = await subscription(win, publicKey);
  await axios.put(devicePath(deviceName), { subscription: sub.toJSON() });
  return true;
}
