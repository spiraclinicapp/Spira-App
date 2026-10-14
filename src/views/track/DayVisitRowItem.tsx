import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'
import { formatTimeAR, todayISO } from '../../lib/dates'
import { marcaTardia, visitCode } from '../../lib/visits'
import { KIND_LABELS } from '../../lib/visitLabels'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import type { ResumenVisita } from './resumenVisita'
import { OperationalStageChip, OPERATIONAL_STAGES, VisitChip, VISIT_STATES } from '../visitStates'
import { ProtoTag, IndicadoresVisita, VisitCodeTag } from '../visitAtoms'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { atencionMedicaDeOtroDia, etapaProgreso } from './visitHeaderRules'
import { esNoVino, puedeReprogramar } from './visitas/calendario'
import { accionesDeVisita, llegadaFueraDeFecha, nombreDeLaVisita } from './accionesDeVisita'
import type { ClaveAccion, PermisosDeVisita } from './accionesDeVisita'
import { BotonEtapa } from './BotonEtapa'
import type { CaraPrincipal } from './BotonEtapa'

/**
 * Fila de la vista Día de Visitas — handoff `docs/design_handoff_visitas_calendario/` §3.1
 * (2026-10-11), sobre el modelo real. Cuatro columnas de ancho DETERMINÍSTICO: estado · datos ·
 * personas · acciones (el ⋯ del final se fue con el botón de etapa dividido, 2026-10-14). Con anchos fijos, las columnas coinciden entre filas por construcción y no
 * por casualidad de que los nombres midan parecido. El responsive (dos renglones a ≤860 px, apilada a
 * ≤560 px) va por container query sobre la lista, en `visitas/visitas.css`.
 *
 * Toda la fila abre el modal de la visita; los controles internos cortan la propagación para no
 * dispararlo. La hora de cita NO existe en el schema: la columna izquierda es el ESTADO (decisión del
 * Director) con el riel de cuánto lleva recorrido. El nombre del paciente es el titular (CLAUDE.md:
 * identidad del paciente, nombre visible) y lleva a su ficha.
 *
 * Las ACCIONES quedan en la misma x en las filas ACTIVAS: «Atención médica» está en todas (apagada
 * cuando no corresponde) y el botón de etapa tiene un ancho fijo (`.spira-split--fila`). Una REALIZADA es
 * otra cosa (Director, 2026-10-14, opción A2 del plan `docs/plan-visita-cargada-otro-dia.md`): sin etapa
 * que avanzar ni médico que pedir, la columna queda sólo con «Acciones» de ancho natural, el médico se
 * arrima al botón —sin el hueco que dejaba el gris— y «Visto por médico» baja a la tira de indicadores.
 * Todas las realizadas miden lo mismo, así que se alinean entre sí (en «Finalizadas», el orden por defecto).
 */
