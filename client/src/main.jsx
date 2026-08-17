import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import { initTimezone } from './utils/timezone.js';
import { initI18n, getStoredLanguage } from './i18n/index.js';
import { API_BASE_URL } from './utils/apiConfig.js';

// A display that has never chosen a language starts in the household default,
// if an admin set one; after that the device's own choice always wins. Failing
// to reach the server just means falling back to browser detection.
const resolveInitialLanguage = async () => {
  const stored = getStoredLanguage();
  if (stored) return stored;
  try {
    const { data } = await axios.post(`${API_BASE_URL}/api/settings/search`, ['default_language']);
    const value = data && data.default_language;
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
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
  resolveInitialLanguage().then((initialLanguage) => initI18n({ initialLanguage })).catch((error) => {
    console.error('i18n failed to initialize; falling back to raw keys:', error);
  }),
]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        {renderRoute()}
      </Suspense>
    </React.StrictMode>
  );
});
