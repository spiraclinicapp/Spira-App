/**
 * Reglas puras de «Reportes pendientes» POR PACIENTE (plan `docs/plan-reportes-pendientes.md`): el
 * submódulo `Coordinación › Reportes` y la tarjeta del Resumen leen de acá. Una fila es un paciente
 * EN UNA VISITA —cada visita tiene su propio plazo—, y resume todos sus reportes.
 *
 * Vive aparte y con test porque todo esto falla EN SILENCIO: una visita mal agrupada desaparece, un
 * plazo mal calculado pinta de ámbar algo vencido, y la pantalla se ve igual de prolija.
 *
 * LAS REGLAS DE FONDO NO SE REESCRIBEN ACÁ: qué es un reporte en juego (`esTarjeta`), qué está
 * pendiente (`esReportePendiente`) y qué venció (`isOverdue`) salen de `estados.ts`, que es lo mismo
 * que leen el tablero y el modal de la visita. Si esto tuviera su propia copia, el mismo reporte
 * diría «Vence hoy» acá y «Vencido hace 13 h» en el modal — que es exactamente el error que la
 * segunda opinión le encontró a la primera versión del plan (vencido por día calendario).
 *
 *   filas del servidor ──┐
 *                        ├─► agruparPorVisita(base, actuales, now)
 *   overlay local ──► aplicarEtapas()            │
 *   (lo que se movió     │                       ├─ QUÉ FILAS Y EN QUÉ ORDEN: lo dice la BASE
 *    en esta sesión)     └─► actuales            └─ QUÉ MUESTRA CADA FILA: lo dicen las ACTUALES
 *
 * LA BASE DECIDE QUÉ SE VE Y EN QUÉ ORDEN; LO ACTUAL, CÓMO SE VE. Es la regla que hace que una fila no
 * desaparezca de golpe al evolucionar su último reporte (handoff §3): la base todavía la tenía
 * pendiente, así que sigue a la vista —diciendo «Todo evolucionado»— hasta que la pantalla vuelve a
 * pedir los datos. Y por lo mismo NADA SE REORDENA BAJO EL CURSOR: marcar descargado lo único vencido
 * de una visita la mandaría al fondo de la lista justo mientras la persona la tiene abierta. El plan
 * pedía un conjunto aparte de «retenidas»; esto es lo mismo sin un estado más que pueda divergir.
 */
import type { FilaReportePendiente } from '../../../data/reportStatus'
import { daysDiffISO, isoDayAR } from '../../../lib/dates'
import { KIND_LABELS } from '../../../lib/visitLabels'
import { coincideBusqueda } from '../../alertFilters'
import { esReportePendiente, esTarjeta, isOverdue, isStage } from './estados'
import type { ReportStage } from './estados'

/** Lo que estas reglas leen de cada fila: las columnas que trae `useReportesPendientes`. */
export type FilaReporte = FilaReportePendiente

/** La etapa efectiva: lo que este front no conoce se lee como sin descargar (mejor pedir trabajo de
 *  más que esconderlo), igual que `ReportCard` y `tagDeReporte`. */
export function etapaDe(r: Pick<FilaReporte, 'stage'>): ReportStage {
  return isStage(r.stage) ? r.stage : 'pendiente'
}

/* ── Overlay: lo movido en esta sesión ─────────────────────────────────────────────────────── */

export const claveReporte = (r: Pick<FilaReporte, 'visit_id' | 'report_definition_id'>): string =>
  `${r.visit_id}|${r.report_definition_id}`

/**
 * Aplica las etapas movidas en esta sesión sobre las filas del servidor.
 *
 * Las filas que no cambian salen CON LA MISMA REFERENCIA: la tabla puede tener cientos y un clic
 * toca una sola. Sin overlay devuelve el mismo arreglo.
 */
export function aplicarEtapas<T extends FilaReporte>(rows: readonly T[], overlay: ReadonlyMap<string, ReportStage>): readonly T[] {
  if (overlay.size === 0) return rows
  return rows.map((r) => {
    const etapa = overlay.get(claveReporte(r))
    return etapa && etapa !== r.stage ? { ...r, stage: etapa } : r
  })
}

