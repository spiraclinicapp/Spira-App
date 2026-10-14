import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext } from '@playwright/test'

/* ============================================================================
   Entrar a la app del demo YA LOGUEADO, sin contraseña. Las sesiones las genera `npm run demo:sesion` (y el reset,
   al final de la semilla) en %USERPROFILE%\.spira\demo-sesiones\<cuenta>.json — ver scripts/demo/sesion.mjs.

   No es un `storageState` de Playwright porque la app guarda la sesión en `sessionStorage` (src/lib/supabase.ts),
   y `storageState` sólo lleva cookies y `localStorage`. La receta de Playwright para `sessionStorage` es ésta:
   ponerla con `addInitScript`, que corre antes que cualquier script de la página.

   Sólo si no hay una: el script corre en CADA navegación, y supabase-js reescribe la entrada cuando refresca el
   token. Pisarla con la del archivo devolvería un refresh token ya canjeado.
   ============================================================================ */

export type Cuenta = 'coord' | 'farma' | 'farmaresp' | 'dir'

export async function entrarComo(context: BrowserContext, cuenta: Cuenta): Promise<void> {
  const archivo = join(homedir(), '.spira', 'demo-sesiones', `${cuenta}.json`)
  if (!existsSync(archivo)) throw new Error(`Falta la sesión de «${cuenta}» (${archivo}). Corré npm run demo:sesion.`)
  const { sessionStorage: entradas } = JSON.parse(readFileSync(archivo, 'utf8')) as { sessionStorage: Record<string, string> }
  await context.addInitScript((pares: [string, string][]) => {
    for (const [clave, valor] of pares) {
      if (window.sessionStorage.getItem(clave) === null) window.sessionStorage.setItem(clave, valor)
    }
  }, Object.entries(entradas))
}
