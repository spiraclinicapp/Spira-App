import type { TrackVisitRow } from '../../data/visits'
import type { MarcaRow } from '../../data/pendientes'
import { inscripcionCerrada } from '../../data/deviationModel'
import { daysDiffISO, formatAR, isoDayAR } from '../../lib/dates'
import { visitTitle } from '../../lib/visits'

/**
 * Reglas puras de «pendientes por retomar» y del retest con origen (v0145). Tienen test
 * (`retomar.test.ts`): todas fallan en silencio si quedan al revés.
 *
 * «HECHO» (decisión 9 del spec): en la app sólo se tildan los procedimientos que dejan reporte. Uno
 * sin reporte no tiene casilla en ningún lado, así que se da por hecho cuando la visita se atendió.
 * Es la misma regla que `procedimiento_hecho()` en la base, que es la que manda: ésta sólo decide
 * qué se OFRECE, para no ofrecer algo que el servidor rechazaría.
 */

/** Lo que estas reglas necesitan de un procedimiento de la visita (`VisitProcedureStatus` lo cumple). */
export interface ProcedimientoConEstado {
  procedure_id: string
  name: string
  completed: boolean
  tiene_reporte: boolean
}

/** Un procedimiento que se puede elegir en una lista de casillas. */
export interface ProcedimientoElegible {
  procedure_id: string
  name: string
}

const elegible = ({ procedure_id, name }: ProcedimientoConEstado): ProcedimientoElegible => ({ procedure_id, name })

/**
 * Lo que dispara el aviso al finalizar: lo que deja reporte y no se tildó. Uno sin reporte nunca lo
 * dispara — casi todas las visitas llevan alguno (signos vitales), y el aviso saltaría siempre.
 */
export function pendientesAlFinalizar(items: readonly ProcedimientoConEstado[]): ProcedimientoElegible[] {
  return items.filter((p) => p.tiene_reporte && !p.completed).map(elegible)
}

/**
 * Lo que el aviso al finalizar NOMBRA sin preguntar: lo que no deja reporte. Finalizar lo da por
 * hecho (decisión 9; `procedimiento_hecho()` en la base), y el Director pidió que se VEA qué se
 * está confirmando al finalizar (2026-09-28) — sin sumarle una casilla por cada signo vital.
 */
export function seDanPorHechos(items: readonly ProcedimientoConEstado[]): ProcedimientoElegible[] {
  return items.filter((p) => !p.tiene_reporte).map(elegible)
}

/** Lo que un retest puede repetir de su visita de origen: lo que se hizo ahí. */
export function procedimientosRepetibles(items: readonly ProcedimientoConEstado[], atendida: boolean): ProcedimientoElegible[] {
  if (!atendida) return []
  return items.filter((p) => p.completed || !p.tiene_reporte).map(elegible)
}

/** Hasta cuántos días atrás se ofrece una visita como origen de un retest (decisión 8 del spec). */
export const DIAS_DEL_RETEST = 60

