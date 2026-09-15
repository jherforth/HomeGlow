import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const INDEX_CSS = fileURLToPath(new URL('./src/index.css', import.meta.url));

// Plugins run in iframes and link `/index.css` for the theme variables — the
// plugin development guide documents it. Vite bundles src/index.css into a
// hashed asset, so nothing answers that path; emit an unhashed copy at the site
// root for nginx to serve.
//
// Emitted from src/index.css rather than kept as a second file in public/, so
// there is one source and the copy cannot drift from it.
//
// Build only, deliberately. A plugin iframe is loaded from API_BASE_URL, so its
// `/index.css` resolves against the *backend* origin whenever that differs from
// the page's — which is exactly `npm run dev`. The dev server never sees the
// request, and the backend's own handler already answers it there by reading
// the file out of the source tree. In containers API_BASE_URL is empty, the
// iframe is same-origin, and the request lands here instead.
const emitPluginThemeStylesheet = () => ({
  name: 'homeglow-plugin-theme-stylesheet',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'index.css',
      source: readFileSync(INDEX_CSS, 'utf8'),
    });
  },
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const inPackage = (id, pkgName) => {
  const normalized = id.replace(/\\/g, '/');
  const pkg = escapeRegex(pkgName);
  const pattern = new RegExp(`/node_modules/(?:\\.pnpm/[^/]+/node_modules/)?${pkg}(?:/|$)`);
  return pattern.test(normalized);
};

export default defineConfig({
  plugins: [react(), emitPluginThemeStylesheet()],
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
            inPackage(id, 'react-color')
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
