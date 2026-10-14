import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, VISIT_STATES } from '../visitStates'
import { formatTimeAR, todayISO } from '../../lib/dates'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { contextoDeEtapa, etapaProgreso, marcaDeEtapa } from './visitHeaderRules'
import { accionesDeVisita, llegadaFueraDeFecha, nombreDeLaVisita } from './accionesDeVisita'
import type { ClaveAccion, PermisosDeVisita } from './accionesDeVisita'
import { BotonEtapa } from './BotonEtapa'
import type { CaraPrincipal } from './BotonEtapa'
import { esNoVino } from './visitas/calendario'

/**
 * Barra de acción del modal de visita (handoff §7). Dos mitades:
 *
 * ```
 * ┌ listón (flex:1, máx 440) ──────────────────┐  ┌ acciones (derecha) ──────────────────────────────┐
 * │ Concurrió al centro · 10:31 · sigue …  2 DE 4│  │ [chip] [Solicitar atención médica] [Iniciar → | ⌄] │
 * │ ▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░  riel al 50 %          │  └──────────────────────────────────────────────────┘
 * └─────────────────────────────────────────────┘
 * ```
 *
 * **El estado de la visita se dice UNA sola vez y es acá** (checklist de QA): por eso la identidad
 * del encabezado ya no lleva chip de etapa.
 *
 * **Una sola acción sólida por pantalla, y es la que avanza la etapa.** "Solicitar atención médica"
 * nunca es sólida y no mueve la ruta.
 *
 * La primaria es el BOTÓN DE ETAPA DIVIDIDO (handoff `docs/design_handoff_boton_etapa/`, 2026-10-14): la
 * cara avanza y la flecha abre las acciones sobre la visita —volver a la etapa anterior, reprogramar,
 * copiar el ID, eliminar, pedir retest—, las mismas que en la fila de Visitas (`accionesDeVisita`). Está
 * SIEMPRE: desde el cronograma de Estudios y pacientes el modal es la única puerta a esas acciones, y
 * ahí se abren visitas de cualquier etapa. Sin permiso para la marca, la cara se apaga y dice de quién es
 * (antes, el bloque punteado); completa, queda «Acciones». Era el «anexo con chevron» del mock de
 * encabezado; el historial de la visita sigue afuera (`audit_log` sólo lo lee gerencia, ver `TODOS.md`).
 */
export function VisitActionBar({
  visit, readOnly, canAdvance, busy, accent, permisos, onAdvance, onAccion, onLlegar, onSolicitarMedico,
}: {
  visit: DayVisitRow
  readOnly: boolean
  canAdvance: boolean
  busy: boolean
  /** Para el menú: qué marcas puede hacer (y deshacer) quien mira (`accionesDeVisita`). */
  permisos: PermisosDeVisita
  /** Una acción del menú (`useAccionesDeVisita` la ejecuta). */
  onAccion: (clave: ClaveAccion) => void
  /** La llegada confirmada fuera de fecha: `mueveFecha` = adelantada (la citación pasa a hoy). */
  onLlegar: (mueveFecha: boolean) => void
  /**
   * El acento del módulo desde el que se abrió la visita — el MISMO que ya recibe `VisitDetail`,
   * que es quien monta esta barra.
   *
   * Lo necesita el botón primario, y no es una preferencia estética: ese botón lleva texto papel
   * sobre relleno sólido, que es el trabajo de `accentSolid` del registry (#2B766D en Coordinación,
   * 4,76:1) y NO el de `--spira-track` (#2E7D74), que es el teal de PINTAR —íconos, riel, botones
   * con un ícono adentro— y a 4,33:1 no llega al 4,5:1 que AA pide para texto normal. Ese ajuste se
   * hizo en `modules/registry.ts` y este botón se lo había perdido.
   */
  accent: string
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
  const hoy = todayISO()
  const noVino = esNoVino(visit)
  /* Marcar la llegada de una visita que no está citada para hoy confirma antes, en el lugar del menú
     (`llegadaFueraDeFecha`). Mover la citación es de quien coordina el estudio o de gerencia: `permisos.coordina`. */
  const llegada = llegadaFueraDeFecha(visit, hoy, permisos.coordina)
  const codigo = nombreDeLaVisita(visit)

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
        ) : (
          <>
            {/* Completa ya no muestra el sello «Realizada · fecha»: lo dice el listón (etapa + hora),
                y en su lugar va «Acciones», donde vive «Pedir retest» (handoff §1). */}
            {!finalizada && (
              <button type="button" onClick={onSolicitarMedico} disabled={busy} style={sec}>
                <Icon name="users" size={15} color="var(--spira-track)" />
                {/* «Solicitar atención médica» y no «Solicitar médico» (Director, 2026-09-16): se pide
                    la ATENCIÓN, que es lo que abre el popup y el nombre que ya usa la otra cara del
                    mismo botón. */}
                {visit.wants_doctor || visit.doctor_seen_at ? 'Ver atención médica' : 'Solicitar atención médica'}
                <Icon name="externalLink" size={13} color="var(--spira-muted)" />
              </button>
            )}

            <BotonEtapa
              tamano="modal"
              cara={step ? {
                rotulo: step.label,
                habilitada: canAdvance,
                pista: `Requiere acción ${role === 'reception' ? 'de Recepción' : 'del clínico'}`,
                onClick: () => onAdvance(step.next),
                confirmar: llegada
                  ? { ...llegada, rotulo: 'Marcar llegada hoy', onConfirmar: () => onLlegar(llegada.mueveFecha) }
                  : undefined,
              } satisfies CaraPrincipal : null}
              acciones={accionesDeVisita(visit, permisos, hoy)}
              encabezado={{ visita: codigo, etapa: `${noVino ? VISIT_STATES.por_reprogramar.short : meta.short} · ${paso} de ${total}` }}
              rotuloVisita={codigo}
              etiqueta={`Más acciones de la visita de ${visit.patient_name}`}
              ocupado={busy}
              acento={accent}
              onAccion={onAccion}
            />
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
  display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flex: '0 0 auto',
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
const chipWarn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999,
  background: 'rgba(176, 130, 63, 0.16)', color: 'var(--spira-acc-deep-warn)', fontSize: 12,
  fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
}
const chipGood: CSSProperties = {
  ...chipWarn, background: 'rgba(92, 138, 90, 0.16)', color: 'var(--spira-acc-deep-good)',
}
