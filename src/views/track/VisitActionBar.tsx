import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES } from '../visitStates'
import { formatDateTimeAR, formatTimeAR } from '../../lib/dates'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { contextoDeEtapa, etapaProgreso, marcaDeEtapa } from './visitHeaderRules'

/**
 * Barra de acción del modal de visita (handoff §7). Dos mitades:
 *
 * ```
 * ┌ listón (flex:1, máx 440) ──────────────────┐  ┌ acciones (derecha) ─────────────┐
 * │ Concurrió al centro · 10:31 · sigue …  2 DE 4│  │ [chip] [Solicitar médico] [CTA] │
 * │ ▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░  riel al 50 %          │  └─────────────────────────────────┘
 * └─────────────────────────────────────────────┘
 * ```
 *
 * **El estado de la visita se dice UNA sola vez y es acá** (checklist de QA): por eso la identidad
 * del encabezado ya no lleva chip de etapa.
 *
 * **Una sola acción sólida por pantalla, y es la que avanza la etapa.** "Solicitar médico" nunca es
 * sólida y no mueve la ruta. Las etapas de otro rol reemplazan la primaria por el bloque punteado.
 *
 * El anexo con chevron del mock (retroceder una etapa / ver historial) NO está: las dos son
 * features de punta a punta sin backend — no hay RPC para deshacer una marca y el historial vive en
 * `audit_log`, que por RLS solo lee gerencia. Anotadas en `TODOS.md`.
 */
