import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

/* ZONA HORARIA FIJA PARA LOS TESTS.
 *
 * Las reglas de fecha de esta app leen la hora LOCAL a propósito: la usa una clínica en Mendoza y
 * lo que importa siempre es el día argentino (`formatTimeAR`, `dateToISO`, la etapa "en atención"
 * de la 0092 anclada a mano a America/Argentina/Buenos_Aires). En la máquina del Director eso pasa
 * solo, porque su reloj YA está en esa zona.
 *
 * En CI no: `ubuntu-latest` corre en UTC. Sin esta línea, cualquier test que cruce el borde del día
 * —una atención marcada a las 21:45, que en UTC ya es el día siguiente— pasa en local y FALLA en la
 * PR, o peor, pasa en los dos lados por casualidad y deja de proteger nada. Se descubrió al escribir
 * `horaDeAtencion` (0102) corriendo la suite con `TZ=UTC` a propósito, que es como conviene probar
 * cualquier regla de fechas nueva.
 *
 * Va en el ámbito del módulo y no en un `setupFiles`: el CLI de vitest carga esta config en su
 * proceso ANTES de forkear los workers, y los workers heredan `process.env`. Puesto en un setup se
 * aplicaría con el worker ya arrancado. No afecta a `vite build`, que no evalúa fechas.
 *
 * El `declare` es porque el repo NO tiene `@types/node` y no vale sumar una dependencia por una
 * línea. Al estar dentro de un módulo, la declaración no se filtra a nada más. */
declare const process: { env: Record<string, string | undefined> }
process.env.TZ = 'America/Argentina/Buenos_Aires'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  /* Versión desde package.json (única fuente de verdad) → constante global __APP_VERSION__.
   *
   * Y EL BUILD SE IDENTIFICA A SÍ MISMO, que es otra cosa. La versión la sacamos a mano al cerrar
   * la jornada, mientras que cada merge a `main` se despliega solo: entre un merge y su tag,
   * `package.json` dice una versión más vieja que la que corre. Eso no es un bug —así funciona el
   * ritual— pero SIN el commit el popover "Acerca de" no queda incompleto: queda MINTIENDO, porque
   * afirma una versión que no es la que el usuario tiene delante. El 2026-09-20 pasó tres veces en
   * una tarde, y las dos veces que hubo que contestar "¿qué está corriendo?" se resolvió bajando el
   * bundle de producción y grepeándolo.
   *
   * `VERCEL_GIT_COMMIT_SHA` la pone Vercel en el build. Fuera de Vercel —`npm run build` local, el
   * CI— no existe y queda 'dev': ahí el dato no serviría igual, porque ese bundle no es el que
   * nadie está usando. */
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    // Producción SIN sourcemaps: no se publica el código fuente original.
    sourcemap: false,
  },
})