/* ── Plazo ─────────────────────────────────────────────────────────────────────────────────── */

export type TipoPlazo = 'vencido' | 'hoy' | 'pronto' | 'lejos' | 'falta-evolucionar' | 'sin-plazo' | 'listo'

export interface Plazo {
  tipo: TipoPlazo
  /**
   * Días calendario ARGENTINOS. En `vencido`, cuántos pasaron desde el día del vencimiento (0 =
   * venció hoy); en `hoy`/`pronto`/`lejos`, cuántos faltan. En el resto, 0.
   */
  dias: number
  /** El `due_at` que manda (el más temprano sin descargar), para ordenar. Null si no hay. */
  dueAt: string | null
}

/** Días hacia adelante que todavía cuentan como «pronto» (handoff §3: −3 ≤ plazo < 0). */
export const DIAS_PRONTO = 3

/**
 * El plazo de una visita.
 *
 * VENCIDO SE DECIDE POR INSTANTE (`isOverdue`), no por día: un reporte que venció hoy a las 09:00 ya
 * está vencido a las 22:30, como dicen el modal y el tablero. El día calendario AR sólo arma el
 * texto («Vence en 2 días», «Vencido hace 3 días»).
 *
 * Y SÓLO MIRA LO SIN DESCARGAR (decisión D3 del plan): al descargar, el plazo deja de correr
 * (`isOverdue` lo dice así desde la 0090). Si lo único que falta está descargado, la visita no está
 * vencida: le falta evolucionar.
 */
export function plazoDeVisita(tarjetas: readonly FilaReporte[], now: number): Plazo {
  const pendientes = tarjetas.filter(esReportePendiente)
  if (pendientes.length === 0) return { tipo: 'listo', dias: 0, dueAt: null }
  const sinDescargar = pendientes.filter((r) => etapaDe(r) === 'pendiente')
  if (sinDescargar.length === 0) return { tipo: 'falta-evolucionar', dias: 0, dueAt: null }

  let primero: string | null = null
  for (const r of sinDescargar) {
    if (r.due_at && (primero === null || new Date(r.due_at).getTime() < new Date(primero).getTime())) primero = r.due_at
  }
  if (primero === null) return { tipo: 'sin-plazo', dias: 0, dueAt: null }

  const hoy = isoDayAR(new Date(now).toISOString())
  const diaVence = isoDayAR(primero)
  /* `isOverdue` con la etapa ya resuelta: una etapa desconocida se lee como sin descargar acá, y
     también tiene que poder vencer. */
  if (sinDescargar.some((r) => isOverdue({ ...r, stage: 'pendiente' }, now))) {
    return { tipo: 'vencido', dias: Math.max(0, daysDiffISO(diaVence, hoy)), dueAt: primero }
  }
  const faltan = Math.max(0, daysDiffISO(hoy, diaVence))
  return { tipo: faltan === 0 ? 'hoy' : faltan <= DIAS_PRONTO ? 'pronto' : 'lejos', dias: faltan, dueAt: primero }
}

/** Cómo se dice el plazo. `corto` es el del Resumen («Vencido hace 3 d»). */
export function textoPlazo(p: Plazo, corto = false): string {
  const d = (n: number) => (corto ? `${n} d` : `${n} ${n === 1 ? 'día' : 'días'}`)
  switch (p.tipo) {
    case 'vencido': return p.dias === 0 ? 'Venció hoy' : `Vencido hace ${d(p.dias)}`
    case 'hoy': return 'Vence hoy'
    case 'pronto':
    case 'lejos': return `Vence en ${d(p.dias)}`
    case 'falta-evolucionar': return 'Falta evolucionar'
    case 'sin-plazo': return 'Sin plazo'
    case 'listo': return corto ? 'Listo' : 'Todo evolucionado'
  }
}

/** Rango del orden: más arriba lo más urgente. */
const RANGO: Record<TipoPlazo, number> = {
  vencido: 0, hoy: 1, pronto: 2, lejos: 3, 'falta-evolucionar': 4, 'sin-plazo': 5, listo: 6,
}

/* ── Agrupar ───────────────────────────────────────────────────────────────────────────────── */

