import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * `VITE_*` values of the repo-root `.env` (the one the API reads), for those that
 * `apps/web/.env*` and the shell don't set: those win, so `.env.demo` still empties
 * `VITE_API_URL` in demo mode.
 */
function rootEnvDefines(mode: string): Record<string, string> {
  const webEnv = loadEnv(mode, import.meta.dirname, 'VITE_');
  const rootEnv = loadEnv(
    mode,
    path.resolve(import.meta.dirname, '../..'),
    'VITE_',
  );
  return Object.fromEntries(
    Object.entries(rootEnv)
      .filter(([key]) => !(key in webEnv))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  );
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Serve from a sub-path when set (the demo on GitHub Pages: `/<repo>/`).
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // The backend-less demo (`--mode demo`) serves and emits the MSW worker script.
    {
      ...msw({ mode: 'worker-only' }),
      apply: (_, { mode }) => mode === 'demo',
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: rootEnvDefines(mode),
}));
