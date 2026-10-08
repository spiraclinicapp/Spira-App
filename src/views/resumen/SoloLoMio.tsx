import { InfoTip } from '../../components/InfoTip'

/* ============================================================================
   «Sólo lo mío» — el alternador de ámbito del Resumen, en el renglón del título.

   ── POR QUÉ UN SWITCH Y NO DOS BOTONES ──
   Antes era un `SegmentedControl` de dos opciones —«Lo mío» / «Todo»— suelto ARRIBA del mosaico,
   en un renglón propio que no tenía nada más: un escalón vacío entre el título y los KPIs. Y dos
   botones con el mismo peso leían como dos destinos, cuando en realidad es UN filtro que está
   prendido o apagado. Un switch con su nombre dice exactamente eso: «Sólo lo mío», sí o no. Lo
   apagado no necesita nombre propio: es la pantalla sin recortar, lo que la RLS ya deja ver.

   ── EL RÓTULO ES PARTE DEL BOTÓN ──
   Texto y pista viven en el MISMO `<button role="switch">`, así el clic en «Sólo lo mío» también
   alterna (como un `<label>` de un checkbox) y el nombre accesible sale del texto visible, sin un
   `aria-label` que pueda desincronizarse de lo que se lee. El ⓘ queda AFUERA porque un botón no
   puede contener otro.

   ── LA PISTA ──
   Mismas medidas que el `StToggle` de Ajustes (40×23, perilla de 18): es el mismo control, y dos
   switches de tamaños distintos en la misma app leen como dos cosas. El color, en cambio, es el
   acento del MÓDULO y no el petróleo fijo de Ajustes: acá el switch vive dentro de Coordinación.
   Apagado va en `--spira-faint` y no en `line-2`, por la misma razón que documenta `StToggle`: la
   pista clara sobre papel se veía fantasma (y no llegaba al 3:1 de WCAG 1.4.11).

   El movimiento de la perilla vive en `.spira-interruptor` (tokens.css) y no inline: inline no se
   puede apagar con `prefers-reduced-motion`.
   ============================================================================ */

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
        <span>Sólo lo mío</span>
        <span
          aria-hidden
          className="spira-interruptor__pista"
          style={{ background: activo ? color : 'var(--spira-faint)' }}
        >
          <span className="spira-interruptor__perilla" style={{ left: activo ? 19.5 : 2.5 }} />
        </span>
      </button>
      {/* La explicación enumera lo que de verdad recorta cada tarjeta (ver `ambito.ts`): visitas y
          reportes por estudio, pedidos y tareas por persona. Los KPIs de protocolos y pacientes no
          se filtran, y por eso no se nombran. */}
      <InfoTip
        titulo="Sólo lo mío"
        cuerpo="Prendido, el resumen muestra lo tuyo: las visitas de tus estudios, lo que pediste a Farmacia y tus tareas. Apagado, muestra todo lo que tenés permitido ver."
        etiqueta="Qué hace «Sólo lo mío»"
      />
    </div>
  )
}
