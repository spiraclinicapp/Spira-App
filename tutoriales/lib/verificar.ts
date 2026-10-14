import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { SCRIPT_CURSOR } from './cursor'
import { resetearDemo, verificarAppDelDemo } from './demo'
import { ALTO, ANCHO } from './grabar'
import { Escena } from './guion'
import type { Guion } from './guion'
import { capturaDeReferencia } from './captura'
import { entrarComo } from './sesion'

/* ============================================================================
   ¿El tutorial sigue describiendo la app de hoy? (T7, docs/plan-tutoriales.md, «Desactualización»).

   Corre el guion entero SIN voz ni video, contra el demo recién reseteado, y avisa de dos maneras:
     1. El control ya no existe: el paso falla nombrando el tutorial, el número de paso y lo que dice la voz ahí.
     2. La pantalla cambió: después de cada paso se saca la captura chica (480 px, como al grabar) y se compara
        con la de la última grabación (`tutoriales/capturas/<id>/NN.png`). Una columna nueva o un copy distinto
        marcan el video como viejo aunque los botones se sigan llamando igual.

   La captura pasa por el MISMO camino que al grabar (cursor dibujado, captura de 1536×864, achicada con ffmpeg):
   si no, la comparación vería diferencias del proceso y no de la pantalla.
   ============================================================================ */

const FABRICA = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Lo que sirve del error de Playwright: la primera línea (qué falló) más las que nombran el selector y lo que
 * encontró. Sin los colores de terminal, que en un informe salen como basura. Con el solo encabezado, el aviso
 * decía «toBeEnabled failed» y no QUÉ control había desaparecido (prueba de T7: «Preparar» renombrado).
 */
function resumirError(e: unknown): string {
  const lineas = String((e as Error)?.message ?? e).replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/).map((l) => l.trim())
  const utiles = lineas.filter((l, i) => i === 0 || /^(Locator|Received|Expected|waiting for)/i.test(l))
  return utiles.join(' · ')
}

/** Compara una captura con la de referencia (lo provee el spec: `expect.soft(...).toMatchSnapshot`). */
export type Comparar = (captura: Buffer, nombre: [string, string], donde: string, ruta: string) => void

export async function verificarGuion(browser: Browser, g: Guion, opciones: { baseURL?: string; comparar: Comparar }): Promise<void> {
  if (!opciones.baseURL) throw new Error(`«${g.id}» se verifica contra la app del demo (falta baseURL).`)
  await verificarAppDelDemo(opciones.baseURL)
  resetearDemo()

  const trabajo = join(FABRICA, '.trabajo', 'verificar', g.id)
  rmSync(trabajo, { recursive: true, force: true })
  mkdirSync(trabajo, { recursive: true })

  const ctx = await browser.newContext({ viewport: { width: ANCHO, height: ALTO }, baseURL: opciones.baseURL })
  await ctx.addInitScript(SCRIPT_CURSOR)
  if (g.cuenta) await entrarComo(ctx, g.cuenta)
  const page = await ctx.newPage()
  const escena = new Escena(page)
  try {
    if (g.preparar) await g.preparar(escena)
    for (const [i, paso] of g.pasos.entries()) {
      const nn = String(i + 1).padStart(2, '0')
      const donde = `Tutorial «${g.id}», paso ${i + 1} («${paso.dice.trim() || 'paso mudo'}»)`
      try {
        if (paso.hace) await paso.hace(escena)
      } catch (e) {
        throw new Error(`${donde}: ${resumirError(e)}`)
      }
      const grande = join(trabajo, `paso-${nn}.png`)
      const chica = join(trabajo, `${nn}.png`)
      await capturaDeReferencia(page, grande, chica)
      opciones.comparar(readFileSync(chica), [g.id, `${nn}.png`], donde, chica)
    }
  } finally {
    await ctx.close()
  }
}
