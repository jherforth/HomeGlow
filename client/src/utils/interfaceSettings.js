// Single source of truth for the "interface" settings that live in localStorage:
// interface colors, screensaver settings, and auto-dark-mode settings.
//
// These readers/normalizers were previously copy-pasted in both app.jsx (which
// reads them on mount) and AdminPanel.jsx (which reads and writes them). Keeping
// two copies risked the storage keys / defaults / normalization drifting apart —
// this module removes that risk. Widget settings and theme readers intentionally
// stay in their respective files (they differ between the two).

export const INTERFACE_COLORS_STORAGE_KEY = 'interfaceColors';
export const SCREENSAVER_SETTINGS_STORAGE_KEY = 'screensaverSettings';
export const AUTO_DARK_MODE_SETTINGS_STORAGE_KEY = 'autoDarkModeSettings';

export const DEFAULT_INTERFACE_COLORS = {
  primary: '#f5f5f5',
  secondary: '#38bdf8',
  accent: '#f472b6',
};

export const DEFAULT_SCREENSAVER_SETTINGS = {
  enabled: false,
  mode: 'tabs',
  timeout: 5,
  slideshowInterval: 10,
};

export const DEFAULT_AUTO_DARK_MODE_SETTINGS = {
  enabled: false,
  locationQuery: '',
  lat: null,
  lon: null,
  resolvedName: '',
};

export const normalizeInterfaceColors = (raw) => ({
  ...DEFAULT_INTERFACE_COLORS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

export const normalizeScreensaverSettings = (raw) => ({
  ...DEFAULT_SCREENSAVER_SETTINGS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

export const normalizeAutoDarkModeSettings = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
  }

  return {
    ...DEFAULT_AUTO_DARK_MODE_SETTINGS,
    ...raw,
    locationQuery: (raw.locationQuery || '').trim(),
    lat: typeof raw.lat === 'number' ? raw.lat : null,
    lon: typeof raw.lon === 'number' ? raw.lon : null,
    resolvedName: raw.resolvedName || '',
  };
};

export const readLocalInterfaceColors = () => {
  try {
    const raw = localStorage.getItem(INTERFACE_COLORS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INTERFACE_COLORS };
    return normalizeInterfaceColors(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_INTERFACE_COLORS };
  }
};

export const readLocalScreensaverSettings = () => {
  try {
    const raw = localStorage.getItem(SCREENSAVER_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCREENSAVER_SETTINGS };
    return normalizeScreensaverSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SCREENSAVER_SETTINGS };
  }
};

export const readLocalAutoDarkModeSettings = () => {
  try {
    const raw = localStorage.getItem(AUTO_DARK_MODE_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
    return normalizeAutoDarkModeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUTO_DARK_MODE_SETTINGS };
  }
};
