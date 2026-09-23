import { addDaysISO } from '../../../lib/dates'
import type { VisitaEquipo } from '../../../data/trackReports'
import { duracionesDe, esPendiente, ORDEN_TIPOS, promedioMin } from './agregados'
import { bucketTipoVisita, TIPO_VISITA_LABELS } from './tipoVisita'
import type { TipoVisita } from './tipoVisita'
import type { Rango } from './rango'

/**
 * La zona de equipo de Estadísticas: los números por PERSONA. Funciones puras sobre las filas de
 * `useEstadisticasEquipo`, igual que `agregados.ts`.
 *
 * DE QUIÉN ES UNA VISITA. Una sola columna, `coordinator_id`, y significa dos cosas según el caso —
 * decisión del Director (2026-09-23):
 *   · atendida → quien inició la atención (`start_visit_attention` la pisa siempre, 0102);
 *   · pendiente → la coordinadora ASIGNADA a la visita (0065).
 * Las que no tienen ninguna van a "Sin asignar", y NO se descartan: una visita vencida que nunca se
 * atendió no tiene quién la atendió, y agrupar sólo por eso las borraba en silencio (ya pasó).
 */

export const SIN_ASIGNAR = '__sin_asignar__'

function claveCoord(v: VisitaEquipo): string {
  return v.coordinator_id ?? SIN_ASIGNAR
}

function nombreCoord(v: VisitaEquipo): string {
  if (!v.coordinator_id) return 'Sin asignar'
  return v.coordinator_name?.trim() || 'Sin nombre'
}

function atendidasEn(rows: readonly VisitaEquipo[], r: Rango): VisitaEquipo[] {
  return rows.filter((v) => v.real_date != null && v.real_date >= r.desde && v.real_date <= r.hasta)
}

/** "Sin asignar" siempre al final: no es una persona y no compite en el orden. */
function ordenarPorVisitas<T extends { clave: string; visitas: number; nombre: string }>(filas: T[]): T[] {
  return filas.sort((a, b) => {
    if (a.clave === SIN_ASIGNAR) return 1
    if (b.clave === SIN_ASIGNAR) return -1
    return b.visitas - a.visitas || a.nombre.localeCompare(b.nombre, 'es')
  })
}

/** Más recientes primero: por fecha real, y dentro del día por la hora del primer sello que haya. */
function masRecientePrimero(a: VisitaEquipo, b: VisitaEquipo): number {
  const fa = a.real_date ?? ''
  const fb = b.real_date ?? ''
  if (fa !== fb) return fb.localeCompare(fa)
  const ha = a.arrived_at ?? a.attended_at ?? ''
  const hb = b.arrived_at ?? b.attended_at ?? ''
  return hb.localeCompare(ha)
}

/* ───────────────────────────── Carga de trabajo mensual ───────────────────────────── */

export interface FilaCarga {
  clave: string
  nombre: string
  /** Visitas ATENDIDAS en el mes. */
  visitas: number
  diasConVisitas: number
  /** Visitas por día CON visitas (no por día hábil: un día sin visitas no es un día trabajado). */
  porDia: number | null
  pico: { fecha: string; visitas: number } | null
  /** Pendientes abiertos de las visitas del mes, por coordinadora asignada. */
  pendientes: number
  /** Una cifra por día del mes, en el orden de `ResultadoCarga.dias`. */
  serie: number[]
  atendidas: VisitaEquipo[]
}

export interface ResultadoCarga {
  dias: string[]
  filas: FilaCarga[]
  totalVisitas: number
  totalDias: number
  porDia: number | null
  pico: { fecha: string; visitas: number } | null
  totalPendientes: number
  /** Personas, sin contar "Sin asignar". */
  coordinadoras: number
}

function diasDe(r: Rango): string[] {
  const dias: string[] = []
  for (let d = r.desde; d <= r.hasta; d = addDaysISO(d, 1)) dias.push(d)
  return dias
}

function picoDe(fechas: readonly string[]): { fecha: string; visitas: number } | null {
  const cuenta = new Map<string, number>()
  for (const f of fechas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1)
  let pico: { fecha: string; visitas: number } | null = null
  // Empate: el primero del mes, para que el resultado no dependa del orden en que llegaron las filas.
  for (const [fecha, visitas] of [...cuenta].sort(([a], [b]) => a.localeCompare(b))) {
    if (!pico || visitas > pico.visitas) pico = { fecha, visitas }
  }
  return pico
}

