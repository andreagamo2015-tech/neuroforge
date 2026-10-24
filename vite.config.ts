/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { serviceWorker } from './sw-plugin';

// base './' permite publicar en subrutas (GitHub Pages, etc.) sin configuración extra.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), serviceWorker()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
