/* ============================================================================
   Reglas del FOCO de un diálogo (`Modal.tsx`): adónde va al abrir, qué hace Tab adentro y a quién se le
   devuelve al cerrar. Plan: docs/plan-tutoriales.md, T5a (DD9); cierra el TODO «Core · focus trap».

   Separadas del componente porque fallan sin que se vea: un foco que no vuelve, o que vuelve PISANDO al
   que puso otro, no rompe ninguna pantalla — la deja igual, y el que maneja la app con teclado (o la
   farmacéutica con el lector de códigos) se queda tipeando en el lugar equivocado. Ver
   `reglasDeFoco.test.ts`.
   ============================================================================ */

/** Lo que se puede enfocar con Tab adentro de un diálogo (el mismo criterio que `Drawer`). */
export const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), ' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/**
 * Quién recibe el foco al abrir.
 *
 * PRIMERO, el que ya lo tiene adentro: React aplica los `autoFocus` de los hijos ANTES de que corra el
 * efecto del `Modal`, y más de diez modales ya ponen el foco en su campo así (la nota de una tarea, el código
 * de un medicamento, los kits de IP). Reclamarlo de nuevo se los pisaría. Después, el que pidió quien
 * abre (`initialFocusRef`: el reproductor de tutoriales pone el `<video>`); después, el primer control
 * (el ✕, como el `Drawer`: no destructivo, y el lector anuncia el diálogo); si no hay ninguno, la card.
 */
export function focoInicial(d: { yaAdentro: boolean; pedido: boolean; hayEnfocables: boolean }): 'dejar' | 'pedido' | 'primero' | 'card' {
  if (d.yaAdentro) return 'dejar'
  if (d.pedido) return 'pedido'
  return d.hayEnfocables ? 'primero' : 'card'
}

/**
 * Qué hace un Tab, dado dónde está el foco entre los `total` enfocables (`indice` = su posición, -1 si es
 * la card misma). Sólo actúa en los bordes, para que el foco dé la vuelta en vez de salir por detrás del
 * fondo; en el medio el navegador avanza solo.
 *
 * `afuera`: el foco no está en la card. Si está en OTRA capa (un cajón abierto encima, un desplegable en
 * su portal) no es de este diálogo y no se toca; sólo si quedó suelto (en el `body`) se lo trae adentro.
 */
export function destinoDelTab(d: { total: number; indice: number; shift: boolean; afuera: 'no' | 'suelto' | 'otraCapa' }):
  'primero' | 'ultimo' | 'card' | null {
  if (d.afuera === 'otraCapa') return null
  if (d.total === 0) return 'card'
  if (d.afuera === 'suelto') return d.shift ? 'ultimo' : 'primero'
  if (d.shift && d.indice <= 0) return 'ultimo'
  if (!d.shift && d.indice === d.total - 1) return 'primero'
  return null
}

/**
 * ¿Se le devuelve el foco a quien abrió el diálogo?
 *
 * SÓLO SI QUEDÓ SUELTO: al desmontarse la card, el foco que estaba adentro cae al `body`. Si ya está en
 * otro lado es porque alguien lo puso ahí a propósito, y devolverlo sería robárselo:
 *   · quien cierra lo manda a otro campo — el cajón de dispensación vuelve al escáner al cerrar la
 *     constancia (`DispensacionDrawer`), y un foco devuelto al botón le perdería el próximo disparo;
 *   · se abre otro diálogo en el mismo instante, con su `autoFocus` ya aplicado.
 * Y sólo a un disparador que siga en la página: si era la fila que se acaba de borrar, no hay a quién.
 */
export function devolverFoco(d: { focoSuelto: boolean; disparadorVivo: boolean }): boolean {
  return d.focoSuelto && d.disparadorVivo
}
