import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app.jsx';
import PhotosUpload from './pages/PhotosUpload.jsx';
import './index.css';
import { initTimezone } from './utils/timezone.js';

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
      {renderRoute()}
    </React.StrictMode>
  );
});
