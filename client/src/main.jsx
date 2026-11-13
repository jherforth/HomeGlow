import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import { initTimezone, watchServerTimezone } from './utils/timezone.js';
import { initI18n, getStoredLanguage } from './i18n/index.js';
import { API_BASE_URL } from './utils/apiConfig.js';
import { applyHouseholdPoints, POINTS_NAME_SETTING, POINTS_ICON_SETTING } from './utils/points.js';
import { installStaleBuildReload } from './utils/staleBuild.js';
import { initDisplayDim } from './utils/displayDim.js';

// A display open across an update reloads into the new build the first time
// it fails to load a part the update removed.
installStaleBuildReload(window, { base: import.meta.env.BASE_URL });

// Wall kiosk panels can be dimmed below the hardware backlight floor via
// the appearance settings (household default plus per-display override);
// kiosk URL parameters (?dim=0.6 etc.) still override per-field for this
// session. See utils/displayDim.js.
initDisplayDim();

// The household settings the first render needs: the default language, and
// what chore points are called (so a renamed currency doesn't flash the
// default). Failing to reach the server just means defaults.
const fetchStartupSettings = async () => {
  try {
    const { data } = await axios.get(`${API_BASE_URL}/api/settings`, {
      params: { keys: ['default_language', POINTS_NAME_SETTING, POINTS_ICON_SETTING].join(',') },
    });
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

// A display that has never chosen a language starts in the household default,
// if an admin set one; after that the device's own choice always wins. With
// neither, browser detection decides.
const resolveInitialLanguage = (household) => {
  const stored = getStoredLanguage();
  if (stored) return stored;
  const value = household.default_language;
  return typeof value === 'string' && value ? value : undefined;
};

const App = lazy(() => import('./app.jsx'));
const PhotosUpload = lazy(() => import('./pages/PhotosUpload.jsx'));

const renderRoute = () => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/photos' || path.startsWith('/photos/')) {
    return <PhotosUpload />;
  }
  return <App />;
};

// Both must settle before the first render: timezone drives date math, and
// i18n drives every visible string — rendering first would flash English.
Promise.all([
  initTimezone().catch(() => {}),
  fetchStartupSettings().then(async (household) => {
    const i18n = await initI18n({ initialLanguage: resolveInitialLanguage(household) });
    applyHouseholdPoints(i18n, household);
  }).catch((error) => {
    console.error('i18n failed to initialize; falling back to raw keys:', error);
  }),
]).finally(() => {
  // Follow a time zone changed from another display's Admin Panel.
  watchServerTimezone();
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        {renderRoute()}
      </Suspense>
    </React.StrictMode>
  );
});