export function cargaMensual(rows: readonly VisitaEquipo[], mes: Rango): ResultadoCarga {
  const dias = diasDe(mes)
  const atendidas = atendidasEn(rows, mes)
  const pendientes = rows.filter(esPendiente)

  const grupos = new Map<string, { nombre: string; atendidas: VisitaEquipo[]; pendientes: number }>()
  const grupo = (v: VisitaEquipo) => {
    const k = claveCoord(v)
    let g = grupos.get(k)
    if (!g) grupos.set(k, (g = { nombre: nombreCoord(v), atendidas: [], pendientes: 0 }))
    return g
  }
  for (const v of atendidas) grupo(v).atendidas.push(v)
  for (const v of pendientes) grupo(v).pendientes += 1

  const filas = ordenarPorVisitas(
    [...grupos].map(([clave, g]) => {
      const fechas = g.atendidas.map((v) => v.real_date as string)
      const diasConVisitas = new Set(fechas).size
      return {
        clave,
        nombre: g.nombre,
        visitas: g.atendidas.length,
        diasConVisitas,
        porDia: diasConVisitas ? g.atendidas.length / diasConVisitas : null,
        pico: picoDe(fechas),
        pendientes: g.pendientes,
        serie: dias.map((d) => fechas.filter((f) => f === d).length),
        atendidas: [...g.atendidas].sort(masRecientePrimero),
      }
    }),
  )

  const fechasTodas = atendidas.map((v) => v.real_date as string)
  const totalDias = new Set(fechasTodas).size
  return {
    dias,
    filas,
    totalVisitas: atendidas.length,
    totalDias,
    porDia: totalDias ? atendidas.length / totalDias : null,
    pico: picoDe(fechasTodas),
    totalPendientes: pendientes.length,
    coordinadoras: filas.filter((f) => f.clave !== SIN_ASIGNAR).length,
  }
}

/* ───────────────────────────── Tiempos por coordinadora ───────────────────────────── */

export interface TipoDeCoordinadora {
  tipo: TipoVisita
  label: string
  visitas: number
  atencionProm: number | null
}

export interface FilaTiempos {
  clave: string
  nombre: string
  visitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
  /** Atención contra el promedio general, en %. `null` si falta cualquiera de los dos. */
  desvioPct: number | null
  /** Sobre cuántas de `visitas` se pudo medir la atención. */
  coberturaAtencion: number
  porTipo: TipoDeCoordinadora[]
  atendidas: VisitaEquipo[]
}

export interface ResultadoTiempos {
  filas: FilaTiempos[]
  visitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
}

/**
 * Tono del desvío. Los cortes (±10 % y ±25 %) son de presentación, no una norma clínica: dicen
 * "parecido", "se aparta" y "se aparta mucho" del promedio del propio centro.
 */
export type TonoDesvio = 'ok' | 'medio' | 'alto'
export function tonoDesvio(pct: number): TonoDesvio {
  const a = Math.abs(pct)
  if (a <= 10) return 'ok'
  if (a <= 25) return 'medio'
  return 'alto'
}

export function tiemposPorCoordinadora(rows: readonly VisitaEquipo[], rango: Rango): ResultadoTiempos {
  const atendidas = atendidasEn(rows, rango)
  const general = atendidas.map(duracionesDe)
  const atencionGeneral = promedioMin(general.map((d) => d.atencion))

  const grupos = new Map<string, VisitaEquipo[]>()
  for (const v of atendidas) {
    const k = claveCoord(v)
    const arr = grupos.get(k)
    if (arr) arr.push(v)
    else grupos.set(k, [v])
  }

  const filas = ordenarPorVisitas(
    [...grupos].map(([clave, vs]) => {
      const ds = vs.map(duracionesDe)
      const atencionProm = promedioMin(ds.map((d) => d.atencion))
      const porBucket = new Map<TipoVisita, VisitaEquipo[]>()
      for (const v of vs) {
        const b = bucketTipoVisita(v)
        const arr = porBucket.get(b)
        if (arr) arr.push(v)
        else porBucket.set(b, [v])
      }
      return {
        clave,
        nombre: nombreCoord(vs[0]),
        visitas: vs.length,
        esperaProm: promedioMin(ds.map((d) => d.espera)),
        atencionProm,
        estadiaProm: promedioMin(ds.map((d) => d.estadia)),
        desvioPct:
          atencionProm != null && atencionGeneral != null && atencionGeneral > 0
            ? Math.round(((atencionProm - atencionGeneral) / atencionGeneral) * 100)
            : null,
        coberturaAtencion: ds.filter((d) => d.atencion != null).length,
        porTipo: ORDEN_TIPOS.filter((t) => porBucket.has(t)).map((tipo) => {
          const vt = porBucket.get(tipo)!
          return {
            tipo,
            label: TIPO_VISITA_LABELS[tipo],
            visitas: vt.length,
            atencionProm: promedioMin(vt.map((v) => duracionesDe(v).atencion)),
          }
        }),
        atendidas: [...vs].sort(masRecientePrimero),
      }
    }),
  )

  return {
    filas,
    visitas: atendidas.length,
    esperaProm: promedioMin(general.map((d) => d.espera)),
    atencionProm: atencionGeneral,
    estadiaProm: promedioMin(general.map((d) => d.estadia)),
  }
}

