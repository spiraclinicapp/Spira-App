import { useId } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { usePopover } from '../components/usePopover'
import { useHoverIntent } from '../components/useHoverIntent'
import type { ItemDeVisita } from './track/resumenVisita'

/* ============================================================================
   El listado de procedimientos que se abre al APUNTAR el conteo de la tira.

   ── NO ES UN BOTÓN, y por eso no se disfraza de uno ──
   El conteo se subraya con puntitos y toma `cursor: help`; sin chevrón y sin cápsula, que es lo que
   induce al clic. Mirar qué lleva la visita es una consulta, no una acción: acá no se tilda nada ni
   se abre nada. Por eso el listado tampoco muestra si el procedimiento está realizado — el tilde
   vive en «Reportes pendientes», y mostrarlo acá invitaría a tocarlo donde no se puede.

   ── PERO SÍ ABRE CON EL CLIC ──
   En una tablet no hay `hover`, y apoyarse sólo en el foco es frágil: Safari no siempre se lo da a
   un elemento que no es de formulario. Sin el clic, en tablet el listado no existiría. Abre con
   hover, con foco y con clic; cierra con clic, con Esc, o saliendo con el mouse.

   ── EL CLIC NO LLEGA A LA FILA ──
   En «Visitas del día» la fila entera abre el modal de la visita. El disparador Y EL PANEL frenan la
   propagación: los eventos de React viajan por el árbol de React y no por el DOM, así que un clic
   DENTRO del panel portaleado —elegir texto, scrollear— igual llegaría a la fila y abriría la
   visita. Con `stopPropagation` en los dos, el listado es suyo.

   ── POR QUÉ `usePopover` Y NO UN `position: absolute` ──
   El handoff lo dibuja como una caja absoluta debajo del texto. Ahí se recorta: la fila del día
   tiene `overflow: hidden`, la lista scrollea, y el modal tiene su propio scroll. `usePopover` lo
   portalea a `body` con posición fija, lo da vuelta si no entra abajo y lo reubica al scrollear.
   ============================================================================ */

const ANCHO = 340

export function ProcedimientosTip({ items, variante }: {
  items: readonly ItemDeVisita[]
  /** `fila`: «N proc.». `modal`: «N procedimientos». */
  variante: 'fila' | 'modal'
}) {
  const panelId = useId()
  const { abierto, abrir, cerrar, cerrarConGracia, cancelarCierre, alternar } = useHoverIntent()
  const { triggerRef, popRef, pos } = usePopover<HTMLSpanElement, HTMLDivElement>(abierto, cerrar)

  const n = items.length
  const texto = variante === 'fila' ? `${n} proc.` : `${n} ${n === 1 ? 'procedimiento' : 'procedimientos'}`

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={abierto ? panelId : undefined}
        aria-label={`Lleva ${n} ${n === 1 ? 'procedimiento' : 'procedimientos'}. Ver el listado.`}
        onMouseEnter={abrir}
        onMouseLeave={cerrarConGracia}
        onFocus={abrir}
        onBlur={cerrar}
        onClick={(e) => { e.stopPropagation(); alternar() }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar() }
        }}
        style={disparador}
      >
        <Icon name="clipboardCheck" size={14} color="var(--spira-track)" />
        <span style={{ borderBottom: '1px dotted var(--spira-line-2)' }}>{texto}</span>
      </span>

      {abierto && pos && createPortal(
        <div
          ref={popRef}
          id={panelId}
          role="tooltip"
          onMouseEnter={cancelarCierre}
          onMouseLeave={cerrarConGracia}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ ...panel, top: pos.top, left: pos.left }}
        >
          <div className="spira-eyebrow" style={{ padding: '0 14px 8px' }}>
            Lleva {n} {n === 1 ? 'procedimiento' : 'procedimientos'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 260, overflowY: 'auto' }}>
            {items.map((it) => (
              <div key={it.procedure_id} style={fila}>
                {/* Viñeta y NO una casilla: una casilla dice «esto se tilda», y acá no se tilda. */}
                <span aria-hidden style={vineta} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--spira-ink)' }}>{it.name}</span>
                {it.draws_blood === true && (
                  <Icon name="droplet" size={13} color="var(--spira-danger)" fill="var(--spira-danger)" />
                )}
                {it.esIp && <Icon name="pill" size={13} color="var(--spira-warn)" />}
                {it.tieneReporte && <Icon name="fileText" size={13} color="var(--spira-faint)" />}
              </div>
            ))}
          </div>
          {/* Pie: qué significa cada marca. Sin esto, tres íconos sin rótulo son un acertijo. */}
          <div style={pie}>
            <Leyenda><Icon name="droplet" size={12} color="var(--spira-danger)" fill="var(--spira-danger)" /> extracción</Leyenda>
            <Leyenda><Icon name="pill" size={12} color="var(--spira-warn)" /> kit IP</Leyenda>
            <Leyenda><Icon name="fileText" size={12} color="var(--spira-faint)" /> reporte</Leyenda>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Leyenda({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{children}</span>
}

const disparador: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap',
  cursor: 'help',
}

const panel: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', width: ANCHO,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14,
  boxShadow: 'var(--spira-shadow-md)', padding: '12px 4px 10px',
}

const fila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 14px' }

const vineta: CSSProperties = {
  width: 5, height: 5, borderRadius: '50%', background: 'var(--spira-line-2)', flex: '0 0 auto',
}

const pie: CSSProperties = {
  borderTop: '1px solid var(--spira-line)', margin: '8px 14px 0', paddingTop: 8,
  fontSize: 11.5, color: 'var(--spira-ink-soft)', display: 'flex', gap: 12, flexWrap: 'wrap',
}
