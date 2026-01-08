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
  },
});

