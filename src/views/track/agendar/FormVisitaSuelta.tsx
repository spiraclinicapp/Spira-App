import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { FormField, fieldInput } from '../../../components/FormField'
import { registerVisitEvent } from '../../../data/visitEvents'
import type { VisitKind } from '../../../data/visitEvents'
import { formatAR } from '../../../lib/dates'
import { PieDelFormulario } from './PieDelFormulario'

/**
 * Un tipo suelto del protocolo legacy, sin cuadro (firma, screening, firma y screening,
 * randomización): `register_visit_event` con fecha y nota, como hacía `RegisterVisitFlow`. La VNP y
 * el retest no pasan por acá: tienen su formulario (v0145). Qué tipos se ofrecen lo decide
 * `availableEventKinds`, que espeja las reglas del RPC (singletons, randomización con firma y
 * screening hechos).
 */
export function FormVisitaSuelta({ enrollmentId, kind, fecha, accent, onCancel, onDone }: {
  enrollmentId: string
  kind: VisitKind
  /** `null` = el DateField se vació a propósito; `PieDelFormulario` bloquea «Agendar» solo. */
  fecha: string | null
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agendar = async () => {
    if (!fecha) { setError('Elegí la fecha.'); return }
    setBusy(true)
    setError(null)
    const res = await registerVisitEvent(enrollmentId, kind, fecha, notas.trim() || null)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La visita quedó para el ${formatAR(fecha)}.`)
  }

  return (
    <>
      <FormField label="Nota">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>
      {kind === 'randomizacion' && (
        /* Teñido con `color-mix` y no concatenando un alfa: el acento puede llegar como `var(--…)`, y
           `var(--…)0E` es CSS inválido. Sin borde: el realce de un aviso es la superficie. */
        <div style={{ display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 11, background: `color-mix(in srgb, ${accent} 7%, transparent)` }}>
          <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={17} color={accent} /></span>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
            Al agendar la randomización se genera el cronograma de visitas anclado en esta fecha. Cierra la etapa de screening.
          </div>
        </div>
      )}
      <PieDelFormulario error={error} busy={busy} accent={accent} fecha={fecha} onCancel={onCancel} onConfirmar={() => void agendar()} />
    </>
  )
}
