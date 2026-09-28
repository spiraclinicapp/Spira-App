import { useState } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { registerVisitEvent } from '../../../data/visitEvents'
import { formatAR } from '../../../lib/dates'
import { SelectorProcedimientos } from '../SelectorProcedimientos'
import type { PacienteDelEstudio } from '../retomar'
import { PieDelFormulario } from './PieDelFormulario'

/**
 * «VNP» (0144, sin cambios de fondo en la 0145): procedimientos del estudio, opcionales — una consulta
 * es una VNP válida. Desde la ficha el paciente viene fijo (`enrollmentFijo`); desde Visitas se elige,
 * sin preelegir a nadie (una VNP al paciente equivocado queda en el registro auditable).
 */
export function FormVnp({ enrollmentFijo, pacientes, protocolId, fecha, accent, onCancel, onDone }: {
  enrollmentFijo: string | null
  /** A quién, desde Visitas. Se ignora si hay `enrollmentFijo`. */
  pacientes: readonly PacienteDelEstudio[]
  protocolId: string
  /** `null` = el DateField se vació a propósito; `PieDelFormulario` bloquea «Agendar» solo. */
  fecha: string | null
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [elegido, setElegido] = useState('')
  const [procs, setProcs] = useState<string[]>([])
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enrollmentId = enrollmentFijo ?? elegido

  const agendar = async () => {
    if (!enrollmentId) { setError('Elegí el paciente.'); return }
    if (!fecha) { setError('Elegí la fecha.'); return }
    setBusy(true)
    setError(null)
    const res = await registerVisitEvent(enrollmentId, 'vnp', fecha, notas.trim() || null, procs)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La VNP quedó para el ${formatAR(fecha)}.`)
  }

  return (
    <>
      {enrollmentFijo === null && (
        <FormField label="Paciente">
          <SearchableSelect
            value={elegido}
            onChange={setElegido}
            options={pacientes.map((p) => ({ value: p.enrollment_id, label: p.patient_code ? `${p.patient_name} · ${p.patient_code}` : p.patient_name }))}
            placeholder="Elegí un paciente"
            searchPlaceholder="Buscar paciente…"
            entity="paciente"
          />
        </FormField>
      )}
      <FormField label="¿Qué lleva?">
        <SelectorProcedimientos protocolId={protocolId} value={procs} onChange={setProcs} accent={accent} />
      </FormField>
      <FormField label="Nota">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>
      <PieDelFormulario error={error} busy={busy} accent={accent} fecha={fecha} onCancel={onCancel} onConfirmar={() => void agendar()} />
    </>
  )
}
