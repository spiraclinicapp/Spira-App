import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'
import { fromNow, durationShort } from '../../lib/dates'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * Fila sobria de un paciente ya atendido por el médico. Atenuada a propósito (identidad en tono
 * `faint`) para que la sección "Atendidos" no compita visualmente con "Faltan atender".
 */
export function AttendedRow({ visit, busy, onUndo, onOpenPatient }: {
  visit: DayVisitRow
  busy: boolean
  /** Deshacer (vuelve a pendiente). Capacidad existente antes del rediseño; discreta a propósito. */
  onUndo: () => void
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  return (
    <div style={row}>
      <div style={leftBlock}>
        <div style={attendedLabel}>
          <Icon name="check" size={13} color="var(--spira-good)" />
          Atendido
        </div>
        <div style={sinceLabel}>{fromNow(visit.doctor_seen_at ?? '')}</div>
      </div>

      <div className="spira-link-group" style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>
            {visit.patient_code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          <span className="spira-mono" style={{ ...protocolPill, color: 'var(--spira-muted)' }}>
            {visit.protocol_code}
          </span>
        </div>
        <div style={identityLine}>
          <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
            {visit.patient_name}
          </PatientLink>
          {/* `identityLine` es texto corrido, no flex (tiene su propio `text-overflow: ellipsis` y
              volverlo flex se lo rompería) — así que el aire de 8px no puede venir de un `gap` de
              contenedor como en el resto de las pantallas. JSX además se come el salto de línea
              entre `</PatientLink>` y `<PatientLinkArrow />` (es whitespace-only entre dos tags, no
              inserta ni un espacio), y sin el `marginLeft` la flecha queda pegada a la última letra
              del nombre. El margen va en este `<span>` envolvente y no en `PatientLinkArrow` porque
              esa flecha la usan también contenedores flex, donde el gap YA reserva el hueco. */}
          {onOpenPatient && <span style={{ marginLeft: 8 }}><PatientLinkArrow /></span>}
          {visit.doctor_motivo ? ` · ${visit.doctor_motivo}` : ''}
        </div>
      </div>

      <div style={sideBlock}>
        <div style={sideLabel}>Atendido por</div>
        <div style={sideValue}>{visit.treating_physician || '—'}</div>
      </div>

      <div style={{ ...sideBlock, borderLeft: '1px solid var(--spira-line)', paddingLeft: 16 }}>
        <div style={sideLabel}>Esperó</div>
        <div style={sideValue}>{durationShort(visit.wants_doctor_at, visit.doctor_seen_at)}</div>
      </div>

      <button
        type="button" onClick={onUndo} disabled={busy} title="Deshacer: vuelve a pendiente"
        style={{ ...undoBtn, opacity: busy ? 0.5 : 1, cursor: busy ? 'default' : 'pointer' }}
      >
        {busy ? '…' : 'Deshacer'}
      </button>
    </div>
  )
}

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14,
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)',
  borderRadius: 14, padding: '12px 14px', marginBottom: 10,
}
const leftBlock: CSSProperties = { flex: '0 0 auto', width: 92, textAlign: 'center' }
const attendedLabel: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  fontSize: 13, fontWeight: 700, color: 'var(--spira-acc-deep-good)',
}
const sinceLabel: CSSProperties = { fontSize: 11, color: 'var(--spira-muted)', marginTop: 2 }
const protocolPill: CSSProperties = {
  fontSize: 10.5, background: 'var(--spira-line)', padding: '1px 8px',
  borderRadius: 'var(--spira-radius-pill)',
}
const identityLine: CSSProperties = {
  fontSize: 12, color: 'var(--spira-muted)', marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const sideBlock: CSSProperties = { flex: '0 0 auto', textAlign: 'right' }
const sideLabel: CSSProperties = { fontSize: 11.5, color: 'var(--spira-muted)' }
const sideValue: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginTop: 1 }
const undoBtn: CSSProperties = {
  flex: '0 0 auto', height: 30, padding: '0 10px', border: '1px solid var(--spira-line)',
  borderRadius: 8, background: 'transparent', color: 'var(--spira-muted)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 11.5,
}
