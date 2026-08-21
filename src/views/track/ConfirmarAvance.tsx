import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { formatAR, todayISO } from '../../lib/dates'
import type { DayVisitRow } from '../../data/dayVisits'
import { NEXT_STEP } from './advanceStep'

/**
 * Confirmación antes de cambiar la etapa de una visita que NO es de hoy.
 *
 * Por qué existe (2026-08-20). Desde que el modal de la visita se edita desde cualquier puerta
 * —ficha del paciente, cola del médico, alertas—, es fácil tener abierta una visita de hace dos
 * meses y avanzarle la etapa creyendo que es la de hoy. En una app auditable ese click queda
 * firmado, así que antes de darlo la pantalla dice EN QUÉ FECHA está parada.
 *
 * Dos casos, dos textos:
 *  · La visita ya tiene fecha real → se avisa cuál es y la fecha NO se toca.
 *  · No tiene → al avanzar se le pone la de HOY (decisión del Director), y el cartel lo dice
 *    antes, no después: es un dato que queda escrito en la historia de la visita.
 *
 * Cuando la fecha real es la de hoy no hay nada que advertir y este modal no aparece: sería
 * fricción pura en el recorrido normal del día, que es donde se usa cien veces.
 */
export function ConfirmarAvance({ visit, busy, onCancel, onConfirmar }: {
  visit: DayVisitRow
  busy: boolean
  onCancel: () => void
  onConfirmar: () => void
}) {
  const accion = NEXT_STEP[visit.operational_stage]?.label ?? 'Avanzar'
  const hoy = todayISO()

  return (
    <Modal
      title={`${accion}: revisá la fecha`}
      onClose={busy ? () => {} : onCancel}
      icon="calendar"
      accent="var(--spira-warn)"
      accentSoft="rgba(176,130,63,.12)"
      maxWidth={460}
    >
      {visit.real_date ? (
        <p style={parrafo}>
          Esta visita tiene <strong>fecha real del {formatAR(visit.real_date)}</strong>, no la de hoy.
          Avanzar cambia su estado; la fecha real queda como está.
        </p>
      ) : (
        <p style={parrafo}>
          Esta visita <strong>no tiene fecha real</strong>. Al avanzar se le va a registrar la de
          <strong> hoy, {formatAR(hoy)}</strong>.
        </p>
      )}

      <dl style={ficha}>
        <dt style={dt}>Paciente</dt>
        <dd style={dd}>
          {visit.patient_name}
          {visit.patient_code && <span className="spira-mono" style={{ marginLeft: 8, color: 'var(--spira-ink-2)' }}>{visit.patient_code}</span>}
        </dd>
        <dt style={dt}>Visita</dt>
        <dd style={dd}>
          {visit.visit_name}
          {visit.protocol_code && <span className="spira-mono" style={{ marginLeft: 8, color: 'var(--spira-ink-2)' }}>{visit.protocol_code}</span>}
        </dd>
        {visit.estimated_date && (
          <>
            <dt style={dt}>Fecha estimada</dt>
            <dd style={dd}><span className="spira-mono">{formatAR(visit.estimated_date)}</span></dd>
          </>
        )}
      </dl>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnOutline}>Cancelar</button>
        <button type="button" onClick={onConfirmar} disabled={busy} style={btnPrimary('var(--spira-primary)')}>
          {busy ? 'Guardando…' : `Sí, ${accion.toLowerCase()}`}
        </button>
      </div>
    </Modal>
  )
}

const parrafo = { margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--spira-ink)' } as const
const ficha = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 14px', margin: 0 } as const
const dt = { fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700, paddingTop: 2 } as const
const dd = { margin: 0, fontSize: 13.5, color: 'var(--spira-ink)' } as const
