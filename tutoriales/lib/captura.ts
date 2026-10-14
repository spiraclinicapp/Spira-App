import type { Page } from '@playwright/test'
import { achicar } from './mezcla'

/* ============================================================================
   La captura de referencia de un paso: la que deja la fábrica al grabar y la que saca `tutoriales:verificar`
   para comparar (T7, docs/plan-tutoriales.md, «Desactualización»). UN SOLO camino para las dos, así la
   comparación ve cambios de la pantalla y no del proceso.

   Sin los avisos flotantes (`Toast`, marcado con `data-toast`): aparecen y se van según el milisegundo en que se
   saca la foto, así que en una corrida estaban y en otra no, y eso se leía como «la pantalla cambió» (medido en
   T7: el «comprobante N° 1 generado» hacía fallar dos pasos de una corrida limpia). El VIDEO los sigue mostrando:
   esto sólo toca la foto.
   ============================================================================ */

const SIN_AVISOS = '[data-toast] { visibility: hidden !important; }'

/** Saca la captura del paso en `grande` (1536×864) y la deja achicada a 480 px en `chica`. */
export async function capturaDeReferencia(page: Page, grande: string, chica: string): Promise<void> {
  await page.screenshot({ path: grande, style: SIN_AVISOS })
  achicar(grande, 480, chica)
}
