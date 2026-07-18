import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { usePatientMedicationHistory } from '../../data/pharma'
import type { MedicationHistoryRow } from '../../data/pharma'

const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'

/** Traduce el movimiento crudo (action + active antes/después) a etiqueta + ícono + color. La base
 *  devuelve los campos crudos a propósito; el castellano se compone acá. */
function movimiento(r: MedicationHistoryRow): { label: string; icon: IconName; color: string } {
  if (r.action === 'INSERT') return { label: 'Agregada', icon: 'plus', color: 'var(--spira-good)' }
  if (r.action === 'DELETE') return { label: 'Eliminada', icon: 'trash', color: 'var(--spira-danger)' }
  // UPDATE: distinguimos activar/desactivar por el cambio de `active`; el resto es "Modificada".
  if (r.active_before === false && r.active_after === true) return { label: 'Reactivada', icon: 'check', color: 'var(--spira-good)' }
  if (r.active_before === true && r.active_after === false) return { label: 'Desactivada', icon: 'minus', color: 'var(--spira-warn)' }
  return { label: 'Modificada', icon: 'pencil', color: 'var(--spira-muted)' }
}

/** Fecha + hora local (AR) de un timestamptz. `new Date(iso)` es seguro acá: es un instante completo
 *  (con zona), no una fecha "suelta" (esas van por lib/dates para no correrse de día). */
function fechaHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('es-AR')} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * Historial de movimientos de la medicación de un paciente (RPC `historial_medicacion_paciente`,
 * 0052): quién agregó / activó / desactivó / eliminó qué medicamento y cuándo. Solo lectura, para
 * que Pharma, gerencia o la coordinadora asignada sepan qué pasó. El candado real vive en el RPC;
 * sin permiso, muestra un mensaje sereno.
 */
export function HistorialMedicacionModal({
  enrollmentId, onClose,
}: {
  enrollmentId: string | null
  onClose: () => void
}) {
  const q = usePatientMedicationHistory(enrollmentId)
  const rows = q.data ?? []

  return (
    <Modal title="Historial de cambios" onClose={onClose} maxWidth={520}>
      {q.loading && rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '8px 2px' }}>Cargando historial…</div>
      ) : q.error ? (
        <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '10px 13px' }}>
          No pudimos cargar el historial de medicación.
        </div>
      ) : rows.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px' }}>
          <Icon name="clock" size={22} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>Sin movimientos todavía</div>
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 1 }}>
              Cuando se agregue, active o desactive medicación, va a quedar registrado acá.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => {
            const m = movimiento(r)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--spira-line)' : 'none' }}>
                <span style={{ ...iconChip, background: m.color + '18' }}>
                  <Icon name={m.icon} size={15} color={m.color} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>
                    <span style={{ fontWeight: 600, color: m.color }}>{m.label}</span>
                    {' · '}
                    <span>{r.medication_name ?? 'Medicamento'}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                    {r.actor_name} · {fechaHora(r.occurred_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

const iconChip: CSSProperties = {
  flex: '0 0 auto', width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', marginTop: 1,
}