/** Las visitas que se pueden repetir: atendidas en los últimos `dias`, la más reciente primero. */
export function visitasParaRetest(visitas: readonly TrackVisitRow[], hoy: string, dias = DIAS_DEL_RETEST): TrackVisitRow[] {
  return visitas
    .filter((v) => {
      if (v.real_date === null || inscripcionCerrada(v.enrollment_status)) return false
      const hace = daysDiffISO(v.real_date, hoy)
      return hace >= 0 && hace <= dias
    })
    .sort((a, b) => (b.real_date ?? '').localeCompare(a.real_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
}

/**
 * «Una visita pendiente del estudio» (decisión 7 del spec): TODA visita sin hacer, para traerla al
 * día elegido. Las de más adelante, las atrasadas, las de ventana vencida y las faltas («No vino»).
 * Las atrasadas primero, por fecha.
 *
 * Las vencidas y las faltas quedaban afuera porque «tienen su salida en Pendientes», y el Director lo
 * dio vuelta (2026-09-28): «¿por qué no figuran estas si son visitas pendientes? … las puedo hacer
 * siempre desde el agendar visita». Una visita que no se hizo se tiene que poder agendar desde el
 * lugar donde se agenda. Traer una vencida no la vuelve en ventana —el formulario avisa que queda
 * afuera, y la desviación se documenta igual—; traer una falta limpia el «No vino», que es la salida
 * de «Por reprogramar» (`rescheduleVisit`).
 *
 * Afuera: las hechas, las del mismo día (ya están ahí), la que está en el centro ahora
 * (`en_atencion`) y las inscripciones cerradas.
 */
export function visitasParaTraer(visitas: readonly TrackVisitRow[], dia: string): TrackVisitRow[] {
  return visitas
    .filter((v) => v.real_date === null && v.estimated_date !== null && v.estimated_date !== dia
      && v.computed_status !== 'en_atencion' && !inscripcionCerrada(v.enrollment_status))
    .sort((a, b) => (a.estimated_date ?? '').localeCompare(b.estimated_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
}

/**
 * Por qué una visita de «Una visita pendiente del estudio» no es una pendiente cualquiera: la segunda
 * línea de la opción. `null` = nada que decir (futura, o atrasada con la ventana abierta: eso ya lo
 * dice el contador). La ventana vencida va primero porque es la que implica una desviación.
 */
export function marcaDePendiente(v: Pick<TrackVisitRow, 'computed_status' | 'no_show_at'>): string | null {
  if (v.computed_status === 'ventana_vencida') return 'Ventana vencida'
  if (v.no_show_at !== null) return 'No vino'
  return null
}

/**
 * «Se pasó la fecha» (Pendientes, 2026-09-28): visitas cuya fecha ya pasó sin hacerse, que NO son
 * faltas y cuya ventana sigue abierta. Para la base siguen siendo `proxima`, así que no avisaban en
 * ningún lado hasta vencerse la ventana — que es justo cuando ya es tarde. El Director: «de alguna
 * forma yo tengo que poder acceder de forma fácil a este dato para no dejarla pasar».
 *
 * Es una regla del FRONT y no un estado nuevo de la base a propósito: un valor nuevo de
 * `computed_status` lo leen la campana, el Resumen, la ficha y Estadísticas, y cambiaría lo que
 * cuentan todos. Acá vive sólo en Pendientes, como «Por retomar».
 *
 * `proxima` ya garantiza sin hacer, sin «No vino» y con la ventana abierta (ver el `case` de la
 * vista, 0144); se repiten las dos primeras para que la regla no dependa de eso en silencio. Las
 * inscripciones cerradas se van: sin paciente en el estudio no hay nada que reprogramar.
 */
export function visitasConFechaPasada(visitas: readonly TrackVisitRow[], hoy: string): TrackVisitRow[] {
  return visitas
    .filter((v) => v.computed_status === 'proxima' && v.real_date === null && v.no_show_at === null
      && v.estimated_date !== null && v.estimated_date < hoy && !inscripcionCerrada(v.enrollment_status))
    .sort((a, b) => (a.estimated_date ?? '').localeCompare(b.estimated_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
}

/**
 * Cuánto le queda a la ventana de una visita con la fecha pasada: lo que dice cuánto apura. `null`
 * sin ventana (una VNP, un retest: no tienen) — ahí no hay plazo que contar, y lo que se ve es sólo
 * la fecha que se pasó.
 */
export function cierreDeVentana(v: Pick<TrackVisitRow, 'window_end'>, hoy: string): string | null {
  if (!v.window_end) return null
  const d = daysDiffISO(hoy, v.window_end)
  if (d < 0) return null // ya vencida: ése es otro aviso
  if (d === 0) return 'la ventana cierra hoy'
  if (d === 1) return 'la ventana cierra mañana'
  return `la ventana cierra en ${d} días`
}

/**
 * El contador de «Una visita pendiente del estudio»: cuántos días hay entre el día que se mira y la
 * fecha de la visita. «+2 d» = le faltan dos; «−5 d» = se pasó hace cinco (va con el signo menos
 * tipográfico, no el guion, para que la columna quede pareja). `atrasada` tiñe el número en la lista.
 */
export function contadorDeDias(fecha: string, dia: string): { texto: string; atrasada: boolean } {
  const d = daysDiffISO(dia, fecha)
  return { texto: d === 0 ? '0 d' : `${d > 0 ? '+' : '−'}${Math.abs(d)} d`, atrasada: d < 0 }
}

/** Una visita con lo que dejó para otro día. */
export interface VisitaPorRetomar {
  visita: TrackVisitRow
  procedimientos: ProcedimientoElegible[]
  /** La marca más vieja: desde cuándo espera. */
  desde: string
}

/**
 * Agrupa las marcas por visita. Deja afuera:
 *  · una marca cuya visita no llegó (la RLS de `v_track_visits` no la deja ver): sin visita no hay
 *    fila que dibujar;
 *  · las inscripciones cerradas: con el paciente fuera del estudio no hay nada que retomar, y como
 *    la fila no se puede descartar quedaría para siempre.
 */
export function agruparPorRetomar(marcas: readonly MarcaRow[], visitas: readonly TrackVisitRow[]): VisitaPorRetomar[] {
  const porId = new Map(visitas.map((v) => [v.id, v]))
  const acc = new Map<string, VisitaPorRetomar>()
  for (const m of marcas) {
    const visita = porId.get(m.visit_id)
    if (!visita || inscripcionCerrada(visita.enrollment_status)) continue
    const g = acc.get(m.visit_id) ?? { visita, procedimientos: [], desde: m.marked_at }
    g.procedimientos.push({ procedure_id: m.procedure_id, name: m.procedure_name })
    // ISO con el mismo huso (PostgREST devuelve `+00:00`): se compara como texto.
    if (m.marked_at < g.desde) g.desde = m.marked_at
    acc.set(m.visit_id, g)
  }
  const out = [...acc.values()]
  for (const g of out) g.procedimientos.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return out.sort((a, b) => a.desde.localeCompare(b.desde) || a.visita.patient_name.localeCompare(b.visita.patient_name, 'es'))
}

/** Una visita finalizada con procedimientos que dejan reporte y nadie tildó. */
export interface VisitaSinMarcar {
  visita: TrackVisitRow
  procedimientos: ProcedimientoElegible[]
}

/**
 * «Sin marcar» (Pendientes, 2026-09-28): agrupa por visita los reportes cuyo procedimiento nadie
 * tildó, y se queda sólo con las visitas FINALIZADAS (`ready_at`). Mientras la atención sigue, lo sin
 * tildar es lo que falta hacer, no una anomalía — el mismo corte que `sinMarcar` en el modal.
 *
 * UN procedimiento aparece UNA vez aunque defina dos reportes: lo que se resuelve es el tilde, que es
 * del procedimiento. Contar reportes haría decir «2 sin marcar» a un único laboratorio.
 *
 * A diferencia de «Por retomar», las inscripciones cerradas QUEDAN: aquello es trabajo por hacer con
 * el paciente, que ya no puede hacerse; esto es el registro de algo que pasó mientras estaba en el
 * estudio, y se puede tildar igual. Una visita que no llegó (la RLS no la deja ver) no dibuja fila.
 * La más vieja primero: es la que más tiempo lleva con el reporte sin arrancar.
 */
export function agruparSinMarcar(
  reportes: readonly { visit_id: string; procedure_id: string; procedure_name: string }[],
  visitas: readonly TrackVisitRow[],
): VisitaSinMarcar[] {
  const porId = new Map(visitas.map((v) => [v.id, v]))
  const acc = new Map<string, VisitaSinMarcar>()
  for (const r of reportes) {
    const visita = porId.get(r.visit_id)
    if (!visita || !visita.ready_at) continue
    const g = acc.get(r.visit_id) ?? { visita, procedimientos: [] }
    if (!g.procedimientos.some((p) => p.procedure_id === r.procedure_id)) {
      g.procedimientos.push({ procedure_id: r.procedure_id, name: r.procedure_name })
    }
    acc.set(r.visit_id, g)
  }
  const out = [...acc.values()]
  for (const g of out) g.procedimientos.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return out.sort((a, b) => (a.visita.real_date ?? '').localeCompare(b.visita.real_date ?? '')
    || a.visita.patient_name.localeCompare(b.visita.patient_name, 'es'))
}

/** Hace cuántos días espera, contando en días argentinos (la marca es un timestamptz). */
export function diasEsperando(desde: string, hoy: string): number {
  return Math.max(0, daysDiffISO(isoDayAR(desde), hoy))
}

/** Un paciente del estudio, para elegirlo en una VNP. */
export interface PacienteDelEstudio {
  enrollment_id: string
  patient_name: string
  patient_code: string | null
}

/** Uno por inscripción, sin las cerradas, por nombre. Sale de las visitas del estudio. */
export function pacientesDelEstudio(visitas: readonly TrackVisitRow[]): PacienteDelEstudio[] {
  const acc = new Map<string, PacienteDelEstudio>()
  for (const v of visitas) {
    if (inscripcionCerrada(v.enrollment_status) || acc.has(v.enrollment_id)) continue
    acc.set(v.enrollment_id, { enrollment_id: v.enrollment_id, patient_name: v.patient_name, patient_code: v.patient_code })
  }
  return [...acc.values()].sort((a, b) => a.patient_name.localeCompare(b.patient_name, 'es'))
}

/**
 * «V3 W4 · Juan Pérez · 12/9/2026»: cómo se nombra una visita en los desplegables de agendar. Sin el
 * paciente (`conPaciente: false`) cuando el modal ya lo tiene fijo arriba (la ficha, v0145): repetirlo
 * en cada opción es ruido.
 */
export function rotuloDeVisita(v: TrackVisitRow, { conPaciente = true }: { conPaciente?: boolean } = {}): string {
  const fecha = v.real_date ?? v.estimated_date
  return `${visitTitle(v)}${conPaciente ? ` · ${v.patient_name}` : ''}${fecha ? ` · ${formatAR(fecha)}` : ''}`
}
