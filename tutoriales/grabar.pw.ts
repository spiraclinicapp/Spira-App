import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { test } from '@playwright/test'
import type { Guion } from './lib/guion'
import { grabarGuion } from './lib/grabar'
import { verificarGuion } from './lib/verificar'

/* ============================================================================
   El spec único de la fábrica: un test por guion de `guiones/`. Un `export default guion(...)` suelto no lo
   ejecuta el runner, por eso este archivo los recorre (resultado de la segunda opinión, plan de tutoriales).

   Se llama `.pw.ts` y no `.spec.ts` a propósito: el `vitest` de la app levanta todo `*.spec.ts` del repo y
   reventaría importando Playwright, que no está instalado en la app.

   Grabar uno solo:  npm run tutoriales:grabar -- -g dispensar
   ============================================================================ */

const dir = join(dirname(fileURLToPath(import.meta.url)), 'guiones')
const archivos = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()
const guiones: Guion[] = []
for (const f of archivos) guiones.push((await import(pathToFileURL(join(dir, f)).href)).default as Guion)

test.describe.configure({ mode: 'serial' })

for (const g of guiones) {
  test(g.id, async ({ browser, baseURL }) => {
    const r = await grabarGuion(browser, g, { baseURL })
    console.log(`✓ ${g.id} · ${(r.duracionMs / 1000).toFixed(1)} s · versión ${r.version}\n  ${r.carpeta}`)
    if (g.prueba) return
    /* Las capturas de referencia de `tutoriales:verificar`, recién grabado: se pasa el guion por el MISMO camino
       que después las compara (otro reset del demo, sin voz ni video), y se guardan como las nuevas. */
    const destino = join(dirname(fileURLToPath(import.meta.url)), 'capturas', g.id)
    rmSync(destino, { recursive: true, force: true })
    mkdirSync(destino, { recursive: true })
    await verificarGuion(browser, g, { baseURL, comparar: (_c, [, archivo], __d, ruta) => copyFileSync(ruta, join(destino, archivo)) })
    console.log(`  capturas de referencia en tutoriales/capturas/${g.id}/`)
  })
}
