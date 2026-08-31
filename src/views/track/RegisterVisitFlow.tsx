import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DateField } from '../../components/DateField'
import { registerVisitEvent, availableEventKinds, KIND_LABELS } from '../../data/visitEvents'
import type { VisitKind } from '../../data/visitEvents'
import { useSchedulableDefinitions, scheduleProtocolVisit } from '../../data/visitDefinitions'
import type { TrackVisitRow } from '../../data/visits'
import { todayISO, addDaysISO, formatAR, yearsFromTodayISO } from '../../lib/dates'

/**
 * Modal único de "Agendar visita". Dos caminos según el protocolo:
 *  · Con cuadro (definiciones con role<>'comun'): pre-randomización el selector lista las
 *    visitas LIBRES del cuadro (V1 Screening, V2 Randomización, manuales…) → schedule_protocol_visit;
 *    sumado a VNP suelta. Las visitas automáticas (tratamiento) se generan al randomizar y se
 *    atienden en "Visitas del día", no se agendan acá.
 *  · Sin cuadro (legacy): selector de tipos sueltos permitidos → register_visit_event.
 *  Post-randomización (cualquier caso): solo VNP / Retest sueltas.
 * `preselectDefId` preselecciona una definición (para "recitar" la randomización desde el cierre).
 */
export function RegisterVisitFlow({
  enrollmentId,
  protocolId,
  randomizationDate,
  usedKinds,
  preselectDefId,
  referenceVisits,
  accentSolid,
  onClose,
  onDone,
}: {
  enrollmentId: string
  protocolId: string
  randomizationDate: string | null
  usedKinds: VisitKind[]
  preselectDefId?: string | null
  /** Visitas ya agendadas del paciente (para estimar la fecha de una visita libre del cuadro). */
  referenceVisits?: TrackVisitRow[]
  accentSolid: string
  onClose: () => void
  onDone: () => void
}) {
  const scheds = useSchedulableDefinitions(protocolId)
  const schedDefs = scheds.data ?? []
  // El cuadro modela screening/rando si hay alguna definición con rol clínico (esas son siempre
  // libres). Espeja la condición del cutover de register_visit_event (0030).
  const hasCuadro = schedDefs.some((d) => d.role !== 'comun')
  // Pre-rando con cuadro: se agendan las definiciones libres. Post-rando: solo sueltas (las
  // automáticas ya se generaron). Sin cuadro: nada de definiciones, solo sueltas.
  const defOptions = randomizationDate == null && hasCuadro ? schedDefs : []
  const eventKinds = availableEventKinds(randomizationDate, usedKinds, hasCuadro)

  // Opciones unificadas: `def:<id>` (agenda del cuadro) o `evt:<kind>` (suelta).
  const options: { value: string; label: string }[] = [
    ...defOptions.map((d) => ({ value: `def:${d.id}`, label: d.code ? `${d.code} - ${d.name}` : d.name })),
    ...eventKinds.map((k) => ({ value: `evt:${k}`, label: KIND_LABELS[k] })),
  ]

  const initialChoice =
    preselectDefId && defOptions.some((d) => d.id === preselectDefId)
      ? `def:${preselectDefId}`
      : options[0]?.value ?? ''
  const [picked, setPicked] = useState<string | null>(null)
  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `choice` se DERIVA de las opciones actuales, NO se congela con useState: en el primer render
  // los datos del cuadro todavía cargan (scheds.loading), así que si guardáramos el default ahí
  // quedaría stale (una suelta) y al llegar el cuadro el <select> tendría un value sin <option>,
  // mandando el kind equivocado (y perdiendo el preselectDefId del recitar). Si el usuario eligió
  // y su elección sigue válida, manda; si no, cae al default actual (preselectDefId o la primera).
  const choice = picked && options.some((o) => o.value === picked) ? picked : initialChoice

  const isRandoEvent = choice === 'evt:randomizacion'

  // Fecha ESTIMADA para una visita libre del cuadro: tomamos una visita ya agendada como
  // referencia (su fecha − su offset = "día 0" = randomización) y le sumamos el offset de la
  // elegida. Sirve para sugerir cuándo caería (p. ej. la randomización a partir del screening).
  // Es solo una sugerencia editable: la fecha se agenda a mano.
  const selectedDef = choice.startsWith('def:') ? schedDefs.find((d) => `def:${d.id}` === choice) : undefined
  const refVisit = (referenceVisits ?? []).find(
    (v) => v.estimated_date != null && v.offset_days != null && v.visit_def_id !== selectedDef?.id,
  )
  const estimatedDate =
    selectedDef && selectedDef.offset_days != null && refVisit?.estimated_date != null && refVisit.offset_days != null
      ? addDaysISO(refVisit.estimated_date, selectedDef.offset_days - refVisit.offset_days)
      : null
  const date = pickedDate ?? estimatedDate ?? todayISO()

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!choice) {
      setError('Elegí qué visita registrar.')
      return
    }
    setBusy(true)
    setError(null)
    const res = choice.startsWith('def:')
      ? await scheduleProtocolVisit(enrollmentId, choice.slice(4), date)
      : await registerVisitEvent(enrollmentId, choice.slice(4) as VisitKind, date, notes.trim() || null)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onDone()
  }

  if (scheds.loading) {
    return (
      <Modal title="Agendar visita" onClose={onClose}>
        <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', padding: '6px 0' }}>Cargando visitas…</div>
      </Modal>
    )
  }

  return (
    <Modal title="Agendar visita" onClose={onClose}>
      {options.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
            {hasCuadro
              ? 'Este protocolo no tiene visitas pre-randomización para agendar a mano en el cuadro.'
              : 'No hay tipos de visita disponibles para agendar en esta etapa.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Tipo de visita">
            <SearchableSelect
              value={choice}
              onChange={setPicked}
              options={options}
              placeholder="Elegí una visita"
              searchPlaceholder="Buscar visita…"
              entity="visita"
              autoFocus
            />
          </FormField>
          <FormField label="Fecha de la visita">
            <DateField value={date} onChange={setPickedDate} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
            {estimatedDate && pickedDate == null && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--spira-muted)' }}>
                Estimada según el cronograma: {formatAR(estimatedDate)} · ajustala si hace falta.
              </div>
            )}
          </FormField>
          {/* Las notas solo aplican a las sueltas (register_visit_event); las del cuadro no las toman. */}
          {choice.startsWith('evt:') && (
            <FormField label="Nota">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" style={fieldInput} />
            </FormField>
          )}

          {isRandoEvent && (
            <div style={{ display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 11, background: accentSolid + '0E', border: `1px solid ${accentSolid}30` }}>
              <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="alertCircle" size={17} color={accentSolid} /></span>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--spira-ink)' }}>
                Al agendar la randomización se genera el cronograma de visitas anclado en esta fecha. Cierra la etapa de screening.
              </div>
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
            <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Agendando…' : 'Agendar visita'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
