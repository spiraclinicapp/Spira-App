import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { usePopover } from '../../components/usePopover'
import { openIpDocument, useEntregasDelEnrolamiento } from '../../data/pharma'
import { entregasDelHistorial } from './historialEntregasModel'
import type { EntregaHistorial } from './historialEntregasModel'

/**
 * El chip «Historial» de la banda de Dispensación y su popover (acceso H1 del handoff
 * `design_handoff_dispensacion_estado`, spec D13). Reemplaza al historial plegado del pie, que sólo
 * contaba los pedidos de ESTA visita: «¿cuándo fue la última entrega?» se pregunta mirando atrás.
 *
 * Vive en la banda y no en el cuerpo: siempre a la vista, y abrirlo no empuja el contenido.
 *
 * SÓLO APARECE SI HAY ALGO QUE MOSTRAR. Un disparador que abre una lista vacía es un botón que
 * miente (mismo criterio que `ActionMenu`): sin entregas en otras visitas del estudio no hay chip.
 *
 * PORTALEADO a `document.body` con `usePopover`: la tarjeta tiene `overflow: hidden` (la banda
 * respeta el redondeo) y recortaría un popover anclado adentro. Cierra con Esc, con el clic afuera y
 * con «Cerrar». Corta la propagación de sus clicks: el portal corta el DOM pero no el árbol de React,
 * y el modal de la visita de abajo también escucha clicks.
 */
export function HistorialEntregas({ enrollmentId, visitId }: { enrollmentId: string; visitId: string }) {
  const q = useEntregasDelEnrolamiento(enrollmentId, visitId)
  const [open, setOpen] = useState(false)
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false), true, 'end')
  const [err, setErr] = useState<string | null>(null)

  const entregas = entregasDelHistorial(q.data ?? [], visitId)
  if (entregas.length === 0) return null

  async function ver(path: string) {
    setErr(null)
    setErr(await openIpDocument(path))
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Entregas de otras visitas"
        style={{ ...chip, background: open ? 'rgba(255, 255, 255, 0.16)' : 'transparent' }}
      >
        <Icon name="history" size={12} stroke={2} />
        Historial
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Entregas de otras visitas"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ ...pop, top: pos.top, left: pos.left }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            {/* «de otras visitas» y no «anteriores»: desde la ficha, en una visita vieja, también
                aparecen las posteriores. */}
            <span style={eyebrow}>Entregas de otras visitas</span>
            <button
              type="button" className="spira-enlace-sobrio spira-no-press" style={{ marginLeft: 'auto' }}
              onClick={() => setOpen(false)}
            >
              Cerrar
            </button>
          </div>
          {err && <div role="alert" style={{ fontSize: 11.5, color: 'var(--spira-acc-deep-danger)', marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {entregas.map((e) => <Entrega key={e.id} e={e} onVer={(p) => void ver(p)} />)}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function Entrega({ e, onVer }: { e: EntregaHistorial; onVer: (path: string) => void }) {
  let ip: ReactNode
  if (e.ip === null) ip = <span style={valor}>Sin entrega</span>
  else if (e.ip.tipo === 'sin_constancia') {
    ip = <span style={valor}>Entregado{e.ip.kits ? ` · ${e.ip.kits} ${e.ip.kits === 1 ? 'kit' : 'kits'}` : ''}</span>
  } else {
    const { nombre, storagePath } = e.ip
    ip = (
      <>
        <span style={{ ...valor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nombre}>{nombre}</span>
        <button type="button" className="spira-enlace-sobrio spira-no-press" onClick={() => onVer(storagePath)} aria-label={`Ver la constancia ${nombre}`}>
          Ver
        </button>
      </>
    )
  }
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 10, background: 'var(--spira-white)', padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: 'var(--spira-ink)' }}>
        <span style={{ fontWeight: 700 }}>{e.visita}</span>
        <span style={{ color: 'var(--spira-ink-soft)' }}>{e.fecha}</span>
        <span className="spira-mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--spira-muted)' }}>N° {e.comprobante}</span>
      </div>
      <div style={fila}>
        <span style={rotulo}>Concomitante</span>
        <span style={valor}>{e.concomitante.length ? e.concomitante.join(' · ') : 'Sin entrega'}</span>
      </div>
      <div style={{ ...fila, marginTop: 4, alignItems: 'center' }}>
        <span style={rotulo}>IP</span>
        {ip}
      </div>
    </div>
  )
}

/* —— estilos ——
   El chip es la píldora outline blanca del mock sobre la banda: borde blanco al 45% y la tinta de
   texto-sobre-acento del tema. El borde va en longhands por la trampa de la abreviada + longhand. */
const chip: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px',
  borderRadius: 'var(--spira-radius-pill)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255, 255, 255, 0.45)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
}

const pop: CSSProperties = {
  position: 'fixed', zIndex: 'var(--spira-z-popover)', width: 320, maxWidth: 'calc(100vw - 16px)',
  maxHeight: 'min(440px, 70vh)', overflowY: 'auto', padding: 11,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line-2)', borderRadius: 12,
  boxShadow: 'var(--spira-shadow-lg)',
}

const eyebrow: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
}

const fila: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 6, fontSize: 11.5 }

/** El rótulo de cada parte. `muted` y no el `faint` del mock: a 9,5px el faint da 3,6:1 sobre blanco. */
const rotulo: CSSProperties = {
  flex: '0 0 84px', fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--spira-muted)',
}

const valor: CSSProperties = { flex: 1, minWidth: 0, color: 'var(--spira-ink-soft)' }
