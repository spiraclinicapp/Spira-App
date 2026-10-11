import { ActionMenu } from '../../components/ActionMenu'
import type { ActionMenuItem } from '../../components/ActionMenu'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'
import { formatTimeAR } from '../../lib/dates'
import { visitCode } from '../../lib/visits'
import { KIND_LABELS } from '../../lib/visitLabels'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import type { ResumenVisita } from './resumenVisita'
import { OperationalStageChip, OPERATIONAL_STAGES, VisitChip, VISIT_STATES } from '../visitStates'
import { ProtoTag, IndicadoresVisita, VisitCodeTag } from '../visitAtoms'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { etapaProgreso } from './visitHeaderRules'
import { esNoVino, puedeReprogramar } from './visitas/calendario'

/**
 * Fila de la vista Día de Visitas — handoff `docs/design_handoff_visitas_calendario/` §3.1
 * (2026-10-11), sobre el modelo real. Cinco columnas de ancho DETERMINÍSTICO: estado · datos ·
 * personas · acciones · ⋯. Con anchos fijos, las columnas coinciden entre filas por construcción y no
 * por casualidad de que los nombres midan parecido. El responsive (dos renglones a ≤860 px, apilada a
 * ≤560 px) va por container query sobre la lista, en `visitas/visitas.css`.
 *
 * Toda la fila abre el modal de la visita; los controles internos cortan la propagación para no
 * dispararlo. La hora de cita NO existe en el schema: la columna izquierda es el ESTADO (decisión del
 * Director) con el riel de cuánto lleva recorrido. El nombre del paciente es el titular (CLAUDE.md:
 * identidad del paciente, nombre visible) y lleva a su ficha.
 *
 * Las ACCIONES quedan siempre en la misma x: «Atención médica» está en TODAS las filas (apagada cuando
 * no corresponde) y la acción principal tiene un slot fijo de 160 px que no colapsa aunque esté vacío.
 */
