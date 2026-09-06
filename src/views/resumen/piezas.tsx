import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'

/**
 * Las piezas compartidas del mosaico del Resumen de Coordinación: la caja de una tarjeta, la fila a
 * ancho completo, el tope de filas y el chip de destino.
 *
 * VIVÍAN DENTRO DE `TrackResumenView.tsx` y salieron cuando `TareasCard` pasó a ser un archivo
 * propio: una tarjeta en otro archivo que las necesite tendría que importarlas de la vista, y la
 * vista importa la tarjeta — un ciclo. Acá no hay ciclo posible porque este módulo no importa
 * ninguna tarjeta.
 *
 * Es un movimiento, no un rediseño: los valores y los comentarios son los mismos que tenían.
 */

/** La caja de una tarjeta del mosaico. El padding de 20px es el que cancelan las filas. */
export const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}

export const cardTitle: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16,
}

/* Fila a ancho completo de la tarjeta: los márgenes negativos cancelan el padding horizontal
   (20px) para que el resaltado del hover llegue a los bordes en vez de flotar adentro con una
   franja de aire a los costados. Es el patrón del handoff y el mismo que ya usan otras listas.
   El separador de arriba es de la fila, así que la fila NO se levanta (`.spira-no-press`):
   moverla partiría esa línea de 1px. Sin radio por lo mismo.

   ⚠️ EL ANCHO ES `calc(100% + 40px)` Y NO `100%`. NO LO "SIMPLIFIQUES": con un ancho explícito el
   margen negativo DERECHO queda INERTE. El izquierdo corre la caja 20px; el derecho no puede
   ensancharla, porque un margen negativo derecho sólo tira del contenido que viene DESPUÉS, no
   estira una caja de ancho fijo. Con `100%` la fila arrancaba pegada al borde izquierdo y terminaba
   40px antes del derecho: todo el contenido de la tarjeta se leía corrido hacia la izquierda.

   Estuvo así en producción desde el 2026-09-01 y pasó dos reviews, porque las tres declaraciones
   —`width`, `margin`, `padding`— se ven correctas por separado. Lo cazó el Director de un vistazo:
   la banda teñida de `AlertCardHeader` NO declara ancho, así que sangra pareja, y el desajuste
   contra las filas de abajo es el síntoma visible. Se confirma midiendo los DOS lados
   (`getBoundingClientRect` de la fila contra el de la tarjeta): tienen que dar iguales.

   Sacar el `width` también funcionaría para los `<div>`, pero los pies son `<button>` y ahí hace
   falta el ancho explícito. El `calc` sirve para los dos. */
export const filaAncha: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 11, width: 'calc(100% + 40px)',
  margin: '0 -20px', padding: '11px 20px',
  borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  textAlign: 'left', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
}

/**
 * Cuántas filas muestra una tarjeta antes de mandar el resto al pie.
 *
 * Tres es el número que pidió el Director, y tiene una razón que se ve en pantalla: con varias
 * tarjetas en el mosaico, la que se estira decide el alto de su columna y empuja a la de abajo
 * fuera de vista. Tres filas dejan las tarjetas comparables de un vistazo, que es lo que un resumen
 * tiene que dar; lo que no entra NO se esconde — cada pie dice cuántas faltan y cómo verlas.
 */
export const MAX_FILAS = 3

/**
 * El rótulo del destino que aparece al apuntar (o al enfocar con Tab) una tarjeta o el pie
 * "Ver todo": el nombre real del submódulo + flecha, deslizando 4px desde la izquierda.
 *
 * El movimiento y el disparo viven en CSS (`.spira-dest` / `.spira-dest-group`), NO en
 * `onMouseEnter` como el mock del handoff: escribir el realce desde un handler es el gotcha de la
 * casa, y además un handler no tiene `:focus-visible`, así que con teclado no se vería nunca.
 *
 * `aria-hidden` porque es decoración: a dónde lleva ya lo dice el `aria-label` del contenedor, que
 * es lo que anuncia el lector de pantalla. Duplicarlo lo haría leer el destino dos veces.
 */
export function ChipDestino({ nombre }: { nombre: string }) {
  return (
    <span
      className="spira-dest"
      aria-hidden="true"
      style={{ fontSize: 12, fontWeight: 700, color: 'var(--spira-acc-deep-track)' }}
    >
      {nombre}
      <Icon name="arrowRight" size={12} stroke={2.4} />
    </span>
  )
}
