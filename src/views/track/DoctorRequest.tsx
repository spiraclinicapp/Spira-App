import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Panel } from './Panel'
import { MOTIVOS } from './doctorMotivos'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * "Atención médica" de una visita. Estados: (1) visto por el médico → solo lectura; (2) en cola →
 * motivo + editar motivo + quitar; (3) sin marcar → picker de motivo. En `readOnly` (ficha del
 * paciente) solo muestra el estado, sin acciones.
 *
 * Reusado por el panel del modal de visita (`VisitDetail`) y por el popup de Visitas del día
 * (`DoctorRequestModal`): `startExpanded` abre el picker de una (el popup); `bare` omite el
 * contenedor `Panel` cuando el título ya lo pone el Modal (el popup).
 */
export function DoctorRequest({ visit, accent, readOnly, busy, onMark, onUnmark, startExpanded = false, bare = false }: {
  visit: DayVisitRow
  accent: string
  readOnly: boolean
  busy: boolean
  onMark: (motivo: string) => void
  onUnmark: () => void
  startExpanded?: boolean
  bare?: boolean
}) {
  const [open, setOpen] = useState(startExpanded)
  const [editing, setEditing] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const seen = visit.doctor_seen_at != null
  const marked = visit.wants_doctor

  // En el popup (`bare`) el título lo pone el Modal; en el modal, cada estado va en su Panel.
  const wrap = (title: string, inner: ReactNode): ReactNode =>
    bare ? inner : <Panel title={title} icon="users" accent={accent}>{inner}</Panel>

  if (seen) {
    return wrap('Atención médica', (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-good)', fontWeight: 600 }}>
          <Icon name="check" size={15} color="var(--spira-good)" /> Visto por el médico
        </div>
        {visit.doctor_motivo && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 6 }}>Motivo: {visit.doctor_motivo}</div>}
      </>
    ))
  }

  if (marked) {
    return wrap('Atención médica', (
      editing ? (
        <>
          <MotivoPicker accent={accent} value={motivo} onPick={setMotivo} />
          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <button type="button" onClick={() => { setEditing(false); setMotivo(null) }} disabled={busy} style={cancelBtn(busy)}>Cancelar</button>
            <button
              type="button"
              onClick={() => { if (motivo && motivo !== visit.doctor_motivo && !busy) { onMark(motivo); setEditing(false) } }}
              disabled={!motivo || motivo === visit.doctor_motivo || busy}
              style={primaryBtn(!!motivo && motivo !== visit.doctor_motivo, accent, busy)}
            >
              <Icon name="check" size={15} color={motivo && motivo !== visit.doctor_motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
              {busy ? 'Guardando…' : 'Guardar motivo'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--spira-muted)' }}>Motivo: </span>
            <span style={{ fontWeight: 600 }}>{visit.doctor_motivo || 'sin especificar'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12.5, color: accent, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} /> Esperando médico
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
              <button type="button" onClick={() => { setMotivo(visit.doctor_motivo ?? null); setEditing(true) }} disabled={busy} style={secondaryBtn(busy)}>Editar motivo</button>
              <button type="button" onClick={() => { if (!busy) onUnmark() }} disabled={busy} style={secondaryBtn(busy)}>Quitar de "Para ver médico"</button>
            </div>
          )}
        </>
      )
    ))
  }

  // Sin marcar. En la ficha del paciente (readOnly) no ofrecemos marcar.
  if (readOnly) return null

  // En el modal, arranca colapsado (botón punteado); en el popup, `startExpanded` lo abre de una.
  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 46, borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)' }}
      >
        <Icon name="users" size={16} color={accent} /> Marcar para ver médico
      </button>
    )
  }

  return wrap('Marcar para ver médico', (
    <>
      <MotivoPicker accent={accent} value={motivo} onPick={setMotivo} />
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        {/* En el popup (bare) el ✕/Escape del Modal es el "cancelar"; no duplicamos botón. */}
        {!bare && (
          <button type="button" onClick={() => { setOpen(false); setMotivo(null) }} disabled={busy} style={cancelBtn(busy)}>Cancelar</button>
        )}
        <button
          type="button" onClick={() => { if (motivo && !busy) onMark(motivo) }} disabled={!motivo || busy}
          style={primaryBtn(!!motivo, accent, busy)}
        >
          <Icon name="users" size={15} color={motivo ? 'var(--spira-on-accent)' : 'var(--spira-faint)'} />
          {busy ? 'Marcando…' : 'Marcar para el médico'}
        </button>
      </div>
    </>
  ))
}

/** Chips de motivo (catálogo `MOTIVOS`). DRY: lo usan el estado "sin marcar" y el "editar motivo". */
function MotivoPicker({ accent, value, onPick }: { accent: string; value: string | null; onPick: (m: string) => void }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--spira-muted)', marginBottom: 8 }}>Motivo</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MOTIVOS.map((m) => {
          const active = value === m
          return (
            <button
              key={m} type="button" onClick={() => onPick(m)}
              style={{ height: 32, padding: '0 13px', borderRadius: 'var(--spira-radius-pill)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', border: `1px solid ${active ? accent : 'var(--spira-line-2)'}`, background: active ? accent + '14' : 'var(--spira-white)', color: active ? accent : 'var(--spira-muted)' }}
            >
              {m}
            </button>
          )
        })}
      </div>
    </>
  )
}

const secondaryBtn = (busy: boolean): CSSProperties => ({
  height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: busy ? 'default' : 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, opacity: busy ? 0.6 : 1,
})
const cancelBtn = (busy: boolean): CSSProperties => ({
  height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: busy ? 'default' : 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
})
const primaryBtn = (active: boolean, accent: string, busy: boolean): CSSProperties => ({
  flex: 1, height: 40, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: active ? accent : 'var(--spira-line)', color: active ? 'var(--spira-on-accent)' : 'var(--spira-muted)',
  cursor: active && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5,
  opacity: busy ? 0.6 : 1,
})
