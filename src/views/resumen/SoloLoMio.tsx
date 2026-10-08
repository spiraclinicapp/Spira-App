import { InfoTip } from '../../components/InfoTip'

/* ============================================================================
   «Sólo lo mío» / «Lo de todos» — el alternador de ámbito del Resumen, en el renglón del título.

   ── POR QUÉ UN SWITCH Y NO DOS BOTONES ──
   Antes era un `SegmentedControl` de dos opciones —«Lo mío» / «Todo»— suelto ARRIBA del mosaico,
   en un renglón propio que no tenía nada más: un escalón vacío entre el título y los KPIs. Y dos
   botones con el mismo peso leían como dos destinos, cuando en realidad es UN filtro que está
   prendido o apagado.

   ── EL RÓTULO DICE LO QUE SE ESTÁ VIENDO, NO EL NOMBRE DEL FILTRO ──
   La primera versión decía «Sólo lo mío» fijo, prendido o apagado. Apagado no se entendía que la
   pantalla mostraba todo (lo marcó el Director, 2026-10-08): la pista gris dice "esto no está
   activo", pero no dice QUÉ estás viendo en su lugar. Por eso el rótulo cambia con el estado:
   prendido «Sólo lo mío», apagado «Lo de todos».

   Los DOS textos se dibujan siempre, apilados en la misma celda del grid, y el que no corresponde
   queda con `visibility: hidden`: así el botón mide lo que el más largo y la pista no se corre al
   alternar — está anclada a la derecha del encabezado, y un control que se desplaza bajo el mouse
   después del clic hace errar el siguiente.

   ── ACCESIBILIDAD ──
   Texto y pista viven en el MISMO `<button role="switch">`: el clic en el rótulo también alterna
   (como el `<label>` de un checkbox) y el nombre accesible sale del texto visible —el oculto no
   cuenta, `visibility: hidden` lo saca del árbol—, así que lo que se lee y lo que se anuncia
   coinciden (WCAG 2.5.3). El ⓘ queda AFUERA porque un botón no puede contener otro.

   ── LA PISTA ──
   Mismas medidas que el `StToggle` de Ajustes (40×23, perilla de 18): es el mismo control, y dos
   switches de tamaños distintos en la misma app leen como dos cosas. El color, en cambio, es el
   acento del MÓDULO y no el petróleo fijo de Ajustes: acá el switch vive dentro de Coordinación.
   Apagado va en `--spira-faint` y no en `line-2`, por la misma razón que documenta `StToggle`: la
   pista clara sobre papel se veía fantasma (y no llegaba al 3:1 de WCAG 1.4.11).

   El movimiento de la perilla vive en `.spira-interruptor` (tokens.css) y no inline: inline no se
   puede apagar con `prefers-reduced-motion`.
   ============================================================================ */

export const ROTULO_MIO = 'Sólo lo mío'
export const ROTULO_TODOS = 'Lo de todos'

export function SoloLoMio({ activo, onCambiar, color }: {
  /** true = ámbito «Lo mío»; false = «Todo». */
  activo: boolean
  onCambiar: (activo: boolean) => void
  /** El acento sólido del módulo: color de la pista prendida. */
  color: string
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        onClick={() => onCambiar(!activo)}
        className="spira-interruptor spira-no-press"
      >
        <span className="spira-interruptor__rotulos">
          <span style={{ visibility: activo ? 'visible' : 'hidden' }}>{ROTULO_MIO}</span>
          <span style={{ visibility: activo ? 'hidden' : 'visible' }}>{ROTULO_TODOS}</span>
        </span>
        <span
          aria-hidden
          className="spira-interruptor__pista"
          style={{ background: activo ? color : 'var(--spira-faint)' }}
        >
          <span className="spira-interruptor__perilla" style={{ left: activo ? 19.5 : 2.5 }} />
        </span>
      </button>
      {/* Explica LAS DOS posiciones, cada una con su nombre: quien abre el ⓘ con el switch apagado
          tiene que poder leer qué ganaría prendiéndolo, y viceversa. Lo que enumera es lo que de
          verdad recorta cada tarjeta (ver `ambito.ts`): visitas y reportes por estudio, pedidos y
          tareas por persona. Los KPIs de protocolos y pacientes no se filtran, y por eso no se
          nombran. */}
      <InfoTip
        titulo="Qué muestra el resumen"
        etiqueta="Qué muestra cada posición del switch"
        cuerpo={
          <>
            <span style={{ display: 'block' }}>
              <b style={negrita}>{ROTULO_MIO}:</b> las visitas de tus estudios, lo que pediste a
              Farmacia y tus tareas.
            </span>
            <span style={{ display: 'block', marginTop: 5 }}>
              <b style={negrita}>{ROTULO_TODOS}:</b> suma lo del resto del equipo en los estudios
              que podés ver.
            </span>
          </>
        }
      />
    </div>
  )
}

const negrita = { fontWeight: 600, color: 'var(--spira-ink)' }