export function VisitActionBar({
  visit, readOnly, canAdvance, busy, onAdvance, onSolicitarMedico,
}: {
  visit: DayVisitRow
  readOnly: boolean
  canAdvance: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
  onSolicitarMedico: () => void
}) {
  const stage = visit.operational_stage
  const meta = OPERATIONAL_STAGES[stage] ?? OPERATIONAL_STAGES.por_llegar
  const { paso, total, pct } = etapaProgreso(stage)
  const ctx = contextoDeEtapa(stage)
  const marca = marcaDeEtapa(visit)
  const step = NEXT_STEP[stage]
  const role = advanceRole(stage)
  const finalizada = stage === 'fin_atencion'

  return (
    <div className="spira-visit-actbar" style={actbar}>
      <span style={underbar}>
        <span style={top}>
          <b style={topLabel}>{meta.label}</b>
          {/* `inicio_atencion` no tiene hora que mostrar: sale de `real_date`, que es un date sin
              hora. No se inventa una (ver `marcaDeEtapa`). */}
          {marca && <span style={hr}>{formatTimeAR(marca)}</span>}
          {ctx && <span style={ctxStyle}>{marca ? `· ${ctx}` : ctx}</span>}
          <span style={fr}>{paso} de {total}</span>
        </span>
        <span style={rail}><i style={{ ...railFill, width: `${pct}%` }} /></span>
      </span>

      <span style={grp}>
        {/* Estado médico, a la izquierda de la primaria (§7). El handoff solo dibuja el chip ámbar
            de "solicitado", pero el estado tiene DOS caras y la otra —"ya lo vio"— también estaba
            antes: es el `DoctorBadge` de la cabecera vieja, que este chip absorbe. Sin ella, una
            visita ya atendida por el médico no lo diría en ninguna parte del modal. */}
        {visit.doctor_seen_at ? (
          <span style={chipGood} title="Atendido por el médico">
            <Icon name="check" size={13} color="var(--spira-good)" stroke={2.4} />
            Visto por médico · {formatTimeAR(visit.doctor_seen_at)}
          </span>
        ) : visit.wants_doctor ? (
          <span style={chipWarn} title="En la cola del médico">
            <Icon name="users" size={13} color="var(--spira-acc-deep-warn)" />
            Médico solicitado{visit.wants_doctor_at ? ` · ${formatTimeAR(visit.wants_doctor_at)}` : ''}
          </span>
        ) : null}

        {readOnly ? (
          // Ficha del paciente y cola del médico: el listón se lee igual, pero acá no se opera.
          // Se reusa el bloque punteado que el mock ya define para "etapa de otro rol" — explicar
          // por qué no hay botones es mejor que esconder la barra y cambiarle el alto al modal.
          <span style={gated}>
            <Icon name="lock" size={15} color="var(--spira-muted)" />
            Se opera desde Visitas del día
          </span>
        ) : finalizada ? (
          <span style={fin}>
            <Icon name="check" size={15} color="var(--spira-primary)" stroke={2.4} />
            Finalizada
            {/* Sin autor: `patient_visits` guarda `ready_at` pero no quién marcó (no hay
                `ready_by`). El mock lo muestra; inventarlo sería peor que omitirlo. */}
            {visit.ready_at && <span style={finD}>{formatDateTimeAR(visit.ready_at)}</span>}
          </span>
        ) : (
          <>
            <button type="button" onClick={onSolicitarMedico} disabled={busy} style={sec}>
              <Icon name="users" size={15} color="var(--spira-track)" />
              {visit.wants_doctor || visit.doctor_seen_at ? 'Ver atención médica' : 'Solicitar médico'}
              <Icon name="externalLink" size={13} color="var(--spira-muted)" />
            </button>

            {step && canAdvance ? (
              <button
                type="button" onClick={() => { if (!busy) onAdvance(step.next) }} disabled={busy}
                style={{ ...cta, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Guardando…' : step.label}
                <Icon name="arrowRight" size={16} color="var(--spira-on-accent)" />
              </button>
            ) : step ? (
              <span style={gated}>
                <Icon name="lock" size={15} color="var(--spira-muted)" />
                Requiere acción {role === 'reception' ? 'de Recepción' : 'del clínico'}
              </span>
            ) : null}
          </>
        )}
      </span>
    </div>
  )
}

const actbar: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 18, padding: '12px 22px', minHeight: 68,
  background: 'var(--spira-surface)', borderTop: '1px solid var(--spira-line)',
  borderBottom: '1px solid var(--spira-line)', flex: '0 0 auto',
}
const underbar: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0, maxWidth: 440,
}
const top: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10 }
const topLabel: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
  letterSpacing: '-.01em', color: 'var(--spira-ink)',
}
const hr: CSSProperties = {
  fontSize: 11.5, fontWeight: 600, color: 'var(--spira-ink-soft)', fontVariantNumeric: 'tabular-nums',
}
const ctxStyle: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden',
  textOverflow: 'ellipsis', minWidth: 0,
}
const fr: CSSProperties = {
  marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
}
const rail: CSSProperties = {
  height: 4, borderRadius: 2, background: 'var(--spira-line-2)', overflow: 'hidden', display: 'block',
}
const railFill: CSSProperties = {
  display: 'block', height: '100%', background: 'var(--spira-track)', borderRadius: 2,
}
const grp: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto', flex: '0 0 auto',
}
const cta: CSSProperties = {
  border: 'none', cursor: 'pointer', background: 'var(--spira-track)', color: 'var(--spira-on-accent)',
  boxShadow: '0 2px 8px rgba(46, 125, 116, 0.24)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 8, height: 42, borderRadius: 11, padding: '0 20px', whiteSpace: 'nowrap',
}
const sec: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 11,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink-2)',
  cursor: 'pointer', whiteSpace: 'nowrap',
}
const gated: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 15px', borderRadius: 11,
  borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--spira-line-2)', background: 'var(--spira-white)',
  fontSize: 13, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap',
}
const fin: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 15px', borderRadius: 11,
  background: 'rgba(46, 125, 116, 0.14)', fontSize: 13, fontWeight: 700, color: 'var(--spira-acc-deep-track)',
  whiteSpace: 'nowrap',
}
const finD: CSSProperties = {
  fontWeight: 500, color: 'var(--spira-ink-soft)', fontVariantNumeric: 'tabular-nums',
}
const chipWarn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999,
  background: 'rgba(176, 130, 63, 0.16)', color: 'var(--spira-acc-deep-warn)', fontSize: 12,
  fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
}
const chipGood: CSSProperties = {
  ...chipWarn, background: 'rgba(92, 138, 90, 0.16)', color: 'var(--spira-acc-deep-good)',
}
