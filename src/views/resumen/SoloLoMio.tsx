import { InfoTip } from '../../components/InfoTip'

/* ============================================================================
   «Sólo lo mío» / «Lo de todos» — el alternador de ámbito del Resumen, en el renglón del título.

   ── POR QUÉ UN SWITCH Y NO DOS BOTONES ──
   Antes era un `SegmentedControl` de dos opciones —«Lo mío» / «Todo»— suelto ARRIBA del mosaico,
   en un renglón propio que no tenía nada más: un escalón vacío entre el título y los KPIs. Y dos
   botones con el mismo peso leían como dos destinos, cuando en realidad es UN filtro que está
   prendido o apagado.

   ── TRES VERSIONES DEL RÓTULO, Y POR QUÉ QUEDÓ ÉSTA ──
   1. «Sólo lo mío» fijo (2026-10-08): apagado no se entendía que la pantalla mostraba todo — la pista
      gris dice "no activo", no QUÉ estás viendo (lo marcó el Director).
   2. Un rótulo que cambiaba con el estado, «Sólo lo mío» / «Lo de todos» (el mismo día): el critique
      cazó que el lector anunciaba «Lo de todos, no marcado» —al revés— y se le fijó el nombre
      accesible; pero el re-critique del 2026-10-09 marcó el mismo problema A LA VISTA: «Lo de todos»
      al lado de una pista gris se lee «lo de todos: apagado».
   3. LOS DOS RÓTULOS, UNO A CADA LADO de la pista (2026-10-09): «Lo de todos ◯━ Sólo lo mío». La
      pista es la de «Sólo lo mío», con su gris de apagado de siempre, y el lado que manda se lee en
      tinta. Ya no hay una palabra que contradiga a la pista. Los dos textos son los que eligió el
      Director.

   ── ACCESIBILIDAD ──
   El `<button role="switch">` es sólo la pista, con nombre fijo «Sólo lo mío»: se anuncia «Sólo lo
   mío, interruptor, activado/desactivado», y el rótulo visible de su derecha dice lo mismo (WCAG
   2.5.3). Los rótulos se clickean con el mouse para elegir su lado, pero no son paradas de Tab. El ⓘ
   va aparte porque un botón no puede contener otro.

   ── LA PISTA ──
   Mismas medidas que el `StToggle` de Ajustes (40×23, perilla de 18): es el mismo control, y dos
   switches de tamaños distintos en la misma app leen como dos cosas. El color, en cambio, es el
   acento del MÓDULO y no el petróleo fijo de Ajustes: acá el switch vive dentro de Coordinación.
   Apagado va en `--spira-faint` y no en `line-2`, por la misma razón que documenta `StToggle`: la
   pista clara sobre papel se veía fantasma (y no llegaba al 3:1 de WCAG 1.4.11).

   El movimiento de la perilla vive en `.spira-interruptor__*` (tokens.css) y no inline: inline no se
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
  /* LOS DOS RÓTULOS, UNO A CADA LADO (re-critique 2026-10-09). Con un solo rótulo que cambiaba,
     «Lo de todos» al lado de la pista gris se leía como «lo de todos: apagado». Ahora la pista es la de
     «Sólo lo mío» —gris apagado, acento prendido, como cualquier switch— y la perilla va hacia el
     rótulo que está mandando, que se dibuja en tinta.

     El SWITCH es sólo la pista, con nombre fijo «Sólo lo mío»: el lector anuncia «Sólo lo mío,
     interruptor, activado/desactivado», y el rótulo visible de su derecha dice lo mismo (WCAG 2.5.3).
     Los rótulos se pueden clickear con el mouse para elegir ESE lado (clic en «Lo de todos» = ver
     todo, nunca alterna a ciegas), pero no son paradas de Tab: con teclado alcanza el switch. */
  return (
    <div className="spira-ambito">
      <span className="spira-ambito__rotulo" data-activo={!activo} onClick={() => onCambiar(false)}>{ROTULO_TODOS}</span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={ROTULO_MIO}
        onClick={() => onCambiar(!activo)}
        className="spira-ambito__switch spira-no-press"
      >
        <span
          aria-hidden
          className="spira-interruptor__pista"
          style={{ background: activo ? color : 'var(--spira-faint)' }}
        >
          <span className="spira-interruptor__perilla" style={{ left: activo ? 19.5 : 2.5 }} />
        </span>
      </button>
      <span className="spira-ambito__rotulo" data-activo={activo} onClick={() => onCambiar(true)}>{ROTULO_MIO}</span>
      {/* Explica LAS DOS posiciones, cada una con su nombre: quien abre el ⓘ con el switch apagado
          tiene que poder leer qué ganaría prendiéndolo, y viceversa. Lo que enumera es lo que de
          verdad recorta cada tarjeta (ver `ambito.ts`): visitas y reportes por estudio, pedidos y
          tareas por persona. El KPI de pacientes no se filtra, y por eso no se nombra. */}
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
