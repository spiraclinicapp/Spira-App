import { defineConfig } from '@playwright/test'

/* Config de la fábrica de tutoriales. Edge del sistema (`channel: 'msedge'`): en esta máquina WDAC bloquea
   binarios sin firmar, y Edge corre (probado en T0). `testMatch` apunta SÓLO a los dos specs (`grabar` y
   `verificar`, cada script elige el suyo): con el patrón por defecto, Playwright levantaría también los
   `lib/*.test.ts`, que son del vitest de la app. */
const PUERTO = 5291
const APP = `http://localhost:${PUERTO}`

export default defineConfig({
  testDir: '.',
  testMatch: /(grabar|verificar)\.pw\.ts$/,
  /* Las capturas de referencia que deja la fábrica al grabar (`tutoriales/capturas/<id>/NN.png`): `verificar`
     compara contra ésas. La tolerancia deja pasar lo que cambia solo —la fecha de «Hoy», el «hace 1m» de una
     tarjeta— y no una columna nueva o un botón que se movió. Medido en T7 sobre la captura de 480×270 (129.600
     píxeles): una corrida limpia difiere en 30-55 píxeles; con dos columnas del tablero cambiadas de lugar, en
     ~2.350 (1,8 %). El 0,5 % (~650) queda diez veces arriba del ruido y casi cuatro debajo del cambio real. */
  snapshotPathTemplate: '{testDir}/capturas/{arg}{ext}',
  expect: { toMatchSnapshot: { maxDiffPixelRatio: 0.005, threshold: 0.2 } },
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
