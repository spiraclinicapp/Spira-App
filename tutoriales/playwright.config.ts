import { defineConfig } from '@playwright/test'

/* Config de la fábrica de tutoriales. Edge del sistema (`channel: 'msedge'`): en esta máquina WDAC bloquea
   binarios sin firmar, y Edge corre (probado en T0). `testMatch` apunta SÓLO al spec único: con el patrón por
   defecto, Playwright levantaría también los `lib/*.test.ts`, que son del vitest de la app. */
export default defineConfig({
  testDir: '.',
  testMatch: /grabar\.pw\.ts$/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: '.trabajo/playwright',
  use: { channel: 'msedge', headless: true },
})
