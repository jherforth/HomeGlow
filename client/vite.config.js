import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/node_modules/react/') ||
            id.includes('\\node_modules\\react\\') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('\\node_modules\\react-dom\\') ||
            id.includes('/node_modules/scheduler/') ||
            id.includes('\\node_modules\\scheduler\\')
          ) {
            return 'react';
          }
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('recharts')) return 'charts';
          if (
            id.includes('react-grid-layout') ||
            id.includes('react-rnd') ||
            id.includes('react-color') ||
            id.includes('hammerjs')
          ) {
            return 'layout';
          }
          if (id.includes('react-big-calendar') || id.includes('moment') || id.includes('cron-parser')) {
            return 'calendar';
          }
          if (id.includes('axios')) return 'api';
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
