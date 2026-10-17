import type { IconName } from '../../components/Icon'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { inscripcionFueraDeCurso } from '../../data/deviationModel'
import { daysDiffISO, formatDayMonth, formatDayMonthYear, formatTimeAR, isoDayAR } from '../../lib/dates'
import { turnoCancelado, visitCode, visitTitle } from '../../lib/visits'
import type { VisitTitleFields } from '../../lib/visits'
import { OPERATIONAL_STAGES } from '../visitStates'
import { DIAS_DEL_RETEST } from './retomar'
import { fechaFijaParaCargar } from './vinoOtroDia'

/**
 * ┌─ Qué ofrece el menú del botón de etapa, y por qué algo está apagado ─────────────────────────┐
 *
 * Handoff `docs/design_handoff_boton_etapa/` §2, plan `docs/plan-boton-etapa-dividido.md`. La flecha
 * del botón dividido abre las acciones sobre la visita, en el MISMO orden en todas las etapas:
 *
 *   1  Volver a <etapa>       (en Completa: Pedir retest)
 *   2  Reprogramar
 *   3  Cancelar turno                   ← sólo las del cronograma (0161; plan docs/plan-cancelar-turno.md)
 *   4  Vino otro día…                   ← Por llegar, o Concurrió con la llegada de otro día (0158, 0160;
 *                                         plan docs/plan-visita-cargada-otro-dia.md)
 *   5  Marcar / deshacer «no vino»     ← sólo Por llegar (vivía en el ⋮ de la fila)
 *   6  Copiar ID de paciente
 *   ─────
 *   7  Eliminar visita                  ← en rojo, siempre al final
 *
 * Una acción que existe pero ahora no se puede va APAGADA y con el porqué en la bajada («Es la primera
 * etapa», «Ya concurrió al centro»): informa más que esconderla, y el menú no cambia de largo entre
 * visitas. Aparecen y desaparecen sólo las que fuera de su caso no son acciones que existan:
 *   · «vino otro día» y «no vino», fuera de Por llegar y con el turno cancelado: las dos hablan de si el
 *     paciente vino, y una visita ya fechada lo dice sola, y una sin turno no tiene un día en que esperarlo;
 *   · «Cancelar turno», en una visita suelta: ahí la acción es «Eliminar», dos renglones más abajo.
 *
 * Una acción que se puede pero conviene pensar dos veces lleva `confirmar`: elegirla abre la pregunta en
 * el lugar del ítem, como Eliminar. Hoy, «Volver» sobre una marca de otro día (0160) y «Cancelar turno».
 *
 * VIVE ACÁ, PURO Y CON TEST, porque es lo que puede quedar al revés sin verse: un «Volver a Concurrió»
 * sobre una visita que nunca registró la llegada se ve perfecto y miente sobre a dónde va. Y lo usan la
 * fila de Visitas y el modal: si cada uno decidiera por su lado, dirían cosas distintas de la misma
 * visita (el motivo de `visitPermissions.ts`).
 *
 * Los permisos ESPEJAN la base (0155 y anteriores) para no ofrecer lo que va a rebotar; la base sigue
 * siendo la que manda. Las guardas que la pantalla no puede ver —procedimientos realizados, dispensación,
 * IP, continuación o retest— las dice la base con su mensaje al intentarlo.
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type ClaveAccion =
  | 'volver' | 'retest' | 'reprogramar' | 'cancelar-turno' | 'vino-otro-dia' | 'no-vino' | 'deshacer-no-vino'
  | 'copiar' | 'eliminar'

export interface AccionDeVisita {
  clave: ClaveAccion
  titulo: string
  /** Segunda línea: qué hace, o —apagada— por qué no se puede. */
  bajada: string | null
  /** El dato a la derecha (el Nº de sujeto en «Copiar ID»). */
  aparte?: string
  icono: IconName
  habilitada: boolean
  /** Rojo y separado: sólo Eliminar. */
  peligro?: boolean
  /**
   * Elegirla no ejecuta: abre esta pregunta en el lugar del ítem, y el botón que confirma lleva el
   * `titulo`. Eliminar confirma siempre y arma su texto en `BotonEtapa` (necesita el nombre de la visita).
   * `noConfirmar` es el rótulo del otro botón («Cancelar» si falta): «Cancelar turno» no puede tener un
   * «Cancelar» al lado, que diría lo mismo que el botón que confirma.
   */
  confirmar?: { pregunta: string; detalle: string; noConfirmar?: string }
}

