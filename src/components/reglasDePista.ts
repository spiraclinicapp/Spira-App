/* ============================================================================
   Reglas de la PISTA — el cartelito que reemplaza al globo negro del `title` nativo.

   El componente (`Pistas.tsx`) es el que escucha el mouse y dibuja; acá vive lo que decide QUÉ se
   dibuja y DÓNDE, separado porque es justo lo que falla sin que se note (ver `reglasDePista.test.ts`) y
   porque así se prueba sin navegador.

   Spec: `docs/superpowers/specs/2026-10-09-tooltip-propio-design.md` (aprobado el 2026-10-09).
   ============================================================================ */

/**
 * Las tres caras de una pista. Nadie las declara: se deducen de lo que el código ya tiene (la clase
 * del término, el largo del texto, si repite lo que se ve), así un `title` escrito mañana sale bien
 * sin que quien lo escribe sepa que esto existe.
 *   · termino → la palabra subrayada en negrita, arriba, y la definición del glosario abajo.
 *   · rotulo  → una línea compacta: el nombre de un botón de ícono, o un nombre cortado con «…».
 *   · frase   → una explicación de varias líneas, hasta 280 px.
 */
export type FormaPista = 'termino' | 'rotulo' | 'frase'

/** La primera pista espera medio segundo: la mitad que el globo nativo, y lo justo para que cruzar la
 *  pantalla con el mouse no vaya encendiendo carteles por el camino. */
export const DEMORA_MS = 450

/** Si otra pista se cerró hace menos que esto, la siguiente sale YA. Es lo que deja recorrer una fila
 *  de íconos leyéndolos uno por uno, que con el globo nativo —un segundo de espera por ícono— no se
 *  puede. */
export const TIBIA_MS = 400

/** Hay una sola pista en toda la app, así que un id fijo alcanza para el `aria-describedby`. */
export const ID_PISTA = 'spira-pista'

const HUECO = 6
const MARGEN = 8

/**
 * ¿El texto es un rótulo (nombre de un botón) o una oración?
 *
 * Corto, de una línea y sin puntuación de oración. Lo que va entre paréntesis no cuenta: es el atajo
 * de teclado —«Cerrar (Esc)», «Visita anterior (↑)»— y no convierte al rótulo en frase.
 */
export function esRotulo(texto: string): boolean {
  const t = texto.trim()
  if (t.length > 32 || t.includes('\n')) return false
  return !/[.:;]/.test(t.replace(/\([^)]*\)/g, ''))
}

/**
 * Qué cara toma la pista de un elemento, o `null` si no tiene que aparecer.
 *
 * EL `null` DEL NOMBRE ENTERO es la única ayuda que se va a propósito: las listas ponen
 * `title={nombre}` por si el nombre se corta con «…», y el globo nativo lo mostraba igual cuando se
 * leía entero, repitiendo lo que ya está en pantalla. Se compara sin los espacios de los bordes porque
 * el `textContent` de un JSX con saltos de línea los trae.
 */
export function formaDePista(d: { texto: string; esTermino: boolean; textoVisible: string; cortado: boolean }): FormaPista | null {
  const texto = d.texto.trim()
  if (!texto) return null
  if (d.esTermino) return 'termino'
  if (texto === d.textoVisible.trim()) return d.cortado ? 'rotulo' : null
  return esRotulo(texto) ? 'rotulo' : 'frase'
}

/**
 * Dónde va la pista: abajo y centrada sobre el elemento, que es donde aparecía el globo nativo (la
 * gente ya mira ahí) y donde abre el ⓘ de `InfoTip`.
 *
 * Sube SOLO si abajo no entra Y arriba sí: una pista que no entra en ningún lado se queda abajo, que
 * es recortarla por el piso en vez de mandarla por el techo, donde taparía la barra de arriba. Nunca
 * a menos de 8 px de los costados, el mismo margen de `usePopover`.
 */
export function ubicarPista(
  el: { top: number; bottom: number; left: number; width: number },
  pista: { width: number; height: number },
  ventana: { width: number; height: number },
): { top: number; left: number } {
  const abajo = el.bottom + HUECO
  const arriba = el.top - HUECO - pista.height
  const top = abajo + pista.height > ventana.height - MARGEN && arriba >= MARGEN ? arriba : abajo
  const centrada = el.left + el.width / 2 - pista.width / 2
  const left = Math.max(MARGEN, Math.min(centrada, ventana.width - MARGEN - pista.width))
  return { top, left }
}

/** Cuánto esperar antes de abrir: nada si hay una abierta o se cerró una hace un instante (ver
 *  `TIBIA_MS`), medio segundo si no. */
export function demoraDeApertura(ahora: number, ultimoCierre: number, hayAbierta: boolean): number {
  return hayAbierta || ahora - ultimoCierre < TIBIA_MS ? 0 : DEMORA_MS
}

/**
 * Sumar y sacar el id de la pista del `aria-describedby` del elemento SIN pisar el que ya tuviera.
 *
 * Un `setAttribute` a secas le borraría al control su descripción propia mientras el mouse está
 * encima, y un `removeAttribute` al cerrar se la borraría para siempre: el lector de pantalla dejaría
 * de anunciarla y nadie que mire la pantalla se enteraría.
 */
export function sumarId(actual: string | null, id: string): string {
  const ids = (actual ?? '').split(/\s+/).filter(Boolean)
  return ids.includes(id) ? ids.join(' ') : [...ids, id].join(' ')
}

export function quitarId(actual: string | null, id: string): string | null {
  const ids = (actual ?? '').split(/\s+/).filter((x) => x && x !== id)
  return ids.length ? ids.join(' ') : null
}
