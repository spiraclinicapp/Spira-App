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
 * «Una visita pendiente del estudio» (decisión 7 del spec): las visitas sin atender del estudio, para
 * traerlas al día que se mira. Las de más adelante Y las atrasadas cuya ventana sigue abierta (el
 * Director, 2026-09-28: el contador de días va «positivo o negativo»); las atrasadas primero, por
 * fecha. Sin las del mismo día (ya están ahí), las faltas ni las de ventana vencida: ésas tienen su
 * propia salida (Pendientes).
 */
export function visitasParaTraer(visitas: readonly TrackVisitRow[], dia: string): TrackVisitRow[] {
  return visitas
    .filter((v) => v.real_date === null && v.no_show_at === null && v.estimated_date !== null
      && v.estimated_date !== dia && v.computed_status !== 'ventana_vencida' && !inscripcionCerrada(v.enrollment_status))
    .sort((a, b) => (a.estimated_date ?? '').localeCompare(b.estimated_date ?? '') || a.patient_name.localeCompare(b.patient_name, 'es'))
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