export interface Conteo { sinDescargar: number; descargados: number; evolucionados: number }

export interface PacienteVisita {
  visitId: string
  protocolId: string
  protocolCode: string
  patientId: string
  patientName: string
  /** IVRS de la inscripción (0126); null si el paciente todavía no lo tiene. */
  ivrs: string | null
  /** «V17», el nombre de la visita, o su tipo si es suelta (retest, VNP). */
  visitLabel: string
  /** Los reportes en juego (ya tildados), en el orden del cronograma. Con la etapa ACTUAL. */
  reportes: FilaReporte[]
  plazo: Plazo
  conteo: Conteo
  /** Algún reporte sin descargar ya venció (`isOverdue`). Pinta de rojo el conteo y la cifra. */
  vencida: boolean
}

function rotuloVisita(r: FilaReporte): string {
  return r.visit_code || r.visit_name || KIND_LABELS[r.visit_kind] || 'Visita'
}

function contar(tarjetas: readonly FilaReporte[]): Conteo {
  const c: Conteo = { sinDescargar: 0, descargados: 0, evolucionados: 0 }
  for (const r of tarjetas) {
    const e = etapaDe(r)
    if (e === 'pendiente') c.sinDescargar++
    else if (e === 'descargado') c.descargados++
    else c.evolucionados++
  }
  return c
}

function porVisitaId(rows: readonly FilaReporte[]): Map<string, FilaReporte[]> {
  const m = new Map<string, FilaReporte[]>()
  for (const r of rows) {
    if (!esTarjeta(r)) continue
    const lista = m.get(r.visit_id)
    if (lista) lista.push(r)
    else m.set(r.visit_id, [r])
  }
  return m
}

