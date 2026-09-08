import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // The Express server runs Vite in middleware mode. Disabling HMR avoids
      // a fixed WebSocket port collision when more than one dev process starts.
      hmr: false,
      watch: null,
    },
  };
});
