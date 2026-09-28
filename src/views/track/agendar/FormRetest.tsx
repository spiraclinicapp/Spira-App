import { useState } from 'react'
import type { CSSProperties } from 'react'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { registerVisitEvent } from '../../../data/visitEvents'
import { useVisitProcedureStatus } from '../../../data/procedures'
import type { TrackVisitRow } from '../../../data/visits'
import { formatAR } from '../../../lib/dates'
import { CasillasDeProcedimientos } from '../CasillasDeProcedimientos'
import { DIAS_DEL_RETEST, procedimientosRepetibles, rotuloDeVisita } from '../retomar'
import { PieDelFormulario, SinCandidatas } from './PieDelFormulario'

/**
 * «Retest» (v0145): siempre DE una visita. Se elige la visita (atendida en los últimos
 * `DIAS_DEL_RETEST` días) y de ella sólo lo que se hizo: tildado, o sin reporte (decisión 9). Sin
 * preselección de procedimientos y al menos uno. El servidor valida lo mismo (`procedimiento_hecho`).
 * Mismo criterio que «Continuar pendientes» para preelegir la visita: desde Visitas, ninguna.
 */
export function FormRetest({ candidatas, protocolId, fecha, conPaciente, accent, onCancel, onDone }: {
  /** Ya filtradas con `visitasParaRetest`. */
  candidatas: readonly TrackVisitRow[]
  protocolId: string
  fecha: string
  conPaciente: boolean
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const [origenId, setOrigenId] = useState(conPaciente ? '' : candidatas[0]?.id ?? '')
  const [elegidosPor, setElegidosPor] = useState<Record<string, string[]>>({})
  const [notas, setNotas] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (candidatas.length === 0) {
    return <SinCandidatas mensaje={`No hay visitas atendidas en los últimos ${DIAS_DEL_RETEST} días.`} onCancel={onCancel} />
  }

  const origen = candidatas.find((v) => v.id === origenId) ?? null
  const elegidos = new Set(elegidosPor[origenId] ?? [])

  const agendar = async () => {
    if (!origen) { setError('Elegí qué visita se repite.'); return }
    if (elegidos.size === 0) { setError('Elegí al menos un procedimiento para el retest.'); return }
    setBusy(true)
    setError(null)
    const res = await registerVisitEvent(origen.enrollment_id, 'retest', fecha, notas.trim() || null, [...elegidos], origen.id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. El retest quedó para el ${formatAR(fecha)}.`)
  }

  return (
    <>
      <FormField label="¿Qué visita se repite?">
        <SearchableSelect
          value={origenId}
          onChange={setOrigenId}
          options={candidatas.map((v) => ({ value: v.id, label: rotuloDeVisita(v, { conPaciente }) }))}
          placeholder="Elegí una visita"
          searchPlaceholder={conPaciente ? 'Buscar paciente o visita…' : 'Buscar visita…'}
          entity="visita"
        />
      </FormField>
      {origen && (
        <FormField label="¿Qué se repite?">
          <RepetiblesDe
            key={origen.id}
            visita={origen}
            protocolId={protocolId}
            elegidos={elegidos}
            onChange={(next) => setElegidosPor((m) => ({ ...m, [origenId]: [...next] }))}
            accent={accent}
          />
        </FormField>
      )}
      <FormField label="Nota">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" style={fieldInput} />
      </FormField>
      <PieDelFormulario error={error} busy={busy} accent={accent} onCancel={onCancel} onConfirmar={() => void agendar()} />
    </>
  )
}

/**
 * Lo que se puede repetir de UNA visita. Es un componente propio, montado con `key` por visita, por el
 * stale-while-revalidate de `useSupabaseQuery`: con el hook en el formulario, al cambiar de visita se
 * seguían viendo —tildables— los procedimientos de la anterior hasta que llegaba la consulta nueva.
 */
function RepetiblesDe({ visita, protocolId, elegidos, onChange, accent }: {
  visita: TrackVisitRow
  protocolId: string
  elegidos: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  accent: string
}) {
  const procs = useVisitProcedureStatus(visita.id, protocolId)
  if (procs.loading && !procs.data) return <div style={nota}>Cargando procedimientos…</div>
  if (procs.error) {
    return <div style={{ ...nota, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos: {procs.error}</div>
  }
  const repetibles = procedimientosRepetibles(procs.data ?? [], visita.real_date !== null)
  if (repetibles.length === 0) return <div style={nota}>En esa visita no quedó nada hecho para repetir.</div>
  return <CasillasDeProcedimientos items={repetibles} elegidos={elegidos} onChange={onChange} accent={accent} />
}

const nota: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }
