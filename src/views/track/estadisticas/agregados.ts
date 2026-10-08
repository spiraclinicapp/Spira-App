import { minutesBetween } from '../../../lib/dates'
import { fueraDeVentana } from '../../../lib/visits'
import { bucketTipoVisita } from './tipoVisita'
import type { TipoVisita, VisitaParaTipo } from './tipoVisita'
import type { Rango } from './rango'
import { KIND_LABELS } from '../../../lib/visitLabels'
import type { VisitKind } from '../../../lib/visitLabels'
import type { VisitStatus } from '../../../data/visits'

/**
 * Los agregados de Estadísticas › Coordinación se calculan acá, en TypeScript, sobre las filas que
 * trae `useEstadisticasEquipo` — mismo criterio que `views/pharma/reportes/agregados.ts`: UN SOLO
 * snapshot alimenta las tablas del período, así que no pueden contradecirse entre sí ni con el pie de
 * cada una (los `tfoot` se recalculan de las mismas filas, nunca de una consulta aparte).
 */

/** Lo que estas reglas necesitan de una visita (la fila completa es `VisitaEquipo`, en `data/trackReports.ts`). */
export interface VisitaEstadistica extends VisitaParaTipo {
  id: string
  protocol_id: string
  protocol_code: string
  protocol_name: string
  real_date: string | null
  estimated_date: string | null
  window_start: string | null
  window_end: string | null
  no_show_at: string | null
  computed_status: VisitStatus
  arrived_at: string | null
  attended_at: string | null
  ready_at: string | null
  left_at: string | null
}

export type { VisitKind }

/** Mismo set que `useVisitAlerts` (`data/visits.ts`): las tres clases de pendiente (0107). */
const PENDIENTE_STATUSES: ReadonlySet<VisitStatus> = new Set(['ventana_vencida', 'item_vencido', 'por_reprogramar'])

/**
 * ¿La visita cae en el período elegido? Dos caminos, nunca los dos: si ya se atendió, cuenta su
 * fecha real; si no, su fecha estimada (agendada o vencida sin atender). Es el mismo criterio que
 * usaría el Hero del handoff para "Visitas del período" — no se construye acá, pero el número de
 * "Visitas" de `porEstudio`/`porVisita` tiene que significar lo mismo el día que se agregue.
 */
function enPeriodo(v: VisitaEstadistica, rango: Rango): boolean {
  const fecha = v.real_date ?? v.estimated_date
  if (!fecha) return false
  return fecha >= rango.desde && fecha <= rango.hasta
}

/** Perdida = se marcó que el paciente no vino, o la ventana cerró sin atenderse. */
function esPerdida(v: VisitaEstadistica): boolean {
  return v.no_show_at != null || v.computed_status === 'ventana_vencida'
}

export function esPendiente(v: VisitaEstadistica): boolean {
  return PENDIENTE_STATUSES.has(v.computed_status)
}

/** ¿Tiene ventana para medir "en ventana"? Las sueltas (kind ≠ programada) no tienen — no suman ni
 *  restan al %, no cuentan como "fuera". */
function tieneVentanaMedible(v: VisitaEstadistica): boolean {
  return v.real_date != null && v.window_start != null && v.window_end != null
}

/* ───────────────────────────── Por estudio ───────────────────────────── */

export interface FilaPorEstudio {
  protocolId: string
  protocolCode: string
  protocolName: string
  visitas: number
  perdidas: number
  /** `de` = visitas con ventana medible (las sueltas quedan afuera de los dos lados). */
  enVentana: { si: number; de: number }
  pendientes: number
}

export interface ResultadoPorEstudio {
  filas: FilaPorEstudio[]
  totalVisitas: number
  totalPerdidas: number
  totalEnVentana: { si: number; de: number }
  totalPendientes: number
}

/** Agrupa las visitas del período por protocolo. Orden: más visitas primero (lo que se mira primero). */
export function porEstudio(rows: readonly VisitaEstadistica[], rango: Rango): ResultadoPorEstudio {
  const delPeriodo = rows.filter((v) => enPeriodo(v, rango))

  const porProtocolo = new Map<string, VisitaEstadistica[]>()
  for (const v of delPeriodo) {
    const arr = porProtocolo.get(v.protocol_id)
    if (arr) arr.push(v)
    else porProtocolo.set(v.protocol_id, [v])
  }

  const filas: FilaPorEstudio[] = [...porProtocolo.values()]
    .map((vs) => {
      const conVentana = vs.filter(tieneVentanaMedible)
      const enVentanaSi = conVentana.filter((v) => !fueraDeVentana(v.real_date, v.window_start, v.window_end))
      return {
        protocolId: vs[0].protocol_id,
        protocolCode: vs[0].protocol_code,
        protocolName: vs[0].protocol_name,
        visitas: vs.length,
        perdidas: vs.filter(esPerdida).length,
        enVentana: { si: enVentanaSi.length, de: conVentana.length },
        pendientes: vs.filter(esPendiente).length,
      }
    })
    .sort((a, b) => b.visitas - a.visitas)

  const conVentanaTotal = delPeriodo.filter(tieneVentanaMedible)
  const enVentanaTotalSi = conVentanaTotal.filter((v) => !fueraDeVentana(v.real_date, v.window_start, v.window_end))

  return {
    filas,
    totalVisitas: delPeriodo.length,
    totalPerdidas: delPeriodo.filter(esPerdida).length,
    totalEnVentana: { si: enVentanaTotalSi.length, de: conVentanaTotal.length },
    totalPendientes: delPeriodo.filter(esPendiente).length,
  }
}

/* ───────────────────────────── Tiempos por visita ───────────────────────────── */

/** Duraciones en minutos de UNA visita; `null` cuando falta alguno de los dos sellos que hacen falta. */
export interface Duraciones {
  espera: number | null
  atencion: number | null
  estadia: number | null
}

export function duracionesDe(v: VisitaEstadistica): Duraciones {
  return {
    espera: v.arrived_at && v.attended_at ? minutesBetween(v.arrived_at, v.attended_at) : null,
    atencion: v.attended_at && v.ready_at ? minutesBetween(v.attended_at, v.ready_at) : null,
    estadia: v.arrived_at && v.left_at ? minutesBetween(v.arrived_at, v.left_at) : null,
  }
}

/** Promedio redondeado a minuto entero; `null` sobre una lista vacía (no inventa un cero). */
export function promedioMin(valores: readonly (number | null)[]): number | null {
  const nums = valores.filter((n): n is number => n != null)
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

export function maximoMin(valores: readonly (number | null)[]): number | null {
  const nums = valores.filter((n): n is number => n != null)
  return nums.length === 0 ? null : Math.max(...nums)
}

/** Las medidas de tiempo de un grupo de visitas (una visita del cuadro, o un estudio entero). */
export interface Tiempos {
  /** Visitas ATENDIDAS del período en el grupo (no exige que tengan los cuatro sellos). */
  visitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
  estadiaMax: number | null
  /**
   * Sobre cuántas de las `visitas` se pudo calcular cada promedio (algunas no tienen los cuatro
   * sellos — una visita telefónica, o una que quedó a medio marcar). Si alguna cobertura es menor
   * a `visitas`, la vista lo tiene que avisar: un promedio parcial sin decirlo es el "cero que
   * miente" que este repo evita en otros lados (ver `roles.ts`).
   */
  cobertura: { espera: number; atencion: number; estadia: number }
}

/**
 * Por debajo de esto, una atención no se promedia (Director, 2026-10-08). Con los datos reales, las
 * atenciones de 0 y 1 min eran visitas cargadas después, con "Iniciar atención" y "Lista" marcados
 * uno atrás del otro — no visitas de un minuto. Sumadas, bajaban el promedio que se usa para estimar
 * cuánto dura una visita (LTS daba 29 min con una única atención real de 1 h 27). Quedan afuera
 * igual que una visita sin sellos: no suman a `cobertura.atencion`, así la tabla dice "sobre N".
 * Sólo la atención: una espera de 0 min es perfectamente real (el paciente pasó de una).
 */
export const ATENCION_MINIMA_MIN = 5

function tiemposDe(vs: readonly VisitaEstadistica[]): Tiempos {
  const d = vs.map(duracionesDe).map((x) => ({
    ...x,
    atencion: x.atencion != null && x.atencion < ATENCION_MINIMA_MIN ? null : x.atencion,
  }))
  return {
    visitas: vs.length,
    esperaProm: promedioMin(d.map((x) => x.espera)),
    atencionProm: promedioMin(d.map((x) => x.atencion)),
    estadiaProm: promedioMin(d.map((x) => x.estadia)),
    estadiaMax: maximoMin(d.map((x) => x.estadia)),
    cobertura: {
      espera: d.filter((x) => x.espera != null).length,
      atencion: d.filter((x) => x.atencion != null).length,
      estadia: d.filter((x) => x.estadia != null).length,
    },
  }
}

export interface FilaDeVisita extends Tiempos {
  /** Estable dentro del estudio: `kind` + nombre de la definición (ver `claveDeVisita`). */
  clave: string
  label: string
}

export interface FilaPorVisitaDeEstudio extends Tiempos {
  protocolId: string
  protocolCode: string
  protocolName: string
  porVisita: FilaDeVisita[]
}

export interface ResultadoPorVisita extends Tiempos {
  filas: FilaPorVisitaDeEstudio[]
}

/** Orden fijo de exhibición (no alfabético: el recorrido clínico real del paciente por el estudio). */
export const ORDEN_TIPOS: readonly TipoVisita[] = ['screening', 'randomizacion', 'tratamiento', 'seguimiento', 'no_programada']

/**
 * Rango de una visita dentro de su estudio. Tratamiento y Seguimiento comparten el escalón a
 * propósito: los dos son visitas comunes del cuadro, y entre ellas manda el orden natural del
 * nombre (V4, V5, V6…) — si Seguimiento fuera un escalón aparte, una "Seguimiento 1" quedaría
 * antes de la V10 por la heurística de texto de `bucketTipoVisita`, no por el cuadro.
 */
const RANGO_TIPO: Record<TipoVisita, number> = {
  screening: 0, randomizacion: 1, tratamiento: 2, seguimiento: 2, no_programada: 3,
}

/**
 * Qué es "la misma visita" para promediar. Las del cuadro, por el nombre de su definición: todas
 * las V5 de un estudio son una fila. Las sueltas, por su `kind` — y si además traen nombre, por
 * los dos: un retest de la V5 NO es la V5 (repite una prueba, no la visita entera), y mezclarlos
 * bajaría el promedio que se usa para estimar cuánto dura la V5 de verdad.
 */
function claveDeVisita(v: VisitaEstadistica): { clave: string; label: string } {
  if (v.kind === 'programada' && v.visit_name) return { clave: `programada:${v.visit_name}`, label: v.visit_name }
  const base = KIND_LABELS[v.kind]
  return v.visit_name
    ? { clave: `${v.kind}:${v.visit_name}`, label: `${base} · ${v.visit_name}` }
    : { clave: v.kind, label: base }
}

const nombreNatural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

/**
 * Tiempos por visita: las visitas ATENDIDAS del período (`real_date` en rango) agrupadas por
 * estudio y, adentro, por visita del cuadro — "la V5 de ACT18301 tarda, en promedio, esto". Sirve
 * para estimar cuánto va a durar una visita antes de agendarla (Director, 2026-10-08). Sólo mira
 * atendidas: una visita agendada a futuro no tiene sellos que promediar.
 *
 * Orden: estudios con más visitas primero; adentro, el recorrido del paciente (Screening,
 * Randomización, el cuadro por nombre natural, las no programadas al final).
 */
export function porVisita(rows: readonly VisitaEstadistica[], rango: Rango): ResultadoPorVisita {
  const atendidas = rows.filter((v) => v.real_date != null && v.real_date >= rango.desde && v.real_date <= rango.hasta)

  const porProtocolo = new Map<string, VisitaEstadistica[]>()
  for (const v of atendidas) {
    const arr = porProtocolo.get(v.protocol_id)
    if (arr) arr.push(v)
    else porProtocolo.set(v.protocol_id, [v])
  }

  const filas: FilaPorVisitaDeEstudio[] = [...porProtocolo.values()]
    .map((vs) => {
      const grupos = new Map<string, { label: string; rango: number; vs: VisitaEstadistica[] }>()
      for (const v of vs) {
        const { clave, label } = claveDeVisita(v)
        const g = grupos.get(clave)
        if (g) {
          g.vs.push(v)
          // Una misma V5 puede caer en escalones distintos si cambió el rol de la definición: manda el menor.
          g.rango = Math.min(g.rango, RANGO_TIPO[bucketTipoVisita(v)])
        } else {
          grupos.set(clave, { label, rango: RANGO_TIPO[bucketTipoVisita(v)], vs: [v] })
        }
      }
      const porVisitaFilas: FilaDeVisita[] = [...grupos.entries()]
        .sort(([, a], [, b]) => a.rango - b.rango || nombreNatural.compare(a.label, b.label))
        .map(([clave, g]) => ({ clave, label: g.label, ...tiemposDe(g.vs) }))
      return {
        protocolId: vs[0].protocol_id,
        protocolCode: vs[0].protocol_code,
        protocolName: vs[0].protocol_name,
        ...tiemposDe(vs),
        porVisita: porVisitaFilas,
      }
    })
    .sort((a, b) => b.visitas - a.visitas)

  return { filas, ...tiemposDe(atendidas) }
}

/* ───────────────────────────── Formato ───────────────────────────── */

/** "1 h 12 min" / "38 min" / "—". Formato largo (con espacios) del handoff — distinto del
 *  `elapsedShort`/`durationShort` compacto ("1h 5m") que usa el resto de la app para chips. */
export function formatMinutosLargo(mins: number | null): string {
  if (mins == null) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const resto = mins % 60
  return `${h} h ${String(resto).padStart(2, '0')} min`
}
