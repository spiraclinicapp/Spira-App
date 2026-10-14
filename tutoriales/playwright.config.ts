import { defineConfig } from '@playwright/test'

/* Config de la fábrica de tutoriales. Edge del sistema (`channel: 'msedge'`): en esta máquina WDAC bloquea
   binarios sin firmar, y Edge corre (probado en T0). `testMatch` apunta SÓLO al spec único: con el patrón por
   defecto, Playwright levantaría también los `lib/*.test.ts`, que son del vitest de la app. */
const PUERTO = 5291
const APP = `http://localhost:${PUERTO}`

export default defineConfig({
  testDir: '.',
  testMatch: /grabar\.pw\.ts$/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: '.trabajo/playwright',
  /* Un selector que ya no existe falla en 20 s nombrando el paso, en vez de colgar la toma hasta el timeout del test. */
  use: { channel: 'msedge', headless: true, baseURL: APP, actionTimeout: 20_000 },
  /* La app contra el proyecto DEMO (`npm run demo:app`, que inyecta las claves del demo y comprueba que no
     apunte a prod). Si ya hay una levantada en ese puerto, se usa ésa: igual la fábrica vuelve a comprobarla
     antes de grabar (`lib/demo.ts`, el cerrojo 3). El 5291 y no el 5290 de `demo:app` a mano: así no le
     pisa la que alguien tenga abierta para mirar. */
  webServer: {
    command: `npm run demo:app -- --port ${PUERTO}`,
    cwd: '..',
    url: APP,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