const ordenDelCronograma = (a: FilaReporte, b: FilaReporte) =>
  (a.procedure_order ?? 9999) - (b.procedure_order ?? 9999) ||
  (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
  a.report_name.localeCompare(b.report_name, 'es')

/**
 * Una fila por visita que TENÍA algo pendiente en lo que vino del servidor (`base`), ordenadas de lo
 * más urgente a lo menos, mostrando la etapa ACTUAL (`actuales` = base + overlay).
 *
 * SÓLO CUENTAN LOS REPORTES YA TILDADOS (`esTarjeta`). Una visita cuyos reportes tildados están todos
 * evolucionados pero tiene un procedimiento SIN tildar no aparece: no hay reporte que descargar
 * todavía, y ese caso ya tiene su lugar —«Sin marcar», en Pendientes—. La regla de cierre de
 * `repartirTablero` (que mira también los no tildados) decide si la visita está CERRADA; acá la
 * pregunta es otra, «¿hay algo para hacer en esta pantalla?», y la contesta `esReportePendiente`.
 *
 * Orden: vencido (el más viejo primero) → vence hoy → pronto → más adelante (por vencimiento) →
 * falta evolucionar → sin plazo. Desempata el nombre del paciente y, al final, la visita: con un
 * orden total, dos cargas iguales se dibujan iguales.
 */
export function agruparPorVisita(
  base: readonly FilaReporte[],
  actuales: readonly FilaReporte[],
  now: number,
): PacienteVisita[] {
  const deBase = porVisitaId(base)
  const ahora = porVisitaId(actuales)
  const conOrden: { pv: PacienteVisita; orden: Plazo }[] = []

  for (const [visitId, tarjetasBase] of deBase) {
    if (!tarjetasBase.some(esReportePendiente)) continue
    const tarjetas = (ahora.get(visitId) ?? tarjetasBase).slice().sort(ordenDelCronograma)
    const r0 = tarjetas[0]
    const plazo = plazoDeVisita(tarjetas, now)
    conOrden.push({
      orden: plazoDeVisita(tarjetasBase, now),
      pv: {
        visitId,
        protocolId: r0.protocol_id,
        protocolCode: r0.protocol_code,
        patientId: r0.patient_id,
        patientName: r0.patient_name,
        ivrs: r0.patient_code,
        visitLabel: rotuloVisita(r0),
        reportes: tarjetas,
        plazo,
        conteo: contar(tarjetas),
        vencida: plazo.tipo === 'vencido',
      },
    })
  }

  conOrden.sort((a, b) =>
    RANGO[a.orden.tipo] - RANGO[b.orden.tipo] ||
    (a.orden.dueAt && b.orden.dueAt ? new Date(a.orden.dueAt).getTime() - new Date(b.orden.dueAt).getTime() : 0) ||
    a.pv.patientName.localeCompare(b.pv.patientName, 'es') ||
    a.pv.visitId.localeCompare(b.pv.visitId))
  return conOrden.map((x) => x.pv)
}

/* ── Tarjetas de estudio ───────────────────────────────────────────────────────────────────── */

export interface ResumenEstudio {
  protocolId: string
  code: string
  /** Reportes pendientes (sin descargar + descargados). La unidad de la pantalla. */
  pendientes: number
  /** Pacientes DISTINTOS: un paciente con dos visitas es uno. */
  pacientes: number
  /** Pacientes distintos con alguna visita vencida. */
  vencidos: number
  /** Segmentos de la barra apilada, en reportes. */
  barra: { vencidosSinDescargar: number; sinDescargar: number; descargados: number; evolucionados: number }
}

/**
 * Una tarjeta por estudio con filas, sobre la lista SIN filtrar (handoff §5.2.6: las cifras no
 * dependen de los filtros de abajo). Como sale de las filas visibles, un estudio cuyo último paciente
 * se acaba de evolucionar CONSERVA su tarjeta mientras esa fila siga a la vista: si no, el aviso del
 * atajo diría «ya no tiene pendientes» con la fila «Todo evolucionado» justo abajo.
 *
 * Orden: el que tiene pacientes vencidos primero, después el que más pendientes tiene; el código
 * desempata. Es lo que se decide atender primero, como en Pendientes.
 */
export function resumenPorEstudio(visitas: readonly PacienteVisita[]): ResumenEstudio[] {
  const m = new Map<string, ResumenEstudio & { pacs: Set<string>; vencs: Set<string> }>()
  for (const v of visitas) {
    let e = m.get(v.protocolId)
    if (!e) {
      e = {
        protocolId: v.protocolId, code: v.protocolCode, pendientes: 0, pacientes: 0, vencidos: 0,
        barra: { vencidosSinDescargar: 0, sinDescargar: 0, descargados: 0, evolucionados: 0 },
        pacs: new Set(), vencs: new Set(),
      }
      m.set(v.protocolId, e)
    }
    e.pendientes += v.conteo.sinDescargar + v.conteo.descargados
    e.pacs.add(v.patientId)
    if (v.vencida) {
      e.vencs.add(v.patientId)
      e.barra.vencidosSinDescargar += v.conteo.sinDescargar
    } else {
      e.barra.sinDescargar += v.conteo.sinDescargar
    }
    e.barra.descargados += v.conteo.descargados
    e.barra.evolucionados += v.conteo.evolucionados
  }
  return [...m.values()]
    .map(({ pacs, vencs, ...e }) => ({ ...e, pacientes: pacs.size, vencidos: vencs.size }))
    .sort((a, b) => b.vencidos - a.vencidos || b.pendientes - a.pendientes || a.code.localeCompare(b.code, 'es'))
}

/** Pendientes y pacientes distintos de una lista de filas: la línea de resumen y el pie del widget. */
export function totales(visitas: readonly PacienteVisita[]): { pendientes: number; pacientes: number } {
  return {
    pendientes: visitas.reduce((s, v) => s + v.conteo.sinDescargar + v.conteo.descargados, 0),
    pacientes: new Set(visitas.map((v) => v.patientId)).size,
  }
}

/* ── Filtros ───────────────────────────────────────────────────────────────────────────────── */

export const ESTADO_SIN_DESCARGAR = 'sin_descargar'
export const ESTADO_DESCARGADO = 'descargado'
export const ANT_VENCIDOS = 'vencidos'
export const ANT_SEMANA = 'semana'
export const ANT_DESPUES = 'despues'
/** Días de «Vencen en 7 días». */
export const DIAS_SEMANA = 7

export interface Filtros {
  /** `ESTADO_*`. Pasa si tiene al menos un reporte en alguno de los estados marcados. */
  estado: readonly string[]
  /** `report_name`. Pasa si tiene al menos un reporte PENDIENTE de alguno de esos tipos. */
  informe: readonly string[]
  /** `ANT_*`. Pasa si su plazo cae en alguno de los rangos. */
  antiguedad: readonly string[]
  /** Nombre, IVRS o código de estudio; sin tildes. */
  buscar: string
}

function pasaEstado(v: PacienteVisita, estado: string): boolean {
  if (estado === ESTADO_SIN_DESCARGAR) return v.conteo.sinDescargar > 0
  if (estado === ESTADO_DESCARGADO) return v.conteo.descargados > 0
  return false
}

function pasaInforme(v: PacienteVisita, informe: string): boolean {
  return v.reportes.some((r) => r.report_name === informe && esReportePendiente(r))
}

/**
 * Los rangos de Antigüedad. Los tres hablan del PLAZO, así que una visita a la que sólo le falta
 * evolucionar (sin plazo corriendo) o sin plazo definido no cae en ninguno: con el filtro puesto, se
 * va. Es lo que dice el filtro — no tiene antigüedad que medir.
 */
function pasaAntiguedad(v: PacienteVisita, rango: string): boolean {
  const p = v.plazo
  if (rango === ANT_VENCIDOS) return p.tipo === 'vencido'
  const corre = p.tipo === 'hoy' || p.tipo === 'pronto' || p.tipo === 'lejos'
  if (rango === ANT_SEMANA) return corre && p.dias <= DIAS_SEMANA
  if (rango === ANT_DESPUES) return corre && p.dias > DIAS_SEMANA
  return false
}

/** O dentro de cada filtro, Y entre filtros; la búsqueda, encima de todo. Vacío = no filtra. */
export function filtrar(visitas: readonly PacienteVisita[], f: Filtros): PacienteVisita[] {
  return visitas.filter((v) =>
    (f.estado.length === 0 || f.estado.some((e) => pasaEstado(v, e))) &&
    (f.informe.length === 0 || f.informe.some((i) => pasaInforme(v, i))) &&
    (f.antiguedad.length === 0 || f.antiguedad.some((a) => pasaAntiguedad(v, a))) &&
    coincideBusqueda({ patient_name: v.patientName, patient_code: v.ivrs, protocol_code: v.protocolCode }, f.buscar))
}

export interface OpcionFiltro { value: string; label: string; count: number }

/** Las opciones de los tres menús, con cuántas filas pasan por cada una (sobre lo que se le pase:
 *  los estudios elegidos, sin los otros filtros). Las de Informe son sólo los tipos PRESENTES:
 *  ofrecer uno que no hay lleva a una tabla vacía sin explicación. */
export function opcionesDeFiltro(visitas: readonly PacienteVisita[]): {
  estado: OpcionFiltro[]; informe: OpcionFiltro[]; antiguedad: OpcionFiltro[]
} {
  const cuenta = (pasa: (v: PacienteVisita) => boolean) => visitas.filter(pasa).length
  const tipos = new Set<string>()
  for (const v of visitas) for (const r of v.reportes) if (esReportePendiente(r)) tipos.add(r.report_name)
  return {
    estado: [
      { value: ESTADO_SIN_DESCARGAR, label: 'Sin descargar', count: cuenta((v) => pasaEstado(v, ESTADO_SIN_DESCARGAR)) },
      { value: ESTADO_DESCARGADO, label: 'Descargado, sin evolucionar', count: cuenta((v) => pasaEstado(v, ESTADO_DESCARGADO)) },
    ],
    informe: [...tipos]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((t) => ({ value: t, label: t, count: cuenta((v) => pasaInforme(v, t)) })),
    antiguedad: [
      { value: ANT_VENCIDOS, label: 'Vencidos', count: cuenta((v) => pasaAntiguedad(v, ANT_VENCIDOS)) },
      { value: ANT_SEMANA, label: `Vencen en ${DIAS_SEMANA} días`, count: cuenta((v) => pasaAntiguedad(v, ANT_SEMANA)) },
      { value: ANT_DESPUES, label: 'Más adelante', count: cuenta((v) => pasaAntiguedad(v, ANT_DESPUES)) },
    ],
  }
}
