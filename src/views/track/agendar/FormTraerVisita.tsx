import { useState } from 'react'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { rescheduleVisit } from '../../../data/visits'
import type { TrackVisitRow } from '../../../data/visits'
import { formatAR } from '../../../lib/dates'
import { fueraDeVentana } from '../../../lib/visits'
import { rotuloDeVisita } from '../retomar'
import { PieDelFormulario, SinCandidatas } from './PieDelFormulario'

/**
 * «Una visita del estudio» (v0145): trae al día que se mira una visita ya agendada para después. Es un
 * reprogramar rápido: usa `rescheduleVisit`, la de siempre, y avisa si el día cae fuera de la ventana
 * (no lo impide: la ventana es del sponsor y el estado calculado lo va a decir igual). La lista mezcla
 * a todos los pacientes del estudio: no se preelige ninguna.
 */
export function FormTraerVisita({ candidatas, dia, accent, onCancel, onDone }: {
  /** Ya filtradas con `visitasParaTraer`. */
  candidatas: readonly TrackVisitRow[]
  dia: string
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [visitaId, setVisitaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (candidatas.length === 0) {
    return <SinCandidatas mensaje="Este estudio no tiene visitas agendadas para más adelante." onCancel={onCancel} />
  }

  const visita = candidatas.find((v) => v.id === visitaId) ?? null

  const traer = async () => {
    if (!visita) { setError('Elegí la visita.'); return }
    setBusy(true)
    setError(null)
    const res = await rescheduleVisit(visita.id, dia)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La visita pasó al ${formatAR(dia)}.`)
  }

  return (
    <>
      <FormField label="Visita">
        <SearchableSelect
          value={visitaId}
          onChange={setVisitaId}
          options={candidatas.map((v) => ({ value: v.id, label: rotuloDeVisita(v) }))}
          placeholder="Elegí una visita"
          searchPlaceholder="Buscar paciente o visita…"
          entity="visita"
        />
      </FormField>
      {visita && visita.window_start && visita.window_end && fueraDeVentana(dia, visita.window_start, visita.window_end) && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', background: 'color-mix(in srgb, var(--spira-warn) 10%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
          Ese día queda fuera de la ventana de la visita ({formatAR(visita.window_start)} al {formatAR(visita.window_end)}).
        </div>
      )}
      <PieDelFormulario error={error} busy={busy} accent={accent} onCancel={onCancel} onConfirmar={() => void traer()} />
    </>
  )
}
