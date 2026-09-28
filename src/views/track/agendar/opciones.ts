import type { TrackVisitRow } from '../../../data/visits'
import { addDaysISO } from '../../../lib/dates'
import { KIND_LABELS } from '../../../lib/visitLabels'
import type { VisitKind } from '../../../lib/visitLabels'

/**
 * Las reglas puras de «Agendar visita» (v0145): qué ofrece el paso «¿Qué vas a hacer?» en cada lugar,
 * qué viene elegido y qué fecha se sugiere. Con test (`opciones.test.ts`): una opción de más o de
 * menos no se ve rota, se ve normal.
 *
 * UN SOLO MODAL, DOS MODOS (decisión del Director, 2026-09-27: «igual que en Visitas»):
 *  · `dia` (Visitas): el estudio se elige y la fecha es el día que se mira. «Una visita pendiente del estudio»,
 *    «Continuar pendientes», «Retest», «VNP».
 *  · `paciente` (la ficha, el «recitar», Pendientes): el paciente viene fijo y la fecha se elige. Lo
 *    que ofrecía `RegisterVisitFlow` —las visitas libres del cuadro antes de randomizar, o los tipos
 *    sueltos del protocolo legacy— más «Continuar pendientes», «Retest» y «VNP». Sin «Una visita del
 *    estudio»: para la propia ya está «Reprogramar».
 *
 * El retest NUNCA es suelto (decisión 5 del spec): cuelga de una visita y tiene su formulario. Por eso
 * se saca de los tipos sueltos aunque `availableEventKinds` lo siga listando (lo necesita el front
 * desplegado mientras conviva). La VNP también tiene el suyo.
 *
 * Este archivo no importa nada que cargue el cliente de Supabase (`data/visitEvents` lo hace, y el
 * test no podría importarlo): los tipos sueltos llegan ya calculados, en `kindsSueltos`.
 */

/** Una definición del cuadro agendable a mano (`date_mode = 'libre'`). `VisitDefinition` la cumple. */
export interface DefinicionAgendable {
  id: string
  code: string | null
  name: string
  role: 'screening' | 'randomizacion' | 'comun'
  offset_days: number | null
}

/** Lo que se eligió en «¿Qué vas a hacer?». Cada una tiene su formulario. */
export type Eleccion =
  | { tipo: 'def'; defId: string }
  | { tipo: 'suelta'; kind: VisitKind }
  | { tipo: 'traer' }
  | { tipo: 'continuar' }
  | { tipo: 'retest' }
  | { tipo: 'vnp' }

export interface OpcionDeAgendar {
  value: string
  label: string
  eleccion: Eleccion
}

/**
 * Con qué abre el modal: «Continuar pendientes» sobre una visita (el «Agendar» de Pendientes y de la
 * ficha), una definición del cuadro (el «recitar» de la randomización) o una visita pendiente para
 * reprogramar (el «Agendar» de «Se pasó la fecha», 2026-09-28).
 */
export type Preseleccion =
  | { tipo: 'continuar'; origenId: string }
  | { tipo: 'def'; defId: string | null }
  | { tipo: 'traer'; visitaId: string }

export type ContextoDeOpciones =
  | {
      modo: 'dia'
      /** Cuántas VISITAS tienen algo para retomar. */
      continuar: number
    }
  | {
      modo: 'paciente'
      definiciones: readonly DefinicionAgendable[]
      randomizationDate: string | null
      /** `availableEventKinds(...)`: los tipos sueltos que el protocolo admite en esta etapa. */
      kindsSueltos: readonly VisitKind[]
      /** Ofrecer «Una visita pendiente del estudio» (sólo al abrir desde «Se pasó la fecha»): en la
       *  ficha no va, porque para la propia visita está «Reprogramar». */
      traer?: boolean
      continuar: number
    }

/**
 * El protocolo modela screening/randomización en el cuadro: alguna definición con rol clínico (ésas
 * son siempre libres). Espeja el cutover de `register_visit_event` (0030).
 */
export function tieneCuadro(defs: readonly Pick<DefinicionAgendable, 'role'>[]): boolean {
  return defs.some((d) => d.role !== 'comun')
}

const op = (value: string, label: string, eleccion: Eleccion): OpcionDeAgendar => ({ value, label, eleccion })