export function DayVisitRowItem({
  visit, canReception, canClinical, busyId, resumen,
  onAdvance, onOpenDoctor, onNoShow, onReschedule, onOpen, onOpenPatient,
}: {
  visit: DayVisitRow
  /** Recepción/Admin: puede marcar la llegada, "No vino" y reprogramar. */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Inicio de atención / Fin de atención / médico. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  /** Qué lleva la visita, para la tira de indicadores. `null` = nada que decir: no se dibuja. */
  resumen: ResumenVisita | null
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onOpenDoctor: (visit: DayVisitRow) => void
  /** Marca (true) o deshace (false) "No vino". */
  onNoShow: (visit: DayVisitRow, value: boolean) => void
  onReschedule: (visit: DayVisitRow) => void
  onOpen: (visit: DayVisitRow) => void
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const noVino = esNoVino(visit)

  // El riel tiene que coincidir con el chip que se muestra: si la visita está "Por reprogramar" el
  // chip es el CLÍNICO, así que el riel usa ese mismo color — un riel gris de "Por llegar" al lado de
  // un chip marrón contradice al propio chip.
  const railColor = noVino
    ? VISIT_STATES.por_reprogramar.color
    : OPERATIONAL_STAGES[stage]?.color ?? OPERATIONAL_STAGES.por_llegar.color
  // Mismo cálculo que llena el riel de la barra del modal: una sola fuente para "cuánto lleva
  // recorrido esta visita", así la lista y el detalle no pueden decir cosas distintas.
  const { pct } = etapaProgreso(stage)
  // El renglón es protocolo · N° · código, como el mock. El nombre de una visita del cronograma ya va
  // DENTRO del código («V5 W10», ver `visitCode`); el de una suelta no —el chip dice la sigla, «VNP»—,
  // así que para ésas la pista del chip dice el tipo completo.
  const pistaCodigo = visit.visit_name ? undefined : KIND_LABELS[visit.kind]
  const canReschedule = puedeReprogramar(visit, canReception)

  return (
    <div
      className="vcal-row spira-card-link"
      role="button"
      tabIndex={0}
      aria-label={`Abrir la visita de ${visit.patient_name}`}
      style={{ cursor: busy ? 'default' : undefined }}
      onClick={() => { if (!busy) onOpen(visit) }}
      onKeyDown={(e) => {
        // Solo si el evento nació en la fila misma: sin esta guarda, Enter sobre un botón
        // interno dispara la acción Y abre el modal.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) onOpen(visit) }
      }}
    >
      {/* 1 · Estado + riel del recorrido. «Por reprogramar» manda el chip CLÍNICO: operativamente
          sigue en "Por llegar", y ese chip diría que el paciente está por llegar cuando ya se sabe
          que no viene (`esNoVino`, el mismo predicado del grupo y del filtro). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 104, minWidth: 0 }}>
        <span style={{ alignSelf: 'flex-start' }}>
          {noVino ? <VisitChip status="por_reprogramar" compact /> : <OperationalStageChip stage={stage} compact />}
        </span>
        <span style={{ height: 3, borderRadius: 99, background: 'var(--spira-line)', overflow: 'hidden' }}>
          <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: railColor }} />
        </span>
      </div>

      {/* 2 · Datos: nombre (+ hora de llegada) · protocolo, N° y código · qué lleva la visita. */}
      <div className="vcal-row-main spira-link-group">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          {/* La flecha va al lado del NOMBRE: es el titular y lo que se apunta primero. Que el N°
              también navega lo dice el subrayado emparejado de `.spira-link-group`. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
                {visit.patient_name}
              </PatientLink>
            </span>
            {onOpenPatient && <PatientLinkArrow />}
          </span>
          {visit.arrived_at && (
            <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              llegó {formatTimeAR(visit.arrived_at)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
          <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
          <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }}>
            {visit.patient_code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          <VisitCodeTag code={visitCode(visit)} title={pistaCodigo} />
        </div>
        {/* La tira: qué lleva la visita. Sin nada que decir NO se dibuja — «Sin procedimientos» en
            cada renglón sería ruido en toda la agenda (y lo que no se sabe no se dibuja). */}
        {resumen && <IndicadoresVisita resumen={resumen} variante="fila" />}
      </div>

      {/* 3 · Personas: rótulo a la derecha de su columna, valor a la izquierda de la suya. */}
      <div className="vcal-row-people">
        <Persona icon="user" rol="Coord." nombre={visit.coordinator_name} />
        <Persona icon="users" rol="Médico" nombre={visit.treating_physician} />
      </div>

      {/* 4 · Acciones. */}
      <div className="vcal-row-cta">
        <AtencionMedica visit={visit} canClinical={canClinical} busy={busy} onOpenDoctor={onOpenDoctor} />
        <AccionPrincipal
          stage={stage}
          noVino={noVino}
          canAdvance={advanceRole(stage) === 'reception' ? canReception : advanceRole(stage) === 'clinical' ? canClinical : false}
          canReschedule={canReschedule}
          busy={busy}
          onAdvance={(next) => onAdvance(visit, next)}
          onReschedule={() => onReschedule(visit)}
        />
      </div>

      {/* 5 · Más. */}
      <div className="vcal-row-more">
        <ActionMenu
          ariaLabel={`Más acciones de la visita de ${visit.patient_name}`}
          items={accionesDe(visit, canReception, busy, onNoShow, onReschedule)}
        />
      </div>
    </div>
  )
}

/** Un responsable de la visita: ícono + rol en gris, nombre en tinta. Vacío → «Sin asignar», apagado. */
function Persona({ icon, rol, nombre }: { icon: IconName; rol: string; nombre: string | null }) {
  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }}>
        <Icon name={icon} size={13} color="var(--spira-faint)" />{rol}
      </span>
      <span
        title={nombre ?? undefined}
        style={{
          minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          fontWeight: nombre ? 600 : 400, color: nombre ? 'var(--spira-ink-2)' : 'var(--spira-ink-soft)',
        }}
      >
        {nombre ?? 'Sin asignar'}
      </span>
    </>
  )
}

/**
 * «Atención médica» (antes «Quiere médico», pedido de Dirección): SIEMPRE presente y de ancho fijo,
 * para que la acción principal de al lado quede en la misma x en todas las filas.
 *
 *   · Visto por médico → marca quieta en verde (lo que ya pasó, no un botón).
 *   · En cola          → el pedido ya está hecho; sigue abriendo el modal para verlo o editarlo.
 *   · Habilitado       → sólo con el paciente en el centro (Concurrió / En atención) y permiso clínico.
 *   · Apagado          → por llegar, cerrada, no vino o sin permiso, con el porqué en la pista.
 */
