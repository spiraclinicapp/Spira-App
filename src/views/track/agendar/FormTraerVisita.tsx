import { useState } from 'react'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { rescheduleVisit } from '../../../data/visits'
import type { TrackVisitRow } from '../../../data/visits'
import { formatAR, todayISO } from '../../../lib/dates'
import { fueraDeVentana } from '../../../lib/visits'
import { contadorDeDias, marcaDePendiente, rotuloDeVisita } from '../retomar'
import { PieDelFormulario, SinCandidatas } from './PieDelFormulario'

/**
 * «Una visita pendiente del estudio» (v0145): trae al día que se mira una visita sin atender, de más
 * adelante o atrasada, con su contador de días a la derecha («+2 d», «−5 d»). Es un
 * reprogramar rápido: usa `rescheduleVisit`, la de siempre, y avisa si el día cae fuera de la ventana
 * (no lo impide: la ventana es del sponsor y el estado calculado lo va a decir igual).
 *
 * Dos puertas (2026-09-28). Desde Visitas la fecha es el día que se mira y la lista mezcla a todos los
 * pacientes del estudio: no se preelige ninguna. Desde el «Agendar» de «Se pasó la fecha» en
 * Pendientes el paciente viene fijo, la visita viene elegida y la fecha se elige arriba (hoy, por
 * defecto): reprogramar no siempre es «para hoy».
 */
export function FormTraerVisita({ candidatas, fecha, conPaciente, preseleccion, accent, onCancel, onDone }: {
  /** Ya filtradas con `visitasParaTraer`. */
  candidatas: readonly TrackVisitRow[]
  /** A qué día va: el que se mira (Visitas) o el elegido arriba. `null` = el campo se vació. */
  fecha: string | null
  /** La lista mezcla pacientes (Visitas): el nombre va en cada opción. */
  conPaciente: boolean
  /** La visita que viene elegida (Pendientes). */
  preseleccion?: string | null
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [visitaId, setVisitaId] = useState(
    preseleccion && candidatas.some((v) => v.id === preseleccion) ? preseleccion : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (candidatas.length === 0) {
    return <SinCandidatas mensaje={conPaciente ? 'Este estudio no tiene visitas pendientes.' : 'No tiene visitas pendientes.'} onCancel={onCancel} />
  }

  const visita = candidatas.find((v) => v.id === visitaId) ?? null
  /* El contador se mide contra el día al que se trae. Con la fecha vaciada no hay contra qué, y se
     usa hoy para no dejar la columna en blanco — «Agendar» igual queda bloqueado sin fecha. */
  const referencia = fecha ?? todayISO()

  const traer = async () => {
    if (!fecha) { setError('Elegí la fecha.'); return }
    if (!visita) { setError('Elegí la visita.'); return }
    setBusy(true)
    setError(null)
    const res = await rescheduleVisit(visita.id, fecha)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La visita pasó al ${formatAR(fecha)}.`)
  }

  return (
    <>
      <FormField label="Visita">
        <SearchableSelect
          value={visitaId}
          onChange={setVisitaId}
          options={candidatas.map((v) => {
            // `visitasParaTraer` garantiza la fecha estimada; el `??` sólo calma al tipo.
            const c = contadorDeDias(v.estimated_date ?? referencia, referencia)
            /* La segunda línea, sólo cuando hay algo que decir: «Ventana vencida» (traerla es una
               desviación) o «No vino». Sin `desc`, la opción es el renglón de siempre. */
            const marca = marcaDePendiente(v)
            return {
              value: v.id, label: rotuloDeVisita(v, { conPaciente }), meta: c.texto, metaAlerta: c.atrasada,
              ...(marca ? { desc: marca } : {}),
            }
          })}
          placeholder="Elegí una visita"
          searchPlaceholder={conPaciente ? 'Buscar paciente o visita…' : 'Buscar visita…'}
          entity="visita"
        />
      </FormField>
      {fecha && visita && visita.window_start && visita.window_end && fueraDeVentana(fecha, visita.window_start, visita.window_end) && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', background: 'color-mix(in srgb, var(--spira-warn) 10%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
          Ese día queda fuera de la ventana de la visita ({formatAR(visita.window_start)} al {formatAR(visita.window_end)}).
        </div>
      )}
      <PieDelFormulario error={error} busy={busy} accent={accent} fecha={fecha} onCancel={onCancel} onConfirmar={() => void traer()} />
    </>
  )
}
