import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { formatAR } from '../../lib/dates'
import {
  usePatientMedications,
  assignPatientMedication,
  setPatientMedicationActive,
  useStock,
} from '../../data/pharma'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '18px 20px',
}

// Tintes con rgba() literal: NO se puede concatenar alfa a un `var(--x)` (`var(--spira-good)14`
// es CSS inválido). Mismos hexes que los tokens --spira-good (#5C8A5A) / --spira-danger (#A6483B).
const GOOD_TINT = 'rgba(92, 138, 90, 0.14)'
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'

/**
 * Card "Medicación asignada" de la ficha del paciente: la medicación que la farmacéutica habilitó
 * para este enrolamiento (`patient_medications`, 0050). Es la lista de la que el coordinador elige
 * al solicitar dispensación (nunca texto libre). La gestión (agregar / activar-desactivar) es SOLO
 * para Pharma operator+ (`canManage`); Track la ve de solo lectura. Nunca borra: desactivar deja la
 * fila (soft-delete) y además bloquea nuevas solicitudes y la entrega de las pendientes (0050).
 */
export function PatientMedicationsCard({
  enrollmentId, protocolId, accent, accentSolid, canManage,
}: {
  enrollmentId: string | null
  protocolId: string
  accent: string
  accentSolid: string
  canManage: boolean
}) {
  const medsQ = usePatientMedications(enrollmentId)
  // El catálogo del protocolo (para el desplegable de agregar) solo se pide si el usuario gestiona.
  const stockQ = useStock(canManage ? protocolId : null)
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = medsQ.data ?? []
  const assignedIds = new Set(rows.map((r) => r.medication_id))
  // Ofrecer solo medicamentos del protocolo que el paciente todavía NO tiene (el trigger de
  // coherencia igual rechazaría uno fuera del protocolo; acá se filtra para no ofrecerlo).
  const options: SelectOption[] = (stockQ.data ?? [])
    .filter((s) => !assignedIds.has(s.medication_id))
    .map((s) => ({ value: s.medication_id, label: s.name }))

  async function add() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPick(''); setAdding(false); medsQ.refetch()
  }

  async function toggle(id: string, active: boolean) {
    setErr(null)
    const res = await setPatientMedicationActive(id, !active)
    if (res.error) { setErr(res.error); return }
    medsQ.refetch()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name="pill" size={17} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }}>Medicación asignada</span>
        {canManage && !adding && (
          <button
            onClick={() => { setAdding(true); setErr(null) }}
            style={{ marginLeft: 'auto', height: 32, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px' }}
          >
            <Icon name="plus" size={14} color={accent} /> Agregar
          </button>
        )}
      </div>

      {adding && canManage && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchableSelect
              value={pick}
              onChange={setPick}
              options={options}
              placeholder={options.length ? 'Elegí un medicamento…' : 'No hay más medicamentos del protocolo para asignar'}
              searchPlaceholder="Buscar medicamento…"
              disabled={options.length === 0}
            />
          </div>
          <button onClick={add} disabled={!pick || busy} style={{ ...btnPrimary(accentSolid), height: 44, opacity: !pick || busy ? 0.6 : 1 }}>
            {busy ? 'Guardando…' : 'Agregar'}
          </button>
          <button onClick={() => { setAdding(false); setPick(''); setErr(null) }} style={{ ...btnOutline, height: 44 }}>Cancelar</button>
        </div>
      )}

      {err && (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '9px 12px', marginBottom: 12 }}>
          {err}
        </div>
      )}

      {medsQ.loading && rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '8px 0' }}>Cargando…</div>
      ) : rows.length === 0 && !adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
          <Icon name="pill" size={22} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>Sin medicación asignada</div>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>
              {canManage ? 'Agregá la medicación que este paciente va a recibir.' : 'La farmacéutica todavía no habilitó ninguna.'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div
              key={r.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--spira-line)' : 'none' }}
            >
              <div style={{ minWidth: 0, flex: 1, opacity: r.active ? 1 : 0.65 }}>
                <div style={{ fontSize: 14, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.medication?.name ?? 'Medicamento'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  Habilitada · {formatAR(r.created_at.slice(0, 10))}
                  {r.medication?.unit ? ` · ${r.medication.unit}` : ''}
                </div>
              </div>
              <span
                style={{
                  flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)',
                  color: r.active ? 'var(--spira-good)' : 'var(--spira-muted)',
                  background: r.active ? GOOD_TINT : 'var(--spira-surface)',
                }}
              >
                {r.active ? 'Activa' : 'Inactiva'}
              </span>
              {canManage && (
                <button
                  onClick={() => toggle(r.id, r.active)}
                  style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', padding: '4px 6px' }}
                >
                  {r.active ? 'Desactivar' : 'Reactivar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
