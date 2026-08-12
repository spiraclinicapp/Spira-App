import type { CSSProperties } from 'react'
import { Modal } from '../../../components/Modal'
import { btnOutline } from '../../../components/buttons'
import { useDispensationHistorial } from '../../../data/pharma'
import type { HistorialEntradaRow } from '../../../data/pharma'
import { formatDateTimeAR } from '../../../lib/dates'

/**
 * Todo lo que le pasó al pedido, leído del `audit_log`.
 *
 * Existe porque la farmacéutica se topa seguido con un pedido que "está raro" —volvió a la cola,
 * tiene un renglón que no pidió, el contador en cero— y hasta ahora la única forma de saber por qué
 * era preguntarle a quien lo tocó. El registro ya estaba; lo que faltaba era una ventana.
 *
 * Muestra QUÉ cambió y CUÁNDO, no el volcado crudo de las dos filas jsonb: el `audit_log` guarda la
 * fila entera antes y después, y pintarla completa sería ilegible. Se listan solo los campos que
 * de verdad cambiaron.
 */
export function ModalHistorial({ requestId, codigo, onClose }: {
  requestId: string
  codigo: string
  onClose: () => void
}) {
  const { data, loading, error } = useDispensationHistorial(requestId)

  return (
    <Modal title={`Historial · ${codigo}`} onClose={onClose} maxWidth={620} icon="clock">
      {loading && <div style={aviso}>Buscando el historial…</div>}
      {error && <div style={{ ...aviso, color: 'var(--spira-danger)' }} role="alert">{error}</div>}

      {!loading && !error && data?.length === 0 && (
        <div style={aviso}>Este pedido todavía no tiene movimientos registrados.</div>
      )}

      {(data?.length ?? 0) > 0 && (
        <ol style={lista}>
          {data?.map((e, i) => <Entrada key={`${e.cuando}-${i}`} e={e} />)}
        </ol>
      )}

      <div style={{ display: 'flex', marginTop: 18 }}>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
      </div>
    </Modal>
  )
}

function Entrada({ e }: { e: HistorialEntradaRow }) {
  const cambios = camposCambiados(e.antes, e.despues)
  return (
    <li style={fila}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
          {ENTIDADES[e.entidad] ?? e.entidad}
        </span>
        <span style={chip}>{ACCIONES[e.accion] ?? e.accion}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--spira-muted)' }}>
          {formatDateTimeAR(e.cuando)} · {e.quien}
        </span>
      </div>

      {cambios.length > 0 && (
        <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {cambios.map((c) => (
            <div key={c.campo} style={cambio}>
              <span style={{ color: 'var(--spira-muted)' }}>{c.campo}</span>
              <span className="spira-mono" style={{ color: 'var(--spira-faint)' }}>{c.antes}</span>
              <span style={{ color: 'var(--spira-faint)' }}>→</span>
              <span className="spira-mono" style={{ color: 'var(--spira-ink)' }}>{c.despues}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  )
}

/** Nombres de tabla → castellano. Lo que la farmacéutica lee no puede ser el schema. */
const ENTIDADES: Record<string, string> = {
  dispensation_requests: 'Solicitud',
  dispensation_request_items: 'Renglón',
  dispensation_ip_documents: 'Constancia del IRT',
  dispensations: 'Dispensación',
}

const ACCIONES: Record<string, string> = {
  INSERT: 'creado', UPDATE: 'modificado', DELETE: 'eliminado',
}

/** Campos internos que no le dicen nada a nadie en una lista de cambios. */
const OCULTOS = new Set(['id', 'created_at', 'updated_at', 'request_id', 'visit_id'])

/**
 * Qué cambió de verdad entre las dos filas.
 *
 * El `audit_log` guarda la fila ENTERA antes y después; sin este diff, un cambio de una columna se
 * vería como treinta líneas idénticas y una distinta perdida en el medio.
 */
function camposCambiados(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
): { campo: string; antes: string; despues: string }[] {
  if (!despues) return []
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues)])
  const out: { campo: string; antes: string; despues: string }[] = []
  for (const k of claves) {
    if (OCULTOS.has(k)) continue
    const a = antes?.[k]
    const d = despues[k]
    if (JSON.stringify(a) === JSON.stringify(d)) continue
    out.push({ campo: k, antes: mostrar(a), despues: mostrar(d) })
  }
  return out
}

function mostrar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v
  return String(v)
}

const aviso: CSSProperties = {
  fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 4,
}

const lista: CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', flexDirection: 'column', gap: 1,
  maxHeight: '52vh', overflowY: 'auto',
}

const fila: CSSProperties = {
  padding: '10px 0', borderBottom: '1px solid var(--spira-line)',
}

const chip: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--spira-radius-pill)',
  background: 'var(--spira-surface)', color: 'var(--spira-muted)',
}

const cambio: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 11.5, flexWrap: 'wrap',
}
