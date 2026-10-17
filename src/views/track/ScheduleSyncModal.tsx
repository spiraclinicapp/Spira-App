import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { previewScheduleSync, applyScheduleSync, useVisitasFueraDeVentana } from '../../data/visitDefinitions'
import type { SchedulePlan } from '../../data/visitDefinitions'
import { formatDayMonth } from '../../lib/dates'
import { avisoFueraDeVentana, lineasDelPlan, planSinCambios } from './sincronizar'

/**
 * Preview + aplicar de la sincronización del cronograma. Al abrir llama al dry-run y muestra
 * cuántas visitas se crearían / cambiarían de fecha / borrarían (solo no atendidas). "Aplicar" ejecuta
 * la RPC en una transacción y avisa al padre para refrescar las vistas. Las atendidas nunca
 * se tocan; si alguna difiere del cronograma se reporta sin modificarla.
 *
 * Desde la 0163 el sync CONSERVA las fechas que se dieron a mano (Reprogramar, el encabezado, la llegada
 * adelantada…) y las de las visitas con algo marcado, y el preview lo dice. Las líneas las arma
 * `lineasDelPlan` (pura, con test); si una conservada queda fuera de su ventana nueva, el aviso ámbar la
 * nombra (por `v_track_visits`, con la RLS de quien mira).
 */
export function ScheduleSyncModal({
  protocolId,
  accentSolid,
  onClose,
  onApplied,
}: {
  protocolId: string
  accentSolid: string
  onClose: () => void
  onApplied: () => void
}) {
  const [plan, setPlan] = useState<SchedulePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fuera = useVisitasFueraDeVentana(plan?.fuera_de_ventana ?? [])

  useEffect(() => {
    let active = true
    void previewScheduleSync(protocolId).then((res) => {
      if (!active) return
      if (res.error) setError(res.error)
      else setPlan(res.plan)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [protocolId])

  const apply = async () => {
    setBusy(true)
    setError(null)
    const res = await applyScheduleSync(protocolId)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onApplied()
    onClose()
  }

  const nothing = plan != null && planSinCambios(plan)
  const lineas = plan ? lineasDelPlan(plan) : []
  const aviso = plan ? avisoFueraDeVentana(plan) : null
  const nombradas = fuera.data ?? []

  return (
    <Modal title="Generar / actualizar cronograma" onClose={onClose} maxWidth={460}>
      {loading ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Calculando cambios…</div>
      ) : error ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>
      ) : !plan ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>No pudimos leer el plan del cronograma.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {nothing && (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>El cronograma ya está al día. No hay cambios para aplicar.</div>
          )}
          {lineas.length > 0 && (
            <ul style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              {lineas.map((l) => (
                <li key={l.clave}>
                  <b>{l.n}</b> {l.texto}
                </li>
              ))}
            </ul>
          )}
          {/* Una fecha conservada que el cambio de definición deja fuera de su ventana: es nuevo y pide revisarla. */}
          {aviso && (
            <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-warn)', lineHeight: 1.5 }}>
              {aviso}
              {nombradas.length > 0 ? ':' : '.'}
              {nombradas.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {nombradas.map((v) => (
                    <li key={v.id}>
                      {[v.patient_name, v.visit_code, v.estimated_date ? formatDayMonth(v.estimated_date) : null].filter(Boolean).join(' · ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* Las atendidas nunca se tocan; si difieren del cronograma se avisa, haya o no cambios. */}
          {plan.attended_divergent > 0 && (
            <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-warn)', lineHeight: 1.5 }}>
              {plan.attended_divergent} {plan.attended_divergent === 1 ? 'visita atendida difiere' : 'visitas atendidas difieren'} del cronograma. Se dejan intactas.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" style={btnOutline} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              style={{ ...btnPrimary(accentSolid), opacity: busy || nothing ? 0.6 : 1, cursor: busy || nothing ? 'default' : 'pointer' }}
              disabled={busy || nothing}
              onClick={() => void apply()}
            >
              {busy ? 'Aplicando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
