import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { formatBytes, openIpDocument } from '../../data/pharma'
import type { IpDocumentRow } from '../../data/pharma'
import { formatDateTimeAR } from '../../lib/dates'
import type { Comprobante } from './comprobanteModel'

/* El comprobante de un pedido de la visita: variante C («Ticket») del handoff
   `design_handoff_dispensacion_estado`. Papel blanco, N° grande, sello a la derecha y las dos
   partes de la entrega —concomitante e IP— separadas por el filete punteado: es UNA entrega, con un
   número y un estado, y el IP es un renglón más de ella.

   La geometría sale del mock; el color y la tipografía, de los tokens vivos (el mock trae la paleta
   vieja). Las reglas —qué número, qué palabra, qué enlace— viven en `comprobanteModel.ts`, con test:
   acá sólo se dibuja. Los renglones los arma el panel, que es donde vive el estado de edición. */

/** Rótulo de sección: `ink-soft` y no el `faint` del mock, que da 3,6:1 sobre blanco a 10,5px. */
const eyebrow: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)',
}

const seccion: CSSProperties = { borderTop: '1px dashed var(--spira-line-2)', padding: '10px 12px' }

/** Un renglón del ticket: sin caja propia (el papel ya es la caja), nombre con `…` y cantidad en mono. */
export const renglonTicket: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 24, fontSize: 12.5, color: 'var(--spira-ink)',
}

/** El nombre de un renglón: se corta con puntos suspensivos, la cantidad nunca. */
export const nombreTicket: CSSProperties = {
  flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

export function ComprobanteTicket({ c, concomitante, ip, onEnlace, busy }: {
  c: Comprobante
  /** Los renglones de medicación del pedido. `null` = el pedido no lleva concomitante. */
  concomitante: ReactNode | null
  /** La parte del producto en investigación. `null` = el pedido no lleva IP. */
  ip: ReactNode | null
  /** Lo que hace el enlace del pie (`c.enlace`). `null` = sin pie. */
  onEnlace: (() => void) | null
  busy: boolean
}) {
  return (
    <div style={{ background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px 9px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={eyebrow}>Comprobante</div>
          {/* Texto seleccionable y no un badge: el número se canta en el mostrador. */}
          {c.numero !== null ? (
            <div className="spira-mono" style={{ fontSize: 20, fontWeight: 500, marginTop: 2, color: 'var(--spira-ink)' }}>
              N° {c.numero}
            </div>
          ) : (
            // Sin número hasta que Farmacia lo emite: el correlativo de una preparación cancelada queda
            // reservado para un papel que nunca salió (`comprobanteModel`).
            <div style={{ fontSize: 13, color: 'var(--spira-muted)', marginTop: 4 }}>Sin número todavía</div>
          )}
        </div>
        {/* El sello: color PROFUNDO del estado de fondo y `--spira-white` de tinta. El mock pone
            blanco sobre el color base, que da 4,0:1 en verde y 3,4:1 en ámbar; con los profundos da
            5,7–7,0:1, y en oscuro los dos tokens se invierten solos (el profundo se aclara y
            `--spira-white` pasa a ser la card oscura). Ícono + palabra: nunca sólo color. */}
        <span
          style={{
            flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
            borderRadius: 'var(--spira-radius-pill)', background: c.sello.color, color: 'var(--spira-white)',
            fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}
        >
          <Icon name={c.sello.icono} size={13} stroke={2.6} />
          {c.sello.label}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', padding: '0 12px 10px' }}>{c.contexto}</div>

      {concomitante && (
        <div style={seccion}>
          <div style={{ ...eyebrow, marginBottom: 7 }}>Concomitante</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{concomitante}</div>
        </div>
      )}

      {ip && (
        <div style={seccion}>
          <div style={{ ...eyebrow, marginBottom: 7 }}>Producto en investigación</div>
          {ip}
        </div>
      )}

      {c.enlace && onEnlace && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderTop: '1px solid var(--spira-line)' }}>
          <button type="button" className="spira-enlace-sobrio spira-no-press" disabled={busy} onClick={onEnlace} style={{ minHeight: 16 }}>
            <Icon name={c.enlace === 'corregir' ? 'pencil' : 'x'} size={12} stroke={2} />
            {c.enlace === 'corregir' ? 'Corregir esta entrega' : 'Cancelar solicitud'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * La constancia del IP adentro del ticket: un renglón con el archivo y «Ver», y debajo el peso, cuándo
 * se cargó y, si ya se entregó, los kits. Reemplaza a la vista previa de 140px que usaba la sección:
 * en el comprobante lo que se lee es QUÉ papel es; para leerlo entero está «Ver».
 *
 * «cargada» y no «firmada», como dice el mock: la base no sabe si una constancia está firmada. Y sin
 * «quién la subió»: `uploaded_by` es un uuid y Coordinación no puede leer `users` (pendiente del spec).
 */
export function ConstanciaEnTicket({ doc, kits, reemplazo }: {
  doc: IpDocumentRow
  /** Kits entregados (sólo con la entrega hecha). */
  kits: number | null
  /** El enlace «Reemplazar» / «No reemplazar», sólo sobre un pedido que todavía la acepta. */
  reemplazo: { activo: boolean; onToggle: () => void } | null
}) {
  const [err, setErr] = useState<string | null>(null)
  async function ver() {
    setErr(null)
    setErr(await openIpDocument(doc.storage_path))
  }
  const deKits = kits ? ` · ${kits} ${kits === 1 ? 'kit' : 'kits'}` : ''
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: 'var(--spira-ink)' }}>
        <Icon name="fileText" size={15} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        <span style={nombreTicket} title={doc.file_name}>{doc.file_name}</span>
        <button type="button" className="spira-enlace-sobrio spira-no-press" onClick={() => void ver()} aria-label={`Ver la constancia ${doc.file_name}`}>
          <Icon name="eye" size={13} />
          Ver
        </button>
        {reemplazo && (
          <button type="button" className="spira-enlace-sobrio spira-no-press" onClick={reemplazo.onToggle}>
            {reemplazo.activo ? 'No reemplazar' : 'Reemplazar'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 4, paddingLeft: 24 }}>
        {formatBytes(doc.size_bytes)} · cargada {formatDateTimeAR(doc.uploaded_at)}{deKits}
      </div>
      {err && <div role="alert" style={{ fontSize: 11.5, color: 'var(--spira-acc-deep-danger)', marginTop: 6, paddingLeft: 24 }}>{err}</div>}
    </div>
  )
}
