import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { initTimezone } from './utils/timezone.js';

const App = lazy(() => import('./app.jsx'));
const PhotosUpload = lazy(() => import('./pages/PhotosUpload.jsx'));

const renderRoute = () => {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/photos' || path.startsWith('/photos/')) {
    return <PhotosUpload />;
  }
  return <App />;
};

initTimezone().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        {renderRoute()}
      </Suspense>
    </React.StrictMode>
  );
});
