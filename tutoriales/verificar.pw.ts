import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Guion } from './lib/guion'
import { verificarGuion } from './lib/verificar'

/* ============================================================================
   `npm run tutoriales:verificar` — ¿algún tutorial quedó viejo? Un test por tutorial de `guiones/` (las pruebas
   de la fábrica no: no tienen capturas de referencia). Lo corre el cierre de jornada cuando cambió una pantalla
   que tiene tutorial (skill `cierre-jornada`). Si falla, ese tutorial se regraba (`npm run tutoriales:grabar --
   -g <id>`); ninguna PR queda frenada por esto.

   Las capturas se comparan con `expect.soft`: un paso distinto no corta la corrida, así el informe dice TODOS
   los pasos que cambiaron, cada uno con su imagen de diferencias (en `.trabajo/playwright/`).
   ============================================================================ */

const dir = join(dirname(fileURLToPath(import.meta.url)), 'guiones')
const guiones: Guion[] = []
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts')).sort()) {
  const g = (await import(pathToFileURL(join(dir, f)).href)).default as Guion
  if (!g.prueba) guiones.push(g)
}

test.describe.configure({ mode: 'serial' })

for (const g of guiones) {
  test(g.id, async ({ browser, baseURL }) => {
    await verificarGuion(browser, g, {
      baseURL,
      comparar: (captura, nombre, donde) => expect.soft(captura, `${donde}: la pantalla cambió desde la grabación`).toMatchSnapshot(nombre),
    })
  })
}
