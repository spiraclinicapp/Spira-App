import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { Cuenta } from './sesion'

/* ============================================================================
   El guion: la fuente única de un tutorial (docs/plan-tutoriales.md, «El guion»). Del mismo arreglo de pasos
   salen la narración (`dice`), los subtítulos, la transcripción, los capítulos y los clics (`hace`).

   Los selectores van POR ROL Y NOMBRE ACCESIBLE (`p.page.getByRole('button', { name: 'Dispensar' })`), nunca
   por clase CSS: son los que menos cambian y, si cambian, es porque cambió lo que el usuario ve — que es
   justo cuando el video quedó viejo.
   ============================================================================ */

export interface Paso {
  /** Lo que dice la voz. Vacío = paso mudo (una acción sin narración). */
  dice: string
  hace?: (e: Escena) => Promise<void>
  /** Si está, este paso abre un capítulo del reproductor con ese título. */
  capitulo?: string
  /** El cuadro de este paso es el póster del video (si ninguno lo marca, se usa el del primer paso). Se toma
   *  al FINAL del paso (`grabar.ts`), con la acción hecha y la pantalla quieta. Hasta el 2026-10-15 se tomaba a
   *  0,8 s del inicio, y eso dio tres pósters malos: en blanco (un paso que navega, «Conocé Farmacia»), con
   *  «Guardando…» y con un modal a medio abrir (un clic que llega antes de los 0,8 s). */
  poster?: boolean
}

export interface Guion {
  /** El id del catálogo (`src/ayuda/tutoriales.ts`). Minúsculas con guiones. */
  id: string
  /** Una prueba de la fábrica, no un tutorial: no escribe meta ni capturas de referencia. */
  prueba?: boolean
  /**
   * Con qué cuenta del demo entra a la app (`scripts/demo/semilla.mjs`, `CUENTAS`). La sesión es la que deja
   * el reset del demo, sin contraseña (`entrarComo`); un guion sin cuenta graba lo que haya, sin loguear.
   */
  cuenta?: Cuenta
  /** Arma el estado que el guion va a consumir (en el demo, con las RPC reales). Llega en T2/T6. */
  preparar?: (e: Escena) => Promise<void>
  pasos: Paso[]
}

export function guion(id: string, def: Omit<Guion, 'id'>): Guion {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error(`Id de guion inválido: «${id}»`)
  if (def.pasos.length === 0) throw new Error(`El guion «${id}» no tiene pasos`)
  return { id, ...def }
}

/**
 * Lo que un paso puede hacer. Los clics van por `page.mouse` (que el cursor dibujado sigue), con un recorrido
 * en varios tramos para que se vea el movimiento, y una pausa corta antes de apretar: el ojo tiene que llegar
 * al botón antes que el clic.
 */
export class Escena {
  constructor(readonly page: Page) {}

  async irA(url: string) {
    await this.page.goto(url)
    await this.page.waitForLoadState('networkidle').catch(() => {})
  }

  async moverA(locator: Locator) {
    await locator.scrollIntoViewIfNeeded()
    const caja = await locator.boundingBox()
    if (!caja) throw new Error('El elemento no está visible para moverle el mouse')
    await this.page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 22 })
    return caja
  }

  async clic(locator: Locator) {
    /* El clic va por coordenadas (para que el cursor dibujado lo siga), y eso no espera nada, a diferencia de
       `locator.click()`: un botón que todavía estaba deshabilitado —«Marcar lista para retirar» mientras se
       procesa el último escaneo— recibía el clic y no pasaba nada. Se espera a que esté habilitado. */
    await expect(locator).toBeEnabled()
    const caja = await this.moverA(locator)
    await this.page.waitForTimeout(180)
    await this.page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2)
  }

  /** Tipea a ritmo humano (un `fill` instantáneo no se entiende en un video). */
  async escribir(locator: Locator, texto: string) {
    await this.clic(locator)
    await this.page.keyboard.type(texto, { delay: 55 })
  }

  async esperar(ms: number) {
    await this.page.waitForTimeout(ms)
  }
}
