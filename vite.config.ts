import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Versión desde package.json (única fuente de verdad) → constante global __APP_VERSION__.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Producción SIN sourcemaps: no se publica el código fuente original.
    sourcemap: false,
  },
})
