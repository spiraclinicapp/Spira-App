import { useEffect, useState } from 'react'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { previewScheduleSync, applyScheduleSync } from '../../data/visitDefinitions'
import type { SchedulePlan } from '../../data/visitDefinitions'

/**
 * Preview + aplicar de la sincronización del cronograma. Al abrir llama al dry-run y muestra
 * cuántas visitas se crearían / moverían / borrarían (solo no atendidas). "Aplicar" ejecuta
 * la RPC en una transacción y avisa al padre para refrescar las vistas. Las atendidas nunca
 * se tocan; si alguna difiere del cronograma se reporta sin modificarla.
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

  const nothing = plan != null && plan.creates === 0 && plan.moves === 0 && plan.deletes === 0

  return (
    <Modal title="Generar / actualizar cronograma" onClose={onClose} maxWidth={460}>
      {loading ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Calculando cambios…</div>
      ) : error ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-danger)' }}>{error}</div>
      ) : !plan ? (
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>No pudimos leer el plan del cronograma.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {nothing ? (
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>El cronograma ya está al día. No hay cambios para aplicar.</div>
          ) : (
            <ul style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
              <li>
                <b>{plan.creates}</b> visitas a crear
              </li>
              <li>
                <b>{plan.moves}</b> visitas a mover (no atendidas)
              </li>
              <li>
                <b>{plan.deletes}</b> visitas a borrar (no atendidas)
              </li>
              {plan.attended_divergent > 0 && (
                <li style={{ color: 'var(--spira-warn)' }}>
                  {plan.attended_divergent} atendidas difieren del cronograma (se dejan intactas)
                </li>
              )}
            </ul>
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
