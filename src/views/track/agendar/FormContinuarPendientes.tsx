import { useState } from 'react'
import { FormField } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { continuarPendientes } from '../../../data/pendientes'
import { formatAR, todayISO } from '../../../lib/dates'
import { CasillasDeProcedimientos } from '../CasillasDeProcedimientos'
import { rotuloDeVisita } from '../retomar'
import type { VisitaPorRetomar } from '../retomar'
import { PieDelFormulario, SinCandidatas } from './PieDelFormulario'

/**
 * «Continuar pendientes» (v0145): se elige la visita que dejó cosas para otro día y se crea la
 * continuación con lo que se retoma. Lo marcado viene TODO tildado (decisión 8 del spec: ya se eligió
 * a propósito al marcarlo); se destilda lo que tampoco se hace ese día, y eso sigue esperando.
 *
 * Desde Visitas (`conPaciente`) la lista mezcla pacientes y NO se preelige ninguna visita: agendarle
 * la continuación al paciente equivocado es fácil y deja un registro auditable mal. Desde la ficha es
 * uno solo, y viene elegida la primera (o la que trae `preseleccion`).
 */
export function FormContinuarPendientes({ candidatas, fecha, conPaciente, preseleccion, accent, onCancel, onDone }: {
  candidatas: readonly VisitaPorRetomar[]
  /** La fecha de la continuación: el día que se mira (Visitas) o la elegida arriba (la ficha).
   *  `null` = el DateField se vació a propósito; `PieDelFormulario` bloquea «Agendar» solo. */
  fecha: string | null
  conPaciente: boolean
  /** La visita que ya viene elegida (el «Agendar» de Pendientes y de la ficha). */
  preseleccion?: string | null
  accent: string
  onCancel: () => void
  onDone: (mensaje: string) => void
}) {
  const inicial = preseleccion && candidatas.some((c) => c.visita.id === preseleccion)
    ? preseleccion
    : conPaciente ? '' : candidatas[0]?.visita.id ?? ''
  const [origenId, setOrigenId] = useState(inicial)
  /* Lo elegido POR visita: cambiar de visita no arrastra la selección de otra, y volver a una
     conserva lo que se había destildado. Sin entrada = todo lo marcado. */
  const [elegidosPor, setElegidosPor] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (candidatas.length === 0) return <SinCandidatas mensaje="No hay procedimientos esperando." onCancel={onCancel} />

  const origen = candidatas.find((c) => c.visita.id === origenId) ?? null
  const elegidos = new Set(elegidosPor[origenId] ?? origen?.procedimientos.map((p) => p.procedure_id) ?? [])

  const agendar = async () => {
    if (!origen) { setError('Elegí la visita.'); return }
    if (!fecha) { setError('Elegí la fecha.'); return }
    if (elegidos.size === 0) { setError('Elegí qué procedimientos se retoman.'); return }
    setBusy(true)
    setError(null)
    const res = await continuarPendientes(origen.visita.id, [...elegidos], fecha)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Listo. La continuación quedó para el ${formatAR(fecha)}.`)
  }

  return (
    <>
      <FormField label="Visita">
        <SearchableSelect
          value={origenId}
          onChange={setOrigenId}
          options={candidatas.map((c) => ({
            value: c.visita.id,
            label: `${rotuloDeVisita(c.visita, { conPaciente })} · ${c.procedimientos.map((p) => p.name).join(', ')}`,
          }))}
          placeholder="Elegí una visita"
          searchPlaceholder={conPaciente ? 'Buscar paciente o visita…' : 'Buscar visita…'}
          entity="visita"
        />
      </FormField>
      {origen && (
        /* «hoy» sólo si la fecha ES hoy: desde la ficha se agenda a futuro («el jueves vuelve»). */
        <FormField label={fecha === todayISO() ? '¿Qué se hace hoy?' : '¿Qué se retoma?'}>
          <CasillasDeProcedimientos
            items={origen.procedimientos}
            elegidos={elegidos}
            onChange={(next) => setElegidosPor((m) => ({ ...m, [origenId]: [...next] }))}
            accent={accent}
          />
        </FormField>
      )}
      <PieDelFormulario error={error} busy={busy} accent={accent} fecha={fecha} onCancel={onCancel} onConfirmar={() => void agendar()} />
    </>
  )
}
