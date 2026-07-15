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
  useMedications,
  useStock,
} from '../../data/pharma'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '18px 20px',
}

// Tintes con rgba() literal: NO se puede concatenar alfa a un `var(--x)` (`var(--spira-good)14`
// es CSS inválido). Mismos hexes que los tokens --spira-good (#5C8A5A) / --spira-danger (#A6483B)
// / --spira-warn (#B0823F). WARN_BG/WARN_BORDER siguen la misma proporción de alfa que el par
// DANGER_BG/DANGER_BORDER de EditPatientForm.tsx (caja con borde, no solo un tinte de fondo).
const GOOD_TINT = 'rgba(92, 138, 90, 0.14)'
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
const WARN_BG = 'rgba(176, 130, 63, 0.08)'
const WARN_BORDER = 'rgba(176, 130, 63, 0.30)'

/**
 * Card "Medicación asignada" de la ficha del paciente: la medicación que la farmacéutica habilitó
 * para este enrolamiento (`patient_medications`, 0050). Es la lista de la que el coordinador elige
 * al solicitar dispensación (nunca texto libre). La gestión (agregar / activar-desactivar) es SOLO
 * para Pharma operator+ (`canManage`); Track la ve de solo lectura. Nunca borra: desactivar deja la
 * fila (soft-delete) y además bloquea nuevas solicitudes y la entrega de las pendientes (0050).
 *
 * El desplegable de "Agregar" lista el catálogo GLOBAL (`useMedications`, 0051) — no solo lo ya
 * recibido en este protocolo — con la cantidad de este protocolo como dato informativo (puede ser
 * 0). Si el medicamento elegido nunca se recibió acá, `assignPatientMedication` devuelve
 * `needsConfirmation` en vez de fallar: la fila del buscador se reemplaza por un aviso ("Atención",
 * no un tinte plano) que, al confirmar, reintenta la llamada con `confirmNewToProtocol: true`.
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
  // Catálogo global (para el desplegable de agregar); stock de ESTE protocolo, solo como dato.
  const catalogQ = useMedications()
  const stockQ = useStock(canManage ? protocolId : null)
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = medsQ.data ?? []
  const assignedIds = new Set(rows.map((r) => r.medication_id))
  const stockByMed = new Map((stockQ.data ?? []).map((s) => [s.medication_id, s.total_stock]))
  // Ofrecer todo el catálogo global salvo lo que el paciente ya tiene; la cantidad de este
  // protocolo va en la etiqueta como dato, nunca como filtro (puede ser "sin stock" y elegirse igual).
  const options: SelectOption[] = (catalogQ.data ?? [])
    .filter((m) => !assignedIds.has(m.id))
    .map((m) => {
      const qty = stockByMed.get(m.id)
      const suffix = qty !== undefined ? `${qty} en stock` : 'sin stock en este protocolo'
      return { value: m.id, label: `${m.name} — ${suffix}` }
    })
  const pickedName = (catalogQ.data ?? []).find((m) => m.id === pick)?.name ?? 'Este medicamento'

  async function add() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    if (res.needsConfirmation) { setConfirming(true); return }
    setPick(''); setAdding(false); medsQ.refetch()
  }

  async function confirmAdd() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null, true)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPick(''); setAdding(false); setConfirming(false); medsQ.refetch()
  }

  function backFromConfirm() {
    setConfirming(false)
    setPick('')
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
            onClick={() => { setAdding(true); setErr(null); setConfirming(false) }}
            style={{ marginLeft: 'auto', height: 32, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px' }}
          >
            <Icon name="plus" size={14} color={accent} /> Agregar
          </button>
        )}
      </div>

      {adding && canManage && (
        confirming ? (
          <div style={{ display: 'flex', gap: 10, padding: '13px 14px', borderRadius: 11, background: WARN_BG, border: `1px solid ${WARN_BORDER}`, marginBottom: 12 }}>
            <Icon name="alertCircle" size={18} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                <strong>{pickedName}</strong> nunca se recibió para este protocolo. ¿Confirmás que corresponde asignarlo igual?
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={backFromConfirm} style={{ ...btnOutline, height: 36 }}>Volver</button>
                <button
                  type="button" onClick={confirmAdd} disabled={busy}
                  style={{ ...btnPrimary(accentSolid), height: 36, opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? 'Confirmando…' : 'Confirmar igual'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                value={pick}
                onChange={setPick}
                options={options}
                placeholder={options.length ? 'Elegí un medicamento…' : 'No hay más medicamentos para asignar'}
                searchPlaceholder="Buscar medicamento…"
                disabled={options.length === 0}
              />
            </div>
            <button onClick={add} disabled={!pick || busy} style={{ ...btnPrimary(accentSolid), height: 44, opacity: !pick || busy ? 0.6 : 1 }}>
              {busy ? 'Guardando…' : 'Agregar'}
            </button>
            <button onClick={() => { setAdding(false); setPick(''); setErr(null) }} style={{ ...btnOutline, height: 44 }}>Cancelar</button>
          </div>
        )
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