/** Lo mínimo de la fila que deciden las reglas (el test arma casos chicos, no un `DayVisitRow` entero). */
export type VisitaParaAcciones = Pick<
  DayVisitRow,
  | 'operational_stage' | 'arrived_at' | 'attended_at' | 'real_date' | 'estimated_date' | 'no_show_at'
  | 'kind' | 'patient_code' | 'enrollment_status' | 'wants_doctor' | 'doctor_seen_at'
  | 'window_start' | 'window_end' | 'cargada_en_otra_fecha_at' | 'turno_cancelado_at' | 'citacion_cancelada'
>

export interface PermisosDeVisita {
  /** Recepción/Admin: llegada y «no vino» (`canReception`). */
  recepcion: boolean
  /** Equipo clínico del estudio: inicio de atención, retest, borrar (`canClinical`). */
  clinica: boolean
  /** Coordina ESTE estudio, o es gerencia (`coordinaElEstudio`; sin el atajo de admin): deshacer el inicio de atención y mover
   *  la citación al adelantar la llegada, que la base sólo deja a quien coordina o a gerencia (0155). También MOVER FECHAS:
   *  Reprogramar y Cancelar turno (la policy de UPDATE, 0146; la RPC de la 0161). Para una visita que se VE es lo mismo que
   *  `recepcion` (la RLS sólo la muestra a quien coordina el estudio) más gerencia, que `recepcion` no cuenta (decisión 94). */
  coordina: boolean
}

/** El nombre corto de una etapa, como el chip («Por llegar», «Concurrió»…). */
const nombreDeEtapa = (s: OperationalStage) => OPERATIONAL_STAGES[s]?.short ?? s

/**
 * A qué etapa vuelve «Volver», o `null` si no hay vuelta (la primera y la última). Espeja el `v_destino`
 * de `retroceder_etapa_visita` (0155): desde En atención se vuelve a Concurrió SI hubo llegada; las
 * visitas fechadas antes de que existiera la marca de llegada no la tienen y vuelven a Por llegar.
 */
export function destinoDeVolver(v: Pick<VisitaParaAcciones, 'operational_stage' | 'arrived_at'>): OperationalStage | null {
  if (v.operational_stage === 'concurrio_al_centro') return 'por_llegar'
  if (v.operational_stage === 'inicio_atencion') return v.arrived_at ? 'concurrio_al_centro' : 'por_llegar'
  return null
}

