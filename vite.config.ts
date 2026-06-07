import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Producción SIN sourcemaps: no se publica el código fuente original.
    sourcemap: false,
  },
})
