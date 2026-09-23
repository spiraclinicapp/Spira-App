import { minutesBetween } from '../../../lib/dates'
import { fueraDeVentana } from '../../../lib/visits'
import { bucketTipoVisita, TIPO_VISITA_LABELS } from './tipoVisita'
import type { TipoVisita, VisitaParaTipo } from './tipoVisita'
import type { Rango } from './rango'
import type { VisitKind } from '../../../lib/visitLabels'
import type { VisitStatus } from '../../../data/visits'

/**
 * Los agregados de Estadísticas › Coordinación se calculan acá, en TypeScript, sobre las filas que
 * trae `useTrackPeriodVisits` — mismo criterio que `views/pharma/reportes/agregados.ts`: UN SOLO
 * snapshot alimenta las dos tablas, así que no pueden contradecirse entre sí ni con el pie de cada
 * una (los `tfoot` se recalculan de las mismas filas, nunca de una consulta aparte).
 */

/** Fila de `v_track_visits` con las columnas que necesita esta pantalla (ver `data/trackReports.ts`). */
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
 * "Visitas" de `porEstudio`/`porTipo` tiene que significar lo mismo el día que se agregue.
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

function esPendiente(v: VisitaEstadistica): boolean {
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

/* ───────────────────────────── Promedio por tipo de visita ───────────────────────────── */

/** Duraciones en minutos de UNA visita; `null` cuando falta alguno de los dos sellos que hacen falta. */
interface Duraciones {
  espera: number | null
  atencion: number | null
  estadia: number | null
}

function duracionesDe(v: VisitaEstadistica): Duraciones {
  return {
    espera: v.arrived_at && v.attended_at ? minutesBetween(v.arrived_at, v.attended_at) : null,
    atencion: v.attended_at && v.ready_at ? minutesBetween(v.attended_at, v.ready_at) : null,
    estadia: v.arrived_at && v.left_at ? minutesBetween(v.arrived_at, v.left_at) : null,
  }
}

/** Promedio redondeado a minuto entero; `null` sobre una lista vacía (no inventa un cero). */
function promedioMin(valores: readonly (number | null)[]): number | null {
  const nums = valores.filter((n): n is number => n != null)
  if (nums.length === 0) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function maximoMin(valores: readonly (number | null)[]): number | null {
  const nums = valores.filter((n): n is number => n != null)
  return nums.length === 0 ? null : Math.max(...nums)
}

export interface FilaPorEstudioDeTipo {
  protocolCode: string
  protocolName: string
  visitas: number
  atencionProm: number | null
}

export interface FilaPorTipo {
  tipo: TipoVisita
  label: string
  /** Visitas ATENDIDAS del período, de este tipo (no exige que tengan los 4 sellos). */
  visitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
  estadiaMax: number | null
  porEstudio: FilaPorEstudioDeTipo[]
  /**
   * Sobre cuántas de las `visitas` se pudo calcular cada promedio (algunas no tienen los cuatro
   * sellos — una visita telefónica, o una que quedó a medio marcar). Si alguna cobertura es menor
   * a `visitas`, la vista lo tiene que avisar: un promedio parcial sin decirlo es el "cero que
   * miente" que este repo evita en otros lados (ver `roles.ts`).
   */
  cobertura: { espera: number; atencion: number; estadia: number }
}

export interface ResultadoPorTipo {
  filas: FilaPorTipo[]
  totalVisitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
  estadiaMax: number | null
}

/** Orden fijo de exhibición (no alfabético: el recorrido clínico real del paciente por el estudio). */
const ORDEN_TIPOS: readonly TipoVisita[] = ['screening', 'randomizacion', 'tratamiento', 'seguimiento', 'no_programada']

/**
 * Agrupa las visitas ATENDIDAS del período (`real_date` en rango) por tipo, con desglose por
 * estudio para la fila expandida. Sólo mira atendidas: una visita agendada a futuro no tiene
 * sellos que promediar.
 */
export function porTipo(rows: readonly VisitaEstadistica[], rango: Rango): ResultadoPorTipo {
  const atendidas = rows.filter((v) => v.real_date != null && v.real_date >= rango.desde && v.real_date <= rango.hasta)

  const porBucket = new Map<TipoVisita, VisitaEstadistica[]>()
  for (const v of atendidas) {
    const b = bucketTipoVisita(v)
    const arr = porBucket.get(b)
    if (arr) arr.push(v)
    else porBucket.set(b, [v])
  }

  const filas: FilaPorTipo[] = ORDEN_TIPOS.filter((t) => porBucket.has(t)).map((tipo) => {
    const vs = porBucket.get(tipo)!
    const duraciones = vs.map(duracionesDe)

    const porProtocolo = new Map<string, VisitaEstadistica[]>()
    for (const v of vs) {
      const arr = porProtocolo.get(v.protocol_id)
      if (arr) arr.push(v)
      else porProtocolo.set(v.protocol_id, [v])
    }
    const porEstudioFilas: FilaPorEstudioDeTipo[] = [...porProtocolo.values()]
      .map((vsE) => ({
        protocolCode: vsE[0].protocol_code,
        protocolName: vsE[0].protocol_name,
        visitas: vsE.length,
        atencionProm: promedioMin(vsE.map((v) => duracionesDe(v).atencion)),
      }))
      .sort((a, b) => b.visitas - a.visitas)

    return {
      tipo,
      label: TIPO_VISITA_LABELS[tipo],
      visitas: vs.length,
      esperaProm: promedioMin(duraciones.map((d) => d.espera)),
      atencionProm: promedioMin(duraciones.map((d) => d.atencion)),
      estadiaProm: promedioMin(duraciones.map((d) => d.estadia)),
      estadiaMax: maximoMin(duraciones.map((d) => d.estadia)),
      porEstudio: porEstudioFilas,
      cobertura: {
        espera: duraciones.filter((d) => d.espera != null).length,
        atencion: duraciones.filter((d) => d.atencion != null).length,
        estadia: duraciones.filter((d) => d.estadia != null).length,
      },
    }
  })

  const todasDuraciones = atendidas.map(duracionesDe)
  return {
    filas,
    totalVisitas: atendidas.length,
    esperaProm: promedioMin(todasDuraciones.map((d) => d.espera)),
    atencionProm: promedioMin(todasDuraciones.map((d) => d.atencion)),
    estadiaProm: promedioMin(todasDuraciones.map((d) => d.estadia)),
    estadiaMax: maximoMin(todasDuraciones.map((d) => d.estadia)),
  }
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
