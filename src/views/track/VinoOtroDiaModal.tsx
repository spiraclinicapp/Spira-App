import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DateField } from '../../components/DateField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { registrarVisitaEnOtraFecha, useFechaMinimaParaCargar } from '../../data/dayVisits'
import type { DayVisitRow } from '../../data/dayVisits'
import { useProtocolCoordinators } from '../../data/pharma/coordinators'
import { formatDayMonth, todayISO, yearsFromTodayISO } from '../../lib/dates'
import { fueraDeVentana } from '../../lib/visits'
import { nombreDeLaVisita } from './accionesDeVisita'
import { atendioPorDefecto, fechaMaximaParaCargar, fechaParaCargarPorDefecto } from './vinoOtroDia'

/**
 * «Vino otro día» (0158, plan `docs/plan-visita-cargada-otro-dia.md`): una visita POR LLEGAR que pasó y no
 * se marcó en su día se carga con la fecha en que vino y a nombre de quien la atendió. Queda «En atención»
 * con esa fecha, sin hora de inicio inventada; se finaliza después con el botón de siempre.
 *
 * Un modal y no una fecha adentro del menú: el `DateField` abre su propio popover, y anidado en el del menú
 * depende de la cura de `usePopover` para no cerrarlo al elegir un día. «Reprogramar» también es un modal.
 *
 * Lo que propone por defecto —y por qué— vive en `vinoOtroDia.ts`. Mientras no se toca un campo vale su
 * defecto, que se recalcula cuando llegan el mínimo y los coordinadores (sin efectos que lo pisen).
 */
export function VinoOtroDiaModal({ visit, accent, onClose, onDone }: {
  visit: DayVisitRow
  accent: string
  onClose: () => void
  /** Se cargó: la fecha elegida (para el aviso y para llevar la lista a ese día). */
  onDone: (fecha: string) => void
}) {
  const hoy = todayISO()
  const minima = useFechaMinimaParaCargar(visit.id)
  const coords = useProtocolCoordinators(visit.protocol_id)
  const [fechaTocada, setFecha] = useState<string | null>(null)
  const [atendioTocado, setAtendio] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fecha = fechaTocada ?? (minima.loading ? '' : fechaParaCargarPorDefecto(visit, hoy, minima.data))
  const delEstudio = coords.data ?? []
  const atendio = atendioTocado ?? atendioPorDefecto(visit, delEstudio)
  // Vacío de verdad, no un error de lectura: con error la lista también viene vacía, y decir «el estudio
  // no tiene coordinadores» sería afirmar algo que no se sabe.
  const sinCoordinadores = !coords.loading && !coords.error && delEstudio.length === 0
  const listo = !!fecha && !!atendio && !busy

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!listo) return
    setBusy(true)
    setError(null)
    const res = await registrarVisitaEnOtraFecha(visit.id, fecha, atendio)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(fecha)
  }

  return (
    <Modal title="Vino otro día" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={ficha}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{visit.patient_name}</span>
            {visit.patient_code && <span className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-muted)' }}>{visit.patient_code}</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
            <span className="spira-mono">{visit.protocol_code}</span> · Visita {nombreDeLaVisita(visit)}
            {visit.estimated_date && <> · agendada para el {formatDayMonth(visit.estimated_date)}</>}
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--spira-ink-soft)' }}>
          Para una visita que pasó y no se marcó en su día. Queda en atención con esa fecha; después la
          finalizás como siempre.
        </p>

        <FormField label="Fecha en que vino">
          <DateField
            value={fecha}
            onChange={setFecha}
            min={minima.data ?? yearsFromTodayISO(-2)}
            max={fechaMaximaParaCargar(hoy)}
            disabled={minima.loading}
            autoFocus
          />
        </FormField>
        {fueraDeVentana(fecha || null, visit.window_start, visit.window_end) && (
          <div style={aviso}>
            <Icon name="alertCircle" size={16} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
            Esa fecha cae fuera de la ventana del protocolo.
          </div>
        )}

        <FormField label="¿Quién la atendió?">
          <SearchableSelect
            value={atendio}
            onChange={setAtendio}
            options={delEstudio.map((c) => ({ value: c.id, label: c.full_name }))}
            placeholder={coords.loading ? 'Cargando…' : sinCoordinadores ? 'El estudio no tiene coordinadores' : 'Elegí quién la atendió'}
            disabled={busy || coords.loading || sinCoordinadores || !!coords.error}
            entity="coordinador"
          />
        </FormField>

        {/* Si la fecha mínima no se pudo leer, el selector cae a dos años atrás y la base valida igual
            (con un mensaje que nombra la fecha): no es un error para mostrar. Sin los coordinadores, sí:
            no hay a quién elegir. */}
        {(error || coords.error) && (
          <div style={errorBox}>{error ?? 'No se pudo leer quién coordina el estudio. Cerrá y probá de nuevo.'}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={!listo} style={{ ...btnPrimary(accent), opacity: listo ? 1 : 0.6, cursor: listo ? 'pointer' : 'default' }}>
            {busy ? 'Guardando…' : fecha ? `Cargar el ${formatDayMonth(fecha)}` : 'Cargar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const ficha = {
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
} as const
const aviso = {
  display: 'flex', gap: 8, marginTop: -6, fontSize: 12.5, lineHeight: 1.45, color: 'var(--spira-ink)',
} as const
const errorBox = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 8, padding: '8px 12px',
} as const
