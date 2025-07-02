import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Import your main App component
import './index.css'; // Import your global CSS

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);