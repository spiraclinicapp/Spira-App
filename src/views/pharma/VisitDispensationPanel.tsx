import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { formatAR } from '../../lib/dates'
import {
  usePatientMedications,
  useVisitDispensations,
  createDispensationRequest,
  cancelDispensationRequest,
} from '../../data/pharma'
import { badgeOf } from './dispensaciones/estados'

// Tintes con rgba() literal (no se puede concatenar alfa a un var(--x)). --spira-danger #A6483B,
// --spira-good #5C8A5A.
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'

// STATUS_META y badgeOf viven en dispensaciones/estados.ts (única fuente para Track y Pharma).
// badgeOf distingue "lista para retirar" de "entregada": para RequestStatus ambas son `atendida`,
// pero para la coordinadora son cosas distintas (una la puede ir a buscar el paciente).

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '8px 11px', marginBottom: 10,
}
const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }

interface PendingItem { medication_id: string; name: string; quantity: number }

/**
 * Panel "Dispensación" del detalle de visita (Track): el coordinador solicita dispensación eligiendo
 * SOLO de la medicación habilitada ACTIVA del paciente (`patient_medications`, 0050), nunca texto
 * libre; y ve el estado de las solicitudes + su resolución. Solicitar / cancelar viven solo en la
 * vista del día (`!readOnly`); en la ficha del paciente el panel es de solo lectura.
 */
export function VisitDispensationPanel({ visit, accent, readOnly }: {
  visit: { id: string; enrollment_id: string; dispenses: boolean }
  accent: string
  readOnly: boolean
}) {
  const reqQ = useVisitDispensations(visit.id)
  const medsQ = usePatientMedications(visit.enrollment_id)
  const [soliciting, setSoliciting] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('')
  const [items, setItems] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!visit.dispenses) {
    return <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', padding: '4px 0' }}>Esta visita no entrega medicación.</div>
  }

  const requests = reqQ.data ?? []
  const activeMeds = (medsQ.data ?? []).filter((m) => m.active)
  const pendingIds = new Set(items.map((i) => i.medication_id))
  // Ofrecer solo la medicación habilitada activa que todavía no esté en la lista de esta solicitud.
  const options: SelectOption[] = activeMeds
    .filter((m) => !pendingIds.has(m.medication_id))
    .map((m) => ({ value: m.medication_id, label: m.medication?.name ?? 'Medicamento' }))

  function addItem() {
    const n = parseInt(qty, 10)
    if (!pick || !Number.isFinite(n) || n <= 0) return
    const med = activeMeds.find((m) => m.medication_id === pick)
    setItems((xs) => [...xs, { medication_id: pick, name: med?.medication?.name ?? 'Medicamento', quantity: n }])
    setPick(''); setQty('')
  }

  async function solicit() {
    if (!items.length) return
    setBusy(true); setErr(null)
    const res = await createDispensationRequest(
      visit.id,
      items.map((i) => ({ medication_id: i.medication_id, quantity: i.quantity })),
      null,
    )
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setItems([]); setSoliciting(false); reqQ.refetch()
  }

  async function cancel(requestId: string) {
    setErr(null)
    const res = await cancelDispensationRequest(requestId)
    if (res.error) { setErr(res.error); return }
    reqQ.refetch()
  }

  return (
    <div>
      {err && <div style={errBox}>{err}</div>}

      {/* solicitudes existentes (más nuevas primero) */}
      {requests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: !readOnly ? 12 : 0 }}>
          {requests.map((r) => {
            const meta = badgeOf(r)
            const disp = r.dispensations?.[0] ?? null
            return (
              <div key={r.id} style={{ border: '1px solid var(--spira-line)', borderRadius: 11, background: 'var(--spira-white)', padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{formatAR(r.created_at.slice(0, 10))}</span>
                  <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', color: meta.color, background: meta.tint }}>
                    {meta.label}
                  </span>
                </div>
                {r.items.map((it) => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '2px 0' }}>
                    <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.medication?.name ?? 'Medicamento'}</span>
                    <span className="spira-mono" style={{ color: 'var(--spira-muted)', flex: '0 0 auto' }}>x{it.quantity}</span>
                  </div>
                ))}
                {r.status === 'rechazada' && r.rejection_reason && (
                  <div style={{ ...muted, marginTop: 6 }}>Motivo: {r.rejection_reason}</div>
                )}
                {disp && (
                  <div style={{ ...muted, marginTop: 6 }}>Comprobante N° <span className="spira-mono">{disp.correlative_number}</span></div>
                )}
                {r.status === 'solicitada' && !readOnly && (
                  <button
                    type="button" onClick={() => cancel(r.id)}
                    style={{ marginTop: 10, height: 32, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5 }}
                  >
                    Cancelar solicitud
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {readOnly && requests.length === 0 && !reqQ.loading && (
        <div style={{ ...muted, padding: '2px 0' }}>Sin dispensación solicitada.</div>
      )}

      {/* solicitar (solo vista del día) */}
      {!readOnly && !soliciting && (
        <button
          type="button" onClick={() => { setSoliciting(true); setErr(null) }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 44, borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)' }}
        >
          <Icon name="pill" size={16} color={accent} /> Solicitar dispensación
        </button>
      )}

      {!readOnly && soliciting && (
        <div style={{ border: '1px solid var(--spira-line-2)', borderRadius: 12, background: 'var(--spira-white)', padding: 13 }}>
          {activeMeds.length === 0 ? (
            <div style={muted}>
              Este paciente no tiene medicación habilitada. La farmacéutica tiene que asignarla primero (en la ficha del paciente).
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SearchableSelect
                    value={pick}
                    onChange={setPick}
                    options={options}
                    placeholder={options.length ? 'Medicamento…' : 'No queda medicación para agregar'}
                    searchPlaceholder="Buscar…"
                    disabled={options.length === 0}
                  />
                </div>
                <input
                  type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant."
                  style={{ width: 74, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', padding: '0 12px', fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)' }}
                />
                <button
                  type="button" onClick={addItem} disabled={!pick || !qty}
                  style={{ height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: !pick || !qty ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, opacity: !pick || !qty ? 0.6 : 1 }}
                >
                  Agregar
                </button>
              </div>

              {items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {items.map((it, i) => (
                    <div key={it.medication_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: 'var(--spira-surface)', borderRadius: 9, padding: '7px 11px' }}>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span className="spira-mono" style={{ color: 'var(--spira-muted)' }}>x{it.quantity}</span>
                      <button
                        type="button" aria-label="Quitar" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                        style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
                      >
                        <Icon name="x" size={15} color="var(--spira-faint)" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <button
              type="button" onClick={() => { setSoliciting(false); setItems([]); setPick(''); setQty(''); setErr(null) }}
              style={{ height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5 }}
            >
              Cancelar
            </button>
            <button
              type="button" onClick={solicit} disabled={!items.length || busy}
              style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: items.length ? accent : 'var(--spira-line)', color: items.length ? 'var(--spira-on-accent)' : 'var(--spira-faint)', cursor: items.length && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Solicitando…' : 'Solicitar dispensación'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