export function DayVisitRowItem({
  visit, canReception, canClinical, coordina, busyId, resumen,
  onAdvance, onOpenDoctor, onAccion, onLlegar, onOpen, onOpenPatient, acento,
}: {
  visit: DayVisitRow
  /** Recepción/Admin: puede marcar la llegada, "No vino" y reprogramar. */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Inicio de atención / Fin de atención / médico. */
  canClinical: boolean
  /** Coordina ESTE estudio o es gerencia (`coordinaElEstudio`, sin el atajo de admin): deshacer el inicio de atención y adelantar la llegada. */
  coordina: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  /** Qué lleva la visita, para la tira de indicadores. `null` = nada que decir: no se dibuja. */
  resumen: ResumenVisita | null
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onOpenDoctor: (visit: DayVisitRow) => void
  /** Una acción del menú del botón de etapa (`useAccionesDeVisita` la ejecuta). */
  onAccion: (visit: DayVisitRow, clave: ClaveAccion) => void
  /** La llegada confirmada fuera de fecha: `mueveFecha` = adelantada (la citación pasa a hoy). */
  onLlegar: (visit: DayVisitRow, mueveFecha: boolean) => void
  /** El `accentSolid` del módulo, relleno del botón de etapa. */
  acento: string
  onOpen: (visit: DayVisitRow) => void
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const noVino = esNoVino(visit)
  /* Realizada: sin «Atención médica» en la columna de acciones, y «Visto por médico» en la tira (A2). */
  const realizada = stage === 'fin_atencion'
  const vistoAbajo = realizada && !!visit.doctor_seen_at

  // El riel tiene que coincidir con el chip que se muestra: si la visita está "Por reprogramar" el
  // chip es el CLÍNICO, así que el riel usa ese mismo color — un riel gris de "Por llegar" al lado de
  // un chip marrón contradice al propio chip.
  const railColor = noVino
    ? VISIT_STATES.por_reprogramar.color
    : OPERATIONAL_STAGES[stage]?.color ?? OPERATIONAL_STAGES.por_llegar.color
  // Mismo cálculo que llena el riel de la barra del modal: una sola fuente para "cuánto lleva
  // recorrido esta visita", así la lista y el detalle no pueden decir cosas distintas.
  const { pct, paso, total } = etapaProgreso(stage)
  // El renglón es protocolo · N° · código, como el mock. El nombre de una visita del cronograma ya va
  // DENTRO del código («V5 W10», ver `visitCode`); el de una suelta no —el chip dice la sigla, «VNP»—,
  // así que para ésas la pista del chip dice el tipo completo.
  const pistaCodigo = visit.visit_name ? undefined : KIND_LABELS[visit.kind]

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
          {/* Una llegada TARDÍA (registrada después de la fecha de la visita, `marcaTardia`) no se
              muestra: «llegó 09:51» en la visita del 8 cargada el 14 dice una hora que no pasó. */}
          {visit.arrived_at && !marcaTardia(visit.arrived_at, visit.real_date) && (
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
            cada renglón sería ruido en toda la agenda (y lo que no se sabe no se dibuja). En una
            realizada lleva además «Visto por médico» (A2): ya no hay columna de médico para decirlo. */}
        {(resumen || vistoAbajo) && <IndicadoresVisita resumen={resumen} variante="fila" vistoPorMedico={vistoAbajo} />}
      </div>

      {/* 3 · Personas: rótulo a la derecha de su columna, valor a la izquierda de la suya. */}
      <div className="vcal-row-people">
        <Persona icon="user" rol="Coord." nombre={visit.coordinator_name} />
        <Persona icon="users" rol="Médico" nombre={visit.treating_physician} />
      </div>

      {/* 4 · Acciones: «Atención médica» y el botón de etapa dividido, que se quedó con lo que vivía en
          el ⋮ del final (handoff `design_handoff_boton_etapa` §1: el kebab sale de la fila). */}
      <div className="vcal-row-cta">
        {!realizada && <AtencionMedica visit={visit} canClinical={canClinical} busy={busy} onOpenDoctor={onOpenDoctor} />}
        <BotonEtapa
          tamano="fila"
          cara={caraDeLaFila(visit, noVino, { recepcion: canReception, clinica: canClinical, coordina }, onAdvance, onAccion, onLlegar)}
          acciones={accionesDeVisita(visit, { recepcion: canReception, clinica: canClinical, coordina }, todayISO())}
          encabezado={{
            visita: nombreDeLaVisita(visit),
            etapa: `${noVino ? VISIT_STATES.por_reprogramar.short : OPERATIONAL_STAGES[stage]?.short ?? ''} · ${paso} de ${total}`,
          }}
          rotuloVisita={nombreDeLaVisita(visit)}
          etiqueta={`Más acciones de la visita de ${visit.patient_name}`}
          ocupado={busy}
          acento={acento}
          onAccion={(clave) => onAccion(visit, clave)}
        />
      </div>
    </div>
  )
}

/**
 * La cara principal del botón en la fila. Es la acción del estado, como antes:
 *   Por llegar → «Marcar llegada» (fuera de fecha, confirma: `llegadaFueraDeFecha`) · Concurrió →
 *   «Iniciar atención» · En atención → «Fin de atención» · No vino → «Reprogramar» · Realizada → sin
 *   cara: el botón es «Acciones».
 * Sin permiso para la marca, la cara se ve apagada y la pista dice quién la hace (antes, un hueco).
 * El desenlace de screening/randomización lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
function caraDeLaFila(
  visit: DayVisitRow,
  noVino: boolean,
  permisos: PermisosDeVisita,
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void,
  onAccion: (visit: DayVisitRow, clave: ClaveAccion) => void,
  onLlegar: (visit: DayVisitRow, mueveFecha: boolean) => void,
): CaraPrincipal | null {
  if (noVino) {
    return {
      rotulo: 'Reprogramar',
      habilitada: puedeReprogramar(visit, permisos.recepcion),
      pista: 'Sólo Recepción reprograma',
      onClick: () => onAccion(visit, 'reprogramar'),
    }
  }
  const step = NEXT_STEP[visit.operational_stage]
  if (!step) return null
  const rol = advanceRole(visit.operational_stage)
  const llegada = llegadaFueraDeFecha(visit, todayISO(), permisos.coordina)
  return {
    rotulo: step.short,
    habilitada: rol === 'reception' ? permisos.recepcion : permisos.clinica,
    pista: rol === 'reception' ? 'La marca Recepción' : 'La marca el equipo clínico del estudio',
    onClick: () => onAdvance(visit, step.next),
    confirmar: llegada
      ? {
        ...llegada, rotulo: 'Marcar llegada hoy',
        onConfirmar: () => onLlegar(visit, llegada.mueveFecha),
        onVinoEseDia: () => onAccion(visit, 'vino-otro-dia'),
      }
      : undefined,
  }
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
 * «Atención médica» (antes «Quiere médico», pedido de Dirección): presente y de ancho fijo en toda fila
 * ACTIVA, para que la acción principal de al lado quede en la misma x. En una realizada no se dibuja (A2,
 * ver la cabecera): ahí no hay médico que pedir, y «Visto por médico» lo dice la tira.
 *
 *   · Visto por médico → marca quieta en verde (lo que ya pasó, no un botón).
 *   · En cola          → el pedido ya está hecho; sigue abriendo el modal para verlo o editarlo.
 *   · Habilitado       → sólo con el paciente en el centro (Concurrió / En atención), HOY, y permiso clínico.
 *   · Apagado          → por llegar, no vino, de otro día (`atencionMedicaDeOtroDia`: el pedido caería en
 *                        la cola de ese día, que nadie mira) o sin permiso, con el porqué en la pista.
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
  const enCola = visit.wants_doctor && enElCentro
  // Ver un pedido ya hecho sigue andando aunque la visita sea de otro día; pedir uno nuevo, no.
  const deOtroDia = enCola ? null : atencionMedicaDeOtroDia(visit, todayISO())
  const porque = !enElCentro
    ? stage === 'por_llegar' && !esNoVino(visit) ? 'Disponible cuando el paciente llegue' : 'La visita ya no está en el centro'
    : deOtroDia ?? (!canClinical ? 'Sólo el equipo clínico del estudio puede pedirla' : null)
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
