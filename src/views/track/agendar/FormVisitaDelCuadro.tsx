import { useState } from 'react'
import { scheduleProtocolVisit } from '../../../data/visitDefinitions'
import { formatAR } from '../../../lib/dates'
import { PieDelFormulario } from './PieDelFormulario'

/**
 * Una visita libre del cuadro, antes de randomizar (V1 Screening, V2 Randomización, las manuales):
 * `schedule_protocol_visit`, como hacía `RegisterVisitFlow` (0030), sacado a su formulario en la 0145.
 * No tiene campos propios: la fecha —y su sugerencia «estimada según el cronograma»— vive arriba, en
 * el modal, porque es la misma casilla para todas las opciones. Las automáticas (tratamiento) se
 * generan al randomizar y no se agendan acá.
 */
export function FormVisitaDelCuadro({ enrollmentId, defId, fecha, accent, onCancel, onDone }: {
  enrollmentId: string
  defId: string
  fecha: string
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agendar = async () => {
    setBusy(true)
    setError(null)
    const res = await scheduleProtocolVisit(enrollmentId, defId, fecha)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La visita quedó para el ${formatAR(fecha)}.`)
  }

  return <PieDelFormulario error={error} busy={busy} accent={accent} onCancel={onCancel} onConfirmar={() => void agendar()} />
}
