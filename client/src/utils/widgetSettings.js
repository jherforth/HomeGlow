export const BASE_WIDGET_SETTINGS = {
  chores: { enabled: false },
  calendar: { enabled: false },
  photos: { enabled: false },
  weather: { enabled: false },
};

export const normalizeWidgetSettings = (raw, defaults = BASE_WIDGET_SETTINGS) => ({
  ...defaults,
  ...(raw && typeof raw === 'object' ? raw : {}),
  chores: { ...defaults.chores, ...(raw?.chores || {}) },
  calendar: { ...defaults.calendar, ...(raw?.calendar || {}) },
  photos: { ...defaults.photos, ...(raw?.photos || {}) },
  weather: { ...defaults.weather, ...(raw?.weather || {}) },
});
