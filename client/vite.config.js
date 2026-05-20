import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const inPackage = (id, pkgName) => {
  const normalized = id.replace(/\\/g, '/');
  const pkg = escapeRegex(pkgName);
  const pattern = new RegExp(`/node_modules/(?:\\.pnpm/[^/]+/node_modules/)?${pkg}(?:/|$)`);
  return pattern.test(normalized);
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            inPackage(id, 'react') ||
            inPackage(id, 'react-dom') ||
            inPackage(id, 'scheduler')
          ) {
            return 'react-core';
          }

          if (
            inPackage(id, '@mui/material') ||
            inPackage(id, '@mui/icons-material') ||
            inPackage(id, '@mui/system') ||
            inPackage(id, '@mui/utils') ||
            inPackage(id, '@mui/private-theming') ||
            inPackage(id, '@emotion/react') ||
            inPackage(id, '@emotion/styled') ||
            inPackage(id, '@popperjs/core')
          ) {
            return 'mui';
          }

          if (
            inPackage(id, 'react-grid-layout') ||
            inPackage(id, 'react-rnd') ||
            inPackage(id, 'react-resizable') ||
            inPackage(id, 'react-draggable') ||
            inPackage(id, 'react-color') ||
            inPackage(id, 'hammerjs')
          ) {
            return 'layout';
          }

          if (inPackage(id, 'axios')) return 'api';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
    },
  },
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
