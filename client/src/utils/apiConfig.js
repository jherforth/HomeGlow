export const getApiUrl = () => {
  if (import.meta.env.MODE === 'development') {
    return import.meta.env.VITE_REACT_APP_API_URL || 'http://localhost:5001';
  }
  return '';
};

export const API_BASE_URL = getApiUrl();
