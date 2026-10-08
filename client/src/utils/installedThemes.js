// Themes installed on the server (Admin → Look → Themes), merged with the
// built-in ones. Each display reads the list from /api/themes and runs every
// installed theme through validateThemePackage, the same check the built-in
// themes pass in the tests; a theme that fails is left out, never partly
// applied. The server only checks structure (services/themeStore.js).
//
// The last list is kept in localStorage, so a display showing an installed
// theme starts in it rather than flashing Classic until the list arrives.
import { useSyncExternalStore } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './apiConfig.js';
import { BUILT_IN_THEMES, DEFAULT_THEME_ID, MANIFEST_VERSION, NEEDS_NEWER_HOMEGLOW, THEME_ASSETS, sortThemes, validateThemePackage } from './themes.js';

const CACHE_KEY = 'homeglow_installed_themes';

/**
 * Built-in themes plus the installed ones that pass validation. An installed
 * theme with a built-in's id replaces it (Reef from the themes repository
 * replaces the Reef in the app), except Classic, which nothing replaces.
 * Asset URLs carry the install time, so a reinstall is never served stale.
 */
export function mergeInstalledThemes(installed, { builtIn = BUILT_IN_THEMES, builtInAssets = THEME_ASSETS, apiBase = API_BASE_URL } = {}) {
  const byId = new Map(builtIn.map((theme) => [theme.id, theme]));
  const assets = { ...builtInAssets };
  const installedIds = [];
  const rejected = [];
  (Array.isArray(installed) ? installed : []).forEach((entry) => {
    const { id, manifest, files, installedAt } = entry || {};
    if (!manifest || manifest.id !== id || id === DEFAULT_THEME_ID) {
      rejected.push({ id, name: manifest?.name || id, errors: ['theme.json does not match its folder'] });
      return;
    }
    const list = Array.isArray(files) ? files : [];
    const errors = validateThemePackage(manifest, { assets: list });
    if (errors.length) {
      if (errors.includes(NEEDS_NEWER_HOMEGLOW)) {
        console.warn(`Theme ${id}: manifestVersion ${manifest.manifestVersion}; this HomeGlow supports up to ${MANIFEST_VERSION}.`);
      }
      rejected.push({ id, name: manifest.name || id, errors, needsNewer: errors.includes(NEEDS_NEWER_HOMEGLOW) });
      return;
    }
    const stamp = encodeURIComponent(installedAt || '');
    assets[id] = Object.fromEntries(list.map((file) => [file, `${apiBase}/api/themes/${id}/${file}?v=${stamp}`]));
    byId.set(id, manifest);
    installedIds.push(id);
  });
  return { themes: sortThemes([...byId.values()]), assets, installedIds, rejected };
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
}

let registry = mergeInstalledThemes(readCache());
const listeners = new Set();

export const getThemeRegistry = () => registry;

export function subscribeThemeRegistry(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(installed) {
  registry = mergeInstalledThemes(installed);
  listeners.forEach((listener) => listener());
}

/** Read the installed list again (at start, and after an install or removal). */
export async function loadInstalledThemes() {
  try {
    const { data } = await axios.get(`${API_BASE_URL}/api/themes`);
    const installed = Array.isArray(data?.themes) ? data.themes : [];
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(installed));
    } catch {
      // The cache only saves a flash of Classic.
    }
    publish(installed);
  } catch (error) {
    console.warn('Could not load installed themes:', error.message);
  }
  return registry;
}

/** { themes, assets, installedIds, rejected }, updated when the list changes. */
export function useThemeRegistry() {
  return useSyncExternalStore(subscribeThemeRegistry, getThemeRegistry);
}

/**
 * A chosen folder's files as { path, file }, relative to the theme folder:
 * the browser names them "reef/assets/kelp.svg", and the server wants
 * "assets/kelp.svg".
 */
export function themeFolderFiles(fileList) {
  const files = Array.from(fileList || []);
  return files.map((file) => {
    const full = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const slash = full.indexOf('/');
    return { path: slash >= 0 ? full.slice(slash + 1) : full, file };
  });
}

/**
 * Check a chosen folder before it is sent: its theme.json, against the files
 * beside it, with the same validator every display runs.
 */
export async function checkThemeFolder(entries) {
  const manifestEntry = entries.find((entry) => entry.path === 'theme.json');
  if (!manifestEntry) return { errors: ['theme.json is missing'] };
  let manifest;
  try {
    manifest = JSON.parse(await manifestEntry.file.text());
  } catch {
    return { errors: ['theme.json is not valid JSON'] };
  }
  const assets = entries.map((entry) => entry.path).filter((path) => /^(assets|fonts)\//.test(path));
  return { manifest, errors: validateThemePackage(manifest, { assets }) };
}
