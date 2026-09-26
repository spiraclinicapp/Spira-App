import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { DateField } from '../../components/DateField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { diferirProcedimientos } from '../../data/continuaciones'
import { addDaysISO, todayISO, yearsFromTodayISO } from '../../lib/dates'

/**
 * «Pasar pendientes a otro día»: elige qué pasa y a qué fecha, y crea la continuación (v0144).
 * Ninguna casilla viene marcada: lo que se difiere se elige a propósito. La fecha arranca en el día
 * siguiente a la visita, sin bajar de mañana (el caso común: se atendió hoy); admite el pasado para
 * registrar una continuación que ya ocurrió.
 */
export function PasarPendientesModal({ visitId, fechaVisita, pendientes, accent, onClose, onDone }: {
  visitId: string
  /**
   * La fecha de la visita (`real_date ?? estimated_date`). Sin ella, arrancar siempre en «mañana»
   * dejaba la continuación de una visita agendada para la semana que viene ANTES que la visita.
   */
  fechaVisita: string | null
  pendientes: readonly { procedure_id: string; name: string }[]
  accent: string
  onClose: () => void
  onDone: (continuacionId: string) => void
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [fecha, setFecha] = useState<string>(() => {
    const manana = addDaysISO(todayISO(), 1)
    const despues = fechaVisita ? addDaysISO(fechaVisita, 1) : manana
    // ISO se compara como texto: la mayor de las dos.
    return despues > manana ? despues : manana
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alternar = (id: string) => setElegidos((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (elegidos.size === 0) { setError('Elegí qué procedimientos pasan a otro día.'); return }
    setBusy(true)
    setError(null)
    const res = await diferirProcedimientos(visitId, [...elegidos], fecha)
    setBusy(false)
    if (res.error || !res.id) { setError(res.error ?? 'No pudimos crear la visita. Probá de nuevo.'); return }
    onDone(res.id)
  }

  return (
    <Modal
      title="Pasar pendientes a otro día"
      subtitle="Se crea una visita nueva con lo que elijas. Esta visita cierra con lo que se hizo."
      onClose={onClose}
      maxWidth={480}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="¿Qué pasa a otro día?">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pendientes.map((p) => (
              <label key={p.procedure_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: 'pointer' }}>
                <input type="checkbox" checked={elegidos.has(p.procedure_id)} onChange={() => alternar(p.procedure_id)} style={{ accentColor: accent }} />
                {p.name}
              </label>
            ))}
          </div>
        </FormField>
        <FormField label="Fecha de la nueva visita">
          <DateField value={fecha} onChange={setFecha} min={yearsFromTodayISO(-2)} max={yearsFromTodayISO(2)} />
        </FormField>
        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Pasando…' : 'Pasar a otro día'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
