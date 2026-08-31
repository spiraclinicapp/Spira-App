import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { formatDateAR } from '../../lib/dates'
import { HistorialMedicacionModal } from './HistorialMedicacionModal'
import type { PatientMedicationRow } from '../../data/pharma'
import {
  usePatientMedications,
  assignPatientMedication,
  setPatientMedicationActive,
  useMedications,
  useStock,
} from '../../data/pharma'

// Tintes con rgba() literal: NO se puede concatenar alfa a un `var(--x)` (`var(--spira-good)14`
// es CSS inválido). Mismos hexes que los tokens --spira-good (#5C8A5A) / --spira-danger (#A6483B)
// / --spira-warn (#B0823F).
const GOOD_TINT = 'rgba(92, 138, 90, 0.14)'
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
const WARN_BG = 'rgba(176, 130, 63, 0.08)'
const WARN_BORDER = 'rgba(176, 130, 63, 0.30)'

// Sección dentro de la ficha lateral: mismo molde que los otros bloques (divisor arriba, respiro).
const section: CSSProperties = { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--spira-line)' }
const sectionHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }
const sectionLabel: CSSProperties = { fontSize: 12, color: 'var(--spira-muted)' }
// Botón chico de "Historial" (link sobrio); lo ven todos los que ven la sección, no solo Pharma.
const historialBtn: CSSProperties = {
  marginLeft: 'auto', height: 26, padding: '0 9px', borderRadius: 8, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 11.5,
  fontWeight: 600, color: 'var(--spira-muted)', display: 'inline-flex', alignItems: 'center', gap: 5,
}
// Botones del encabezado del modal de edición (Historial / Agregar): mismo molde sobrio.
const modalHeaderBtn: CSSProperties = {
  height: 32, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600,
  color: 'var(--spira-ink)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 11px',
}
const activePill = (active: boolean): CSSProperties => ({
  flex: '0 0 auto', fontSize: 10.5, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--spira-radius-pill)',
  color: active ? 'var(--spira-acc-deep-good)' : 'var(--spira-muted)',
  background: active ? GOOD_TINT : 'var(--spira-surface)',
})

/**
 * "Medicación asignada" del paciente en un protocolo (`patient_medications`, 0050): la medicación
 * que la farmacéutica habilitó y de la que el coordinador elige al solicitar dispensación (nunca
 * texto libre).
 *
 * Se presenta como una SECCIÓN de solo lectura de la ficha del paciente (información del paciente,
 * visible en Track y Pharma). La gestión (agregar / activar-desactivar) va detrás de un botón
 * "Editar medicación" —espejo del de "Editar paciente"/"Editar protocolo"— que abre un modal y
 * aparece solo con `canManage` (Pharma operator+ Y parado en el módulo Pharma; el gate lo arma
 * PatientFichaView). Nunca borra: desactivar deja la fila (soft-delete) y además bloquea nuevas
 * solicitudes y la entrega de las pendientes (0050).
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
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState(false)
  const rows = medsQ.data ?? []
  // La sección (solo lectura) muestra SOLO las activas: si figura acá es porque está vigente, así
  // que no hace falta etiqueta "Activa". Las inactivas viven en el Historial de cambios y en el
  // modal de edición (donde se pueden reactivar).
  const activeRows = rows.filter((r) => r.active)

  return (
    <>
      <div style={section}>
        <div style={sectionHead}>
          <span style={sectionLabel}>Medicación</span>
          {enrollmentId && (
            <button onClick={() => setHistory(true)} style={historialBtn}>
              <Icon name="clock" size={13} color="var(--spira-muted)" /> Historial
            </button>
          )}
        </div>

        {medsQ.loading && rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '2px 0' }}>Cargando…</div>
        ) : activeRows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4, padding: '2px 0' }}>
            {canManage
              ? 'Sin medicación activa. Tocá "Editar medicación" para agregar la que este paciente va a recibir.'
              : 'La farmacéutica todavía no habilitó ninguna.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeRows.map((r) => {
              // Solo nombre + monodroga (principio activo) debajo. La dosis ya viene en el nombre.
              const mono = r.medication?.drug?.name ?? null
              return (
                <div key={r.id} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.medication?.name ?? 'Medicamento'}
                  </div>
                  {mono && (
                    <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {mono}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {canManage && (
          <button
            onClick={() => setEditing(true)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.background = 'var(--spira-white)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--spira-line-2)'; e.currentTarget.style.background = 'var(--spira-surface)' }}
            style={{ width: '100%', height: 40, marginTop: 12, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', transition: 'border-color .14s, background .14s' }}
          >
            <Icon name="pencil" size={16} color={accent} />
            <span style={{ flex: 1, textAlign: 'left' }}>Editar medicación</span>
            <Icon name="chevronRight" size={15} color="var(--spira-faint)" />
          </button>
        )}
      </div>

      {editing && canManage && (
        <EditMedicationModal
          enrollmentId={enrollmentId}
          protocolId={protocolId}
          accent={accent}
          accentSolid={accentSolid}
          rows={rows}
          onChanged={() => medsQ.refetch()}
          onHistory={() => setHistory(true)}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Historial: se abre desde la sección (lo ven todos) o desde el modal de edición. Puede
          quedar montado sobre el de edición; cerrarlo vuelve a lo de abajo. */}
      {history && (
        <HistorialMedicacionModal enrollmentId={enrollmentId} onClose={() => setHistory(false)} />
      )}
    </>
  )
}