/* ───────────────────────────── Detalle visita por visita ───────────────────────────── */

export type OrdenDetalle = 'fecha' | 'esp' | 'aten' | 'est' | 'pac'
/** a: hasta 20 min · b: 21 a 30 · c: más de 30. */
export type RangoEspera = '' | 'a' | 'b' | 'c'

export interface FiltrosDetalle {
  q: string
  /** `coordinator_id`, o `SIN_ASIGNAR`. */
  coord: string
  /** Código del estudio. */
  est: string
  tipo: '' | TipoVisita
  esp: RangoEspera
  /** Fecha real, ISO. */
  fecha: string
  orden: OrdenDetalle
}

export const FILTROS_VACIOS: FiltrosDetalle = { q: '', coord: '', est: '', tipo: '', esp: '', fecha: '', orden: 'fecha' }

export interface FilaDetalle {
  v: VisitaEquipo
  tipo: TipoVisita
  espera: number | null
  atencion: number | null
  estadia: number | null
}

/** Las filas del detalle: las visitas ATENDIDAS del período, con sus tiempos ya calculados. */
export function filasDetalle(rows: readonly VisitaEquipo[], rango: Rango): FilaDetalle[] {
  return atendidasEn(rows, rango)
    .sort(masRecientePrimero)
    .map((v) => ({ v, tipo: bucketTipoVisita(v), ...duracionesDe(v) }))
}

/** Cuántos filtros hay puestos. El orden no cuenta: no saca filas. */
export function contarFiltros(f: FiltrosDetalle): number {
  return [f.q.trim(), f.coord, f.est, f.tipo, f.esp, f.fecha].filter(Boolean).length
}

/** Sin mayúsculas ni tildes: "rocio" encuentra a "Rocío". */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function pasaEspera(espera: number | null, rango: RangoEspera): boolean {
  if (!rango) return true
  // Sin espera medida no cae en ningún tramo: pedir "más de 30" no puede devolver una visita sin dato.
  if (espera == null) return false
  if (rango === 'a') return espera <= 20
  if (rango === 'b') return espera > 20 && espera <= 30
  return espera > 30
}

/** Numérico de mayor a menor, con las visitas sin dato AL FINAL (no son "cero minutos"). */
function desc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

/** Todos los filtros son Y entre sí. Devuelve una lista nueva, ya ordenada. */
export function filtrarDetalle(filas: readonly FilaDetalle[], f: FiltrosDetalle): FilaDetalle[] {
  const q = normalizar(f.q.trim())
  const out = filas.filter((x) => {
    if (f.coord && claveCoord(x.v) !== f.coord) return false
    if (f.est && x.v.protocol_code !== f.est) return false
    if (f.tipo && x.tipo !== f.tipo) return false
    if (f.fecha && x.v.real_date !== f.fecha) return false
    if (!pasaEspera(x.espera, f.esp)) return false
    if (q) {
      const texto = normalizar([x.v.patient_name, x.v.patient_code ?? '', x.v.visit_name ?? '', x.v.protocol_code].join(' '))
      if (!texto.includes(q)) return false
    }
    return true
  })
  switch (f.orden) {
    case 'fecha': return out.sort((a, b) => masRecientePrimero(a.v, b.v))
    case 'esp': return out.sort((a, b) => desc(a.espera, b.espera) || masRecientePrimero(a.v, b.v))
    case 'aten': return out.sort((a, b) => desc(a.atencion, b.atencion) || masRecientePrimero(a.v, b.v))
    case 'est': return out.sort((a, b) => desc(a.estadia, b.estadia) || masRecientePrimero(a.v, b.v))
    case 'pac': return out.sort((a, b) => a.v.patient_name.localeCompare(b.v.patient_name, 'es') || masRecientePrimero(a.v, b.v))
  }
}