function itemVolver(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita {
  const destino = destinoDeVolver(v)
  if (!destino) {
    return { clave: 'volver', titulo: 'Volver a la etapa anterior', bajada: 'Es la primera etapa', icono: 'undo', habilitada: false }
  }
  const titulo = `Volver a ${nombreDeEtapa(destino)}`
  const deshaceLlegada = v.operational_stage === 'concurrio_al_centro'
  // El permiso es el de quien HACE la marca que se deshace (0155): la llegada, Recepción; el inicio
  // de atención, quien coordina el estudio o gerencia (como `start_visit_attention`).
  if (deshaceLlegada ? !p.recepcion : !p.coordina) {
    return { clave: 'volver', titulo, bajada: deshaceLlegada ? 'Sólo Recepción deshace la llegada' : 'Sólo quien coordina el estudio', icono: 'undo', habilitada: false }
  }
  // Volver a Por llegar con el médico de por medio dejaría un pedido (o una atención) de alguien que
  // según la pantalla nunca llegó. La base lo rechaza igual; acá se dice antes de intentarlo.
  if (destino === 'por_llegar' && (v.wants_doctor || v.doctor_seen_at)) {
    return { clave: 'volver', titulo, bajada: v.doctor_seen_at ? 'Ya lo atendió el médico' : 'Tiene atención médica pedida', icono: 'undo', habilitada: false }
  }
  /* La marca que se deshace: la llegada, por `arrived_at`; el inicio, por su sello `attended_at` o, si se
     cargó en otra fecha, por el momento de la carga (0158: esa visita no tiene sello, la hora no se sabe). */
  const cargada = !deshaceLlegada && !v.attended_at && !!v.cargada_en_otra_fecha_at
  const marca = deshaceLlegada ? v.arrived_at : (v.attended_at ?? v.cargada_en_otra_fecha_at)
  // La marca de HOY corrige un clic equivocado: directo, con la hora del registro (0155).
  if (marca && isoDayAR(marca) === hoy) {
    const bajada = deshaceLlegada ? `Borra la llegada de las ${formatTimeAR(marca)}`
      : cargada && v.real_date ? `Deshace la carga del ${formatDayMonth(v.real_date)}`
      : `Borra el inicio de atención de las ${formatTimeAR(marca)}`
    return { clave: 'volver', titulo, bajada, icono: 'undo', habilitada: true }
  }
  /* La de OTRO día —o un inicio sin sello ni carga, anterior a la 0102— también, pero CONFIRMANDO (0160;
     el Director: «que tire aviso y todo pero que te deje»). Hasta la 0160 no se podía: deshacer el inicio
     de una visita vieja le borra la fecha realizada y vuelve a contar como no hecha. La confirmación dice
     qué se borra y de qué día; la bajada nombra el día, no una hora que no es de hoy. */
  const dia = deshaceLlegada ? (v.arrived_at ? isoDayAR(v.arrived_at) : null) : v.real_date
  const delDia = dia ? ` del ${formatDayMonth(dia)}` : ''
  const bajada = deshaceLlegada ? `Borra la llegada${delDia}`
    : cargada ? `Deshace la carga${delDia}`
    : `Borra el inicio de atención${delDia}`
  const detalle = deshaceLlegada ? `No es de hoy: se borra la llegada${delDia}.`
    : `No es de hoy: se borra la fecha realizada${dia ? ` (${formatDayMonth(dia)})` : ''}.`
  return { clave: 'volver', titulo, bajada, icono: 'undo', habilitada: true, confirmar: { pregunta: `¿${titulo}?`, detalle } }
}

/**
 * «Vino otro día…» (0158): una visita que pasó y no se marcó en su día se carga con su fecha real, sin
 * marcar tres etapas hoy. Sólo Por llegar —en el centro o atendida, la fecha ya es otra cosa—, y con o
 * sin «no vino» (la base lo limpia en el mismo paso: vino). El permiso es el de fechar la visita: quien
 * coordina el estudio o gerencia (`coordina`, el de la base); Recepción no.
 */
function itemVinoOtroDia(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita | null {
  // Con el turno cancelado (0161) no hay un día en que se lo esperara: primero se le da fecha.
  if (turnoCancelado(v)) return null
  // 0160: también en Concurrió con la llegada de otro día, y entonces con la fecha de esa llegada.
  const llego = fechaFijaParaCargar(v, hoy)
  if (v.operational_stage !== 'por_llegar' && !llego) return null
  const base = { clave: 'vino-otro-dia' as const, titulo: 'Vino otro día…', icono: 'history' as const }
  if (!p.coordina) return { ...base, bajada: 'Lo carga quien coordina el estudio', habilitada: false }
  const bajada = llego ? `Llegó el ${formatDayMonth(llego)}: cargarla con esa fecha` : 'Cargarla con la fecha en que vino'
  return { ...base, bajada, habilitada: true }
}

/**
 * «Pedir retest» (sólo Completa). Mismas condiciones que el alta manual (`visitasParaRetest`, v0145):
 * visita fechada, atendida en los últimos `DIAS_DEL_RETEST` días e inscripción en curso. El servidor
 * valida el resto (`register_visit_event`).
 */
function itemRetest(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita {
  const base = { clave: 'retest' as const, titulo: 'Pedir retest', icono: 'rotateCw' as const }
  if (!p.clinica) return { ...base, bajada: 'Sólo el equipo clínico del estudio', habilitada: false }
  if (inscripcionFueraDeCurso(v.enrollment_status)) return { ...base, bajada: 'La inscripción no está en curso', habilitada: false }
  if (!v.real_date) return { ...base, bajada: 'La visita no tiene fecha realizada', habilitada: false }
  const hace = daysDiffISO(v.real_date, hoy)
  if (hace < 0 || hace > DIAS_DEL_RETEST) return { ...base, bajada: `Atendida hace más de ${DIAS_DEL_RETEST} días`, habilitada: false }
  return { ...base, bajada: 'Repetir procedimientos de esta visita', habilitada: true }
}

/**
 * Reprogramar: sólo mientras está Por llegar (handoff §3). Una vez en el centro, la fecha ya no es una
 * cita sino lo que pasó; para moverla, primero se vuelve a Por llegar.
 *
 * El permiso es el de mover fechas (`coordina`), el mismo que la policy de UPDATE de la base. Hasta la 0161
 * era `recepcion`, que no cuenta a gerencia: la base la dejaba y la pantalla no (decisión 94). Y es la salida
 * de «Cancelar turno»: quien cancela tiene que poder reprogramar desde el mismo menú.
 */
function itemReprogramar(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita {
  const base = { clave: 'reprogramar' as const, titulo: 'Reprogramar', icono: 'calendar' as const }
  if (v.operational_stage === 'fin_atencion') return { ...base, bajada: 'La visita está completa', habilitada: false }
  if (v.operational_stage !== 'por_llegar') return { ...base, bajada: 'Ya concurrió al centro', habilitada: false }
  if (!p.coordina) return { ...base, bajada: 'Lo reprograma quien coordina el estudio', habilitada: false }
  if (turnoCancelado(v) && v.turno_cancelado_at) {
    return { ...base, bajada: `Turno cancelado el ${formatDayMonth(isoDayAR(v.turno_cancelado_at))}`, habilitada: true }
  }
  /* «Programada para…» y no el «Hoy para el…» del mock: «hoy» se leía como «para hoy». El texto de
     las bajadas estaba a validar (handoff §6) y el campo del encabezado se llama «Fecha programada». */
  const bajada = !v.estimated_date ? 'Sin fecha programada'
    : v.estimated_date === hoy ? 'Programada para hoy'
    : `Programada para el ${formatDayMonthYear(v.estimated_date)}`
  return { ...base, bajada, habilitada: true }
}

/** «No vino»: sólo antes de que el paciente llegue (la base rechaza marcarla después, 0067). Con el turno
 *  cancelado (0161) tampoco: nadie lo esperaba, y la base no deja una cancelada con falta. */
function itemNoVino(v: VisitaParaAcciones, p: PermisosDeVisita): AccionDeVisita | null {
  if (v.operational_stage !== 'por_llegar' || turnoCancelado(v)) return null
  if (v.no_show_at) {
    return { clave: 'deshacer-no-vino', titulo: 'Deshacer «no vino»', bajada: p.recepcion ? 'Vuelve a quedar por llegar' : 'Sólo Recepción', icono: 'rotateCcw', habilitada: p.recepcion }
  }
  return { clave: 'no-vino', titulo: 'Marcar como no vino', bajada: p.recepcion ? 'Queda por reprogramar' : 'Sólo Recepción', icono: 'x', habilitada: p.recepcion }
}

/**
 * «Cancelar turno» (0161, plan `docs/plan-cancelar-turno.md`): la visita sale del turnero sin salir del
 * cronograma; queda sin fecha y por reprogramar. Sólo las del cronograma —una suelta se elimina—, sólo Por
 * llegar y sin «no vino» (ya está por reprogramar, y cancelarla le borraría la falta del día en que faltó).
 * La randomización legacy (kind 'randomizacion', estudios sin cuadro) fija la fecha del tratamiento al
 * agendarse: se reprograma. Mover fechas es de quien coordina el estudio o de gerencia (`coordina`, como la
 * base). Las guardas que la pantalla no ve —procedimientos realizados, pedido de medicación— las dice la RPC.
 */
function itemCancelarTurno(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita | null {
  if (v.kind !== 'programada' && v.kind !== 'randomizacion') return null
  const base = { clave: 'cancelar-turno' as const, titulo: 'Cancelar turno', icono: 'calendarX' as const }
  if (v.kind === 'randomizacion') return { ...base, bajada: 'Fija la fecha del tratamiento: reprogramala', habilitada: false }
  if (turnoCancelado(v)) return { ...base, bajada: 'El turno ya está cancelado', habilitada: false }
  if (v.operational_stage === 'fin_atencion') return { ...base, bajada: 'La visita está completa', habilitada: false }
  if (v.operational_stage !== 'por_llegar') return { ...base, bajada: 'Ya concurrió al centro', habilitada: false }
  if (v.no_show_at) return { ...base, bajada: 'Tiene «no vino»: ya está por reprogramar', habilitada: false }
  if (!v.estimated_date) return { ...base, bajada: 'No tiene turno', habilitada: false }
  if (!p.coordina) return { ...base, bajada: 'Lo cancela quien coordina el estudio', habilitada: false }
  const turno = v.estimated_date === hoy ? 'de hoy' : `del ${formatDayMonth(v.estimated_date)}`
  return {
    ...base,
    bajada: 'Queda sin fecha, para reprogramar',
    habilitada: true,
    confirmar: {
      pregunta: `¿Cancelar el turno ${turno}?`,
      detalle: 'Sale de la lista de ese día y queda en Pendientes, sin fecha. No se borra del cronograma.',
      noConfirmar: 'Mantener turno',
    },
  }
}

function itemCopiar(v: VisitaParaAcciones): AccionDeVisita {
  return v.patient_code
    ? { clave: 'copiar', titulo: 'Copiar ID de paciente', bajada: null, aparte: v.patient_code, icono: 'copy', habilitada: true }
    : { clave: 'copiar', titulo: 'Copiar ID de paciente', bajada: 'Todavía no tiene IVRS', icono: 'copy', habilitada: false }
}

/**
 * Eliminar: sólo las visitas SUELTAS. La base no deja borrar las del cronograma ni la randomización
 * (policy «track borra visitas sueltas», 0022); ofrecerlo habilitado sería un botón que miente. La bajada
 * dice a dónde ir (0161): una del cronograma no se borra, se le cancela el turno.
 */
function itemEliminar(v: VisitaParaAcciones, p: PermisosDeVisita): AccionDeVisita {
  const base = { clave: 'eliminar' as const, titulo: 'Eliminar visita', icono: 'trash' as const, peligro: true }
  if (v.kind === 'programada' || v.kind === 'randomizacion') return { ...base, bajada: 'Del cronograma: cancelá el turno', habilitada: false }
  if (!p.clinica) return { ...base, bajada: 'Sólo el equipo clínico del estudio', habilitada: false }
  return { ...base, bajada: null, habilitada: true }
}

/** Las acciones del menú, en orden. `hoy` = `todayISO()` (parámetro para que el test no dependa del día). */
export function accionesDeVisita(v: VisitaParaAcciones, p: PermisosDeVisita, hoy: string): AccionDeVisita[] {
  const primera = v.operational_stage === 'fin_atencion' ? itemRetest(v, p, hoy) : itemVolver(v, p, hoy)
  const cancelar = itemCancelarTurno(v, p, hoy)
  const otroDia = itemVinoOtroDia(v, p, hoy)
  const noVino = itemNoVino(v, p)
  return [
    primera,
    itemReprogramar(v, p, hoy),
    ...(cancelar ? [cancelar] : []),
    ...(otroDia ? [otroDia] : []),
    ...(noVino ? [noVino] : []),
    itemCopiar(v),
    itemEliminar(v, p),
  ]
}

/** Qué dice y qué hace la confirmación de «Marcar llegada» en una visita que no está citada para hoy. */
export interface LlegadaFueraDeFecha {
  /** Primera línea, partida para poder destacar la fecha: «Esta visita está agendada para el **28 oct**.» */
  antes: string
  fecha: string | null
  /** Segunda línea: qué va a pasar. */
  detalle: string
  /** `true` → `registrar_llegada_adelantada` (llegada + citación a hoy); `false` → `mark_arrived`. */
  mueveFecha: boolean
  /**
   * Citación PASADA y quien mira puede cargar la visita en otra fecha: la confirmación ofrece «¿Vino el
   * 8 oct?» (0158), que abre «Vino otro día…». Es el momento exacto del error que esto evita —marcar hoy
   * una visita que pasó la semana pasada—. El día, ya formateado; `null` = no se ofrece.
   */
  vinoEseDia: string | null
}

/**
 * ¿«Marcar llegada» confirma antes, y qué hace? `null` = la visita está citada para HOY: avanza directo,
 * que es el camino de todos los días (handoff §3).
 *
 * Fuera de fecha confirma siempre —marcar la llegada de la visita equivocada es el error que esto
 * frena— y la fecha se mueve SÓLO si la citación es FUTURA (o no hay): el paciente vino antes, la cita
 * de más adelante ya no va a ocurrir, y sin moverla la visita saldría también ese día (`motivosDelDia`).
 * Una citación PASADA no se toca: llegar tarde la da por cumplida (#460) y «citada el 8, vino el 10» es
 * un dato. Mover fechas es de quien coordina el estudio o de gerencia (`puedeMoverFecha`); el resto de Recepción
 * registra la llegada igual, sin mover la fecha, como hoy. Con citación pasada, ese mismo permiso —el de
 * fechar la visita— ofrece además cargarla con la fecha en que vino (`vinoEseDia`, 0158).
 *
 * Sólo la llegada: para Iniciar y Finalizar fuera de fecha el modal sigue con `ConfirmarAvance`, sin
 * cambios (handoff §4).
 */
export function llegadaFueraDeFecha(
  v: Pick<VisitaParaAcciones, 'operational_stage' | 'estimated_date' | 'window_start' | 'window_end'>,
  hoy: string,
  puedeMoverFecha: boolean,
): LlegadaFueraDeFecha | null {
  if (v.operational_stage !== 'por_llegar' || v.estimated_date === hoy) return null
  const llega = `Se registra la llegada hoy, ${formatDayMonth(hoy)}`
  if (v.estimated_date !== null && v.estimated_date < hoy) {
    return {
      antes: 'Esta visita estaba agendada para el', fecha: formatDayMonth(v.estimated_date),
      detalle: `${llega}. La fecha agendada queda como estaba.`, mueveFecha: false,
      vinoEseDia: puedeMoverFecha ? formatDayMonth(v.estimated_date) : null,
    }
  }
  const primera = v.estimated_date
    ? { antes: 'Esta visita está agendada para el', fecha: formatDayMonth(v.estimated_date) }
    : { antes: 'Esta visita no tiene fecha agendada', fecha: null }
  if (!puedeMoverFecha) {
    return { ...primera, detalle: `${llega}. La fecha la mueve quien coordina el estudio.`, mueveFecha: false, vinoEseDia: null }
  }
  /* Adelantarla puede sacarla de su ventana: «Reprogramar» lo pregunta aparte (`RescheduleModal`); acá
     va en la misma confirmación, que ya es la pregunta. */
  const fueraDeVentana = v.window_start != null && v.window_end != null && (hoy < v.window_start || hoy > v.window_end)
  return {
    ...primera,
    detalle: `${llega}, y la ${v.estimated_date ? 'fecha de la visita pasa a ser hoy' : 'visita queda para hoy'}.`
      + (fueraDeVentana ? ' Hoy queda fuera de la ventana del protocolo.' : ''),
    mueveFecha: true,
    vinoEseDia: null,
  }
}

/**
 * Cómo se nombra la visita en el menú («VISITA V2 W4») y en «¿Eliminar la visita …?». El mismo criterio
 * que el encabezado del modal: una continuación se titula entera, porque «Visita Cont. V3» no es un
 * nombre. Uno solo para la fila y el modal, así la misma visita no se llama distinto en cada lado.
 */
export function nombreDeLaVisita(v: VisitTitleFields): string {
  const codigo = visitCode(v)
  return codigo && !v.origin_visit_id ? codigo : visitTitle(v)
}