/**
 * Modal de gestión de la medicación del paciente (solo Pharma). Agrega desde el catálogo GLOBAL
 * (`useMedications`, 0051) —no solo lo recibido en este protocolo— con la cantidad de este protocolo
 * como dato informativo. Si el medicamento nunca se recibió acá, `assignPatientMedication` devuelve
 * `needsConfirmation` en vez de fallar: la fila del buscador se reemplaza por un aviso ("Atención")
 * que, al confirmar, reintenta con `confirmNewToProtocol: true`. Activar/desactivar es soft-delete.
 * Se monta solo al abrir, así Track (y Pharma antes de "Editar") no cargan el catálogo.
 */
function EditMedicationModal({
  enrollmentId, protocolId, accent, accentSolid, rows, onChanged, onHistory, onClose,
}: {
  enrollmentId: string | null
  protocolId: string
  accent: string
  accentSolid: string
  rows: PatientMedicationRow[]
  onChanged: () => void
  onHistory: () => void
  onClose: () => void
}) {
  const catalogQ = useMedications()
  const stockQ = useStock(protocolId)
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const assignedIds = new Set(rows.map((r) => r.medication_id))
  const stockByMed = new Map((stockQ.data ?? []).map((s) => [s.medication_id, s.total_stock]))
  // Todo el catálogo global salvo lo ya asignado; la cantidad de este protocolo va en la etiqueta
  // como dato, nunca como filtro (puede ser "sin stock" y elegirse igual).
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
    setPick(''); setAdding(false); onChanged()
  }

  async function confirmAdd() {
    if (!pick || !enrollmentId) return
    setBusy(true); setErr(null)
    const res = await assignPatientMedication(enrollmentId, pick, null, true)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPick(''); setAdding(false); setConfirming(false); onChanged()
  }

  function backFromConfirm() {
    setConfirming(false)
    setPick('')
    setErr(null)
  }

  async function toggle(id: string, active: boolean) {
    setErr(null)
    const res = await setPatientMedicationActive(id, !active)
    if (res.error) { setErr(res.error); return }
    onChanged()
  }

  return (
    <Modal title="Editar medicación" onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon name="pill" size={17} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>Medicación asignada</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onHistory} style={modalHeaderBtn}>
            <Icon name="clock" size={14} color={accent} /> Historial
          </button>
          {!adding && (
            <button onClick={() => { setAdding(true); setErr(null); setConfirming(false) }} style={modalHeaderBtn}>
              <Icon name="plus" size={14} color={accent} /> Agregar
            </button>
          )}
        </div>
      </div>

      {adding && (
        confirming ? (
          <div style={{ display: 'flex', gap: 10, padding: '13px 14px', borderRadius: 11, background: WARN_BG, border: `1px solid ${WARN_BORDER}`, marginBottom: 14 }}>
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
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
        <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: DANGER_TINT, borderRadius: 8, padding: '9px 12px', marginBottom: 14 }}>
          {err}
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
          <Icon name="pill" size={22} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>Sin medicación asignada</div>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>
              Agregá la medicación que este paciente va a recibir.
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
                  Habilitada · {formatDateAR(r.created_at)}
                  {r.medication?.unit ? ` · ${r.medication.unit}` : ''}
                </div>
              </div>
              <span style={activePill(r.active)}>{r.active ? 'Activa' : 'Inactiva'}</span>
              <button
                onClick={() => toggle(r.id, r.active)}
                style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', padding: '4px 6px' }}
              >
                {r.active ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