/** El pie de la tabla: se recalcula sobre lo FILTRADO. */
export function resumenDetalle(filas: readonly FilaDetalle[]) {
  return {
    visitas: filas.length,
    espera: promedioMin(filas.map((x) => x.espera)),
    atencion: promedioMin(filas.map((x) => x.atencion)),
    estadia: promedioMin(filas.map((x) => x.estadia)),
  }
}

/** Las opciones de los desplegables salen del período ENTERO, no de lo filtrado: si no, al elegir un
 *  estudio el desplegable de estudio se quedaría con una sola opción y no se podría cambiar. */
export function opcionesDetalle(filas: readonly FilaDetalle[]) {
  const coords = new Map<string, string>()
  const estudios = new Map<string, string>()
  const tipos = new Set<TipoVisita>()
  const fechas = new Set<string>()
  for (const x of filas) {
    coords.set(claveCoord(x.v), nombreCoord(x.v))
    estudios.set(x.v.protocol_code, x.v.protocol_name)
    tipos.add(x.tipo)
    if (x.v.real_date) fechas.add(x.v.real_date)
  }
  return {
    coordinadoras: [...coords]
      .sort(([ka, a], [kb, b]) => (ka === SIN_ASIGNAR ? 1 : kb === SIN_ASIGNAR ? -1 : a.localeCompare(b, 'es')))
      .map(([value, label]) => ({ value, label })),
    estudios: [...estudios].sort(([a], [b]) => a.localeCompare(b)).map(([value, nombre]) => ({ value, label: value, nombre })),
    tipos: ORDEN_TIPOS.filter((t) => tipos.has(t)).map((t) => ({ value: t, label: TIPO_VISITA_LABELS[t] })),
    fechas: [...fechas].sort((a, b) => b.localeCompare(a)),
  }
}

/* ───────────────────────────── Proyección ───────────────────────────── */

export interface SemanaProyeccion {
  desde: string
  hasta: string
  visitas: number
}

export interface ResultadoProyeccion {
  semanas: SemanaProyeccion[]
  total: number
  /** Los tres estudios con más visitas agendadas; el resto junto en `otros`. */
  estudios: { protocolCode: string; protocolName: string; visitas: number }[]
  otros: { estudios: number; visitas: number }
}

/** El rango de la proyección: las cuatro semanas que empiezan MAÑANA. */
export function rangoProyeccion(hoy: string): Rango {
  return { desde: addDaysISO(hoy, 1), hasta: addDaysISO(hoy, 28) }
}

/**
 * Lo AGENDADO para las próximas cuatro semanas: sin atender y sin la marca de "no vino". No hay
 * línea de capacidad a propósito (decisión del Director, 2026-09-23): ese dato no existe todavía, y
 * dibujar un tope inventado sería afirmar algo que nadie midió.
 */
export function proyeccion(rows: readonly VisitaEquipo[], hoy: string): ResultadoProyeccion {
  const r = rangoProyeccion(hoy)
  const agendadas = rows.filter(
    (v) => v.real_date == null && v.no_show_at == null && v.estimated_date != null && v.estimated_date >= r.desde && v.estimated_date <= r.hasta,
  )
  const semanas: SemanaProyeccion[] = [0, 1, 2, 3].map((i) => {
    const desde = addDaysISO(r.desde, i * 7)
    const hasta = addDaysISO(desde, 6)
    return { desde, hasta, visitas: agendadas.filter((v) => (v.estimated_date as string) >= desde && (v.estimated_date as string) <= hasta).length }
  })

  const porEstudio = new Map<string, { protocolCode: string; protocolName: string; visitas: number }>()
  for (const v of agendadas) {
    const e = porEstudio.get(v.protocol_code)
    if (e) e.visitas += 1
    else porEstudio.set(v.protocol_code, { protocolCode: v.protocol_code, protocolName: v.protocol_name, visitas: 1 })
  }
  const orden = [...porEstudio.values()].sort((a, b) => b.visitas - a.visitas || a.protocolCode.localeCompare(b.protocolCode))
  const resto = orden.slice(3)
  return {
    semanas,
    total: agendadas.length,
    estudios: orden.slice(0, 3),
    otros: { estudios: resto.length, visitas: resto.reduce((s, e) => s + e.visitas, 0) },
  }
}
