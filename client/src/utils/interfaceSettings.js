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
export const VACATION_MODE_STORAGE_KEY = 'vacationModeSettings';
export const WEEK_START_STORAGE_KEY = 'weekStartsOn';
// Broadcast so an open calendar re-reads the setting without a page reload.
export const WEEK_START_UPDATED_EVENT = 'homeglow:week-start-updated';

// Which day a week begins on, as a JS day index (0 = Sunday). Deliberately an
// explicit setting rather than being derived from the language (issue #137):
// households disagree with their locale often enough — and it reflows the whole
// calendar grid — that guessing it from `es` or `en-GB` would surprise people.
export const DEFAULT_WEEK_START = 0;
export const WEEK_START_OPTIONS = [0, 1, 6]; // Sunday, Monday, Saturday

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

// Vacation mode (issue #121): mutes chore due-time sounds and swaps the
// screensaver for the vacation-emoji one. startDate/endDate are reserved for a
// future date-range version; the MVP is a simple toggle.
export const DEFAULT_VACATION_MODE_SETTINGS = {
  enabled: false,
  startDate: '',
  endDate: '',
  muteSounds: true,
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

export const normalizeVacationModeSettings = (raw) => ({
  ...DEFAULT_VACATION_MODE_SETTINGS,
  ...(raw && typeof raw === 'object' ? raw : {}),
});

// Whether vacation mode applies right now: enabled, and today falls inside the
// optional date range (empty dates = unbounded). Local 'YYYY-MM-DD' comparison
// mirrors the server's isVacationActiveOn, and gives bounded vacations
// client-side auto-expiry — chimes and the vacation screensaver come back on
// their own the day after endDate.
export const isVacationModeActiveToday = (settings, today = null) => {
  if (!settings || settings.enabled !== true) return false;
  const d = today || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  })();
  if (settings.startDate && d < settings.startDate) return false;
  if (settings.endDate && d > settings.endDate) return false;
  return true;
};

export const readLocalVacationModeSettings = () => {
  try {
    const raw = localStorage.getItem(VACATION_MODE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VACATION_MODE_SETTINGS };
    return normalizeVacationModeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_VACATION_MODE_SETTINGS };
  }
};

export const normalizeWeekStart = (raw) => {
  const value = Number(raw);
  return WEEK_START_OPTIONS.includes(value) ? value : DEFAULT_WEEK_START;
};

export const readLocalWeekStart = () => {
  try {
    return normalizeWeekStart(localStorage.getItem(WEEK_START_STORAGE_KEY));
  } catch {
    return DEFAULT_WEEK_START;
  }
};

export const writeLocalWeekStart = (value) => {
  try {
    localStorage.setItem(WEEK_START_STORAGE_KEY, String(normalizeWeekStart(value)));
  } catch {
    // Storage unavailable (private mode); the setting simply won't persist.
  }
};