function AtencionMedica({ visit, canClinical, busy, onOpenDoctor }: {
  visit: DayVisitRow
  canClinical: boolean
  busy: boolean
  onOpenDoctor: (visit: DayVisitRow) => void
}) {
  if (visit.doctor_seen_at) {
    return (
      <span className="vcal-btn-med visto" title="Ya lo atendió el médico">
        <Icon name="check" size={15} color="var(--spira-good)" stroke={2.4} /> Visto por médico
      </span>
    )
  }
  const stage = visit.operational_stage
  const enElCentro = (stage === 'concurrio_al_centro' || stage === 'inicio_atencion') && !esNoVino(visit)
  const porque = !enElCentro
    ? stage === 'por_llegar' && !esNoVino(visit) ? 'Disponible cuando el paciente llegue' : 'La visita ya no está en el centro'
    : !canClinical ? 'Sólo el equipo clínico del estudio puede pedirla' : null
  const enCola = visit.wants_doctor && enElCentro
  return (
    <button
      type="button"
      className={'vcal-btn-med' + (enCola ? ' en-cola' : '')}
      disabled={porque !== null || busy}
      title={porque ?? (enCola ? 'Ver o editar el pedido de atención médica' : 'Solicitar atención médica')}
      onClick={(e) => { e.stopPropagation(); if (!busy) onOpenDoctor(visit) }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Icon name="users" size={15} /> {enCola ? 'En cola' : 'Atención médica'}
    </button>
  )
}

/**
 * La acción principal del estado, en un slot FIJO de 160 px que nunca colapsa:
 *   Por llegar → «Marcar llegada →» · Concurrió → «Iniciar atención →» · En atención → «Fin de atención →»
 *   No vino → «Reprogramar» (secundario) · Realizada, o sin permiso → el hueco del mismo ancho.
 * El desenlace de screening/randomización lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
function AccionPrincipal({ stage, noVino, canAdvance, canReschedule, busy, onAdvance, onReschedule }: {
  stage: OperationalStage
  noVino: boolean
  canAdvance: boolean
  canReschedule: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
  onReschedule: () => void
}) {
  if (noVino) {
    if (!canReschedule) return <span className="vcal-slot" aria-hidden="true" />
    return (
      <button
        type="button"
        className="vcal-btn-cta secundario"
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); if (!busy) onReschedule() }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        Reprogramar
      </button>
    )
  }
  const step = NEXT_STEP[stage]
  if (!step || !canAdvance) return <span className="vcal-slot" aria-hidden="true" />
  return (
    <button
      type="button"
      className="vcal-btn-cta"
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); if (!busy) onAdvance(step.next) }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {busy ? 'Guardando…' : step.short}
      <Icon name="arrowRight" size={15} color="var(--spira-on-accent)" />
    </button>
  )
}

/**
 * Ítems del menú ⋯ de la fila: acciones que SÍ están cableadas (no vino · reprogramar · copiar N°).
 *
 * Era `RowMenu`, una copia privada del menú ⋮ con su propio popover; `ActionMenu` salió justamente de
 * acá (PR #89) y la fila se migró después (QA visual del 2026-08-31). Lo único que queda acá son los
 * GUARDS, que son de esta vista y no del componente.
 */
function accionesDe(
  visit: DayVisitRow,
  canReception: boolean,
  busy: boolean,
  /** Marca (true) o deshace (false) "No vino". */
  onNoShow: (visit: DayVisitRow, value: boolean) => void,
  onReschedule: (visit: DayVisitRow) => void,
): ActionMenuItem[] {
  // Marcar la falta solo tiene sentido antes de que el paciente llegue; deshacerla, mientras siga
  // marcada. El server además rechaza marcar como ausente una visita ya atendida o con la llegada
  // ya marcada (migración 0067).
  const faltaMarcada = visit.no_show_at !== null
  const canNoShow = visit.operational_stage === 'por_llegar' && canReception
  const canReschedule = puedeReprogramar(visit, canReception)

  /* Los íconos son los del set (no hay uno de "ausente"): la `x` en rojo para la falta —el mismo
     par que usa Anular en Recepción—, `rotateCcw` para deshacerla, `calendar` para reprogramar y
     `copy` para copiar, que acá es su significado literal. */
  const items: ActionMenuItem[] = []
  if (canNoShow && !faltaMarcada) {
    items.push({ key: 'no-vino', label: 'Marcar como no vino', icon: 'x', danger: true, disabled: busy, onClick: () => onNoShow(visit, true) })
  }
  if (canNoShow && faltaMarcada) {
    items.push({ key: 'deshacer-no-vino', label: 'Deshacer “no vino”', icon: 'rotateCcw', disabled: busy, onClick: () => onNoShow(visit, false) })
  }
  if (canReschedule) {
    items.push({ key: 'reprogramar', label: 'Reprogramar', icon: 'calendar', disabled: busy, onClick: () => onReschedule(visit) })
  }
  /* Va siempre, así que el menú nunca queda sin ítems (`ActionMenu` no dibuja el disparador vacío:
     un botón que no abre nada miente). Inerte si la visita no trae el código — la acción existe y
     ahora mismo no se puede, que informa más que esconderla. */
  items.push({
    key: 'copiar-codigo',
    label: 'Copiar N° de paciente',
    icon: 'copy',
    disabled: !visit.patient_code,
    onClick: () => { if (visit.patient_code) navigator.clipboard?.writeText(visit.patient_code) },
  })
  return items
}