/**
 * Las opciones de «¿Qué vas a hacer?». «Continuar pendientes» sólo aparece con algo esperando (spec
 * §3: «siempre que haya visitas con marcas») y lleva cuántas. «Una visita pendiente del estudio» NO
 * lleva número (el Director, 2026-09-28: «ese 120 no se entiende qué es»): con un estudio en marcha
 * son decenas, la cifra no ayuda a decidir, y si no hay ninguna el formulario lo dice.
 */
export function opcionesDeAgendar(ctx: ContextoDeOpciones): OpcionDeAgendar[] {
  const siempre: OpcionDeAgendar[] = [
    ...(ctx.continuar > 0 ? [op('continuar', `Continuar pendientes (${ctx.continuar})`, { tipo: 'continuar' })] : []),
    op('retest', 'Retest', { tipo: 'retest' }),
    op('vnp', 'VNP', { tipo: 'vnp' }),
  ]
  if (ctx.modo === 'dia') {
    return [op('traer', 'Una visita pendiente del estudio', { tipo: 'traer' }), ...siempre]
  }
  // Pre-rando con cuadro: las definiciones libres. Post-rando las automáticas ya se generaron, y sin
  // cuadro no hay definiciones que agendar: van los tipos sueltos (lo que hacía RegisterVisitFlow).
  const defs = ctx.randomizationDate == null && tieneCuadro(ctx.definiciones) ? ctx.definiciones : []
  const sueltas = ctx.kindsSueltos.filter((k) => k !== 'vnp' && k !== 'retest')
  return [
    ...(ctx.traer ? [op('traer', 'Una visita pendiente del estudio', { tipo: 'traer' })] : []),
    ...defs.map((d) => op(`def:${d.id}`, d.code ? `${d.code} - ${d.name}` : d.name, { tipo: 'def', defId: d.id })),
    ...sueltas.map((k) => op(`evt:${k}`, KIND_LABELS[k], { tipo: 'suelta', kind: k })),
    ...siempre,
  ]
}

/**
 * La opción con la que abre el modal, o `''` (nada: se elige a propósito). Una preselección que ya no
 * está entre las opciones —lo esperado se retomó en otra pestaña, la definición ya no se agenda— no
 * se inventa: el modal abre sin elegir.
 */
export function eleccionInicial(opciones: readonly OpcionDeAgendar[], preseleccion?: Preseleccion): string {
  const hay = (value: string) => opciones.some((o) => o.value === value)
  if (preseleccion?.tipo === 'continuar' && hay('continuar')) return 'continuar'
  if (preseleccion?.tipo === 'traer' && hay('traer')) return 'traer'
  if (preseleccion?.tipo === 'def' && preseleccion.defId && hay(`def:${preseleccion.defId}`)) return `def:${preseleccion.defId}`
  return ''
}

/**
 * La fecha ESTIMADA de una visita libre del cuadro (sacada de `RegisterVisitFlow`, v0145): se toma una
 * visita ya agendada como referencia —su fecha menos su offset es el «día 0», la randomización— y se
 * le suma el offset de la elegida. Es una sugerencia editable, no una regla: la fecha se agenda a mano.
 */
export function fechaEstimadaDelCuadro(
  def: Pick<DefinicionAgendable, 'id' | 'offset_days'> | null,
  referencias: readonly Pick<TrackVisitRow, 'visit_def_id' | 'estimated_date' | 'offset_days'>[],
): string | null {
  if (!def || def.offset_days == null) return null
  const ref = referencias.find((v) => v.estimated_date != null && v.offset_days != null && v.visit_def_id !== def.id)
  if (!ref || ref.estimated_date == null || ref.offset_days == null) return null
  return addDaysISO(ref.estimated_date, def.offset_days - ref.offset_days)
}

/** El paciente fijo del modo `paciente`: quién, en qué estudio y en qué etapa. */
export interface PacienteFijo {
  enrollmentId: string
  patientId: string
  protocolId: string
  patientName: string
  /** El IVRS de ESTA inscripción (la misma persona en dos estudios tiene dos). */
  ivrs: string | null
  protocolCode: string
  randomizationDate: string | null
}

/** El paciente de una visita, para abrir el modal desde ella (el «recitar», Pendientes). */
export function pacienteDeVisita(v: TrackVisitRow): PacienteFijo {
  return {
    enrollmentId: v.enrollment_id,
    patientId: v.patient_id,
    protocolId: v.protocol_id,
    patientName: v.patient_name,
    ivrs: v.patient_code,
    protocolCode: v.protocol_code,
    randomizationDate: v.enrollment_randomization_date,
  }
}
