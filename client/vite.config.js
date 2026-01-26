import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: '0.0.0.0',
    watch: {
      usePolling: true, // Required for Docker volume mounts
    },
    hmr: {
      host: 'localhost', // Change this to your server IP if accessing remotely
      port: 3001,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_REACT_APP_API_URL || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/Uploads': {
        target: process.env.VITE_REACT_APP_API_URL || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

