// Reglas puras del tablero de Reportes pendientes (0090). Acá vive lo que puede quedar al revés
// SIN verse mal en pantalla: qué etapa sigue, si un reporte venció, y —la más cara de todas— si
// una visita quedó cerrada. Esa última decide qué desaparece del tablero, así que un error la
// hace desaparecer sin que nadie se entere. Lo visual (colores, columnas) se verifica mirando.
//
// La regla de cierre está ESPEJADA en `v_patient_visits.computed_status` desde la 0092, que la
// derivó de estos mismos casos: el SQL de allá y las funciones de acá tienen que decir lo mismo.
// Si alguna vez divergen, el tablero y el estado de la visita se contradicen en pantalla.
import type { ReportStatusRow } from '../../../data/reportStatus'

/** Las tres etapas, en orden. El índice ES el orden: `nextStage`/`prevStage` se mueven sobre él. */
export const STAGE_ORDER = ['pendiente', 'descargado', 'evolucionado'] as const
export type ReportStage = (typeof STAGE_ORDER)[number]

export interface StageMeta {
  label: string
  /** Rótulo del botón que LLEVA a esta etapa ("Marcar descargado"). Null en la primera. */
  cta: string | null
  /** Color del punto de la columna y del botón que avanza HACIA acá. */
  color: string
}

/**
 * Metadata por etapa.
 *
 * "Descargado" usa `#3A6B8C` fijo y no un token: el sistema no tiene un color de "en curso" y
 * inventarle uno acá sería fijarlo por la ventana. Si algún día aparece ese token, este es el
 * único lugar a cambiar. Los otros dos sí salen de tokens.
 */
export const STAGE_META: Record<ReportStage, StageMeta> = {
  pendiente:    { label: 'Pendiente',    cta: null,                  color: 'var(--spira-muted)' },
  descargado:   { label: 'Descargado',   cta: 'Marcar descargado',   color: '#3A6B8C' },
  evolucionado: { label: 'Evolucionado', cta: 'Marcar evolucionado', color: 'var(--spira-acc-deep-track)' },
}

/** ¿El texto es una etapa conocida? La base tiene un check, pero el front puede leer un schema
 *  más nuevo que él: nunca asumir que sí. */
export function isStage(value: string | null | undefined): value is ReportStage {
  return value != null && (STAGE_ORDER as readonly string[]).includes(value)
}

/** La etapa siguiente, o null si ya está en la última (ahí el botón de avanzar desaparece). */
export function nextStage(stage: ReportStage): ReportStage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

/** La etapa anterior, o null si ya está en la primera (no se retrocede más allá de pendiente). */
export function prevStage(stage: ReportStage): ReportStage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i > 0 ? STAGE_ORDER[i - 1] : null
}

/**
 * ¿El reporte está vencido?
 *
 * Sólo aplica a `pendiente`. Una vez que alguien lo descargó, el plazo dejó de correr: lo que la
 * tarjeta muestra a partir de ahí es CUÁNDO se movió, no cuánto falta. Contarlo como vencido
 * después de descargado inflaría el contador rojo del encabezado con trabajo que ya se hizo.
 *
 * El borde exacto NO cuenta como vencido: con `now === due_at` el plazo se cumple recién en el
 * instante siguiente, y un reporte que aparece en rojo el segundo en que vence se lee como error.
 */
export function isOverdue(row: Pick<ReportStatusRow, 'stage' | 'due_at' | 'completed'>, now: number = Date.now()): boolean {
  if (!row.completed || row.stage !== 'pendiente' || !row.due_at) return false
  return now > new Date(row.due_at).getTime()
}

/** Horas y días entre dos instantes, para los rótulos de vencimiento. */
function partes(ms: number): { horas: number; dias: number } {
  const horas = Math.floor(ms / 3_600_000)
  return { horas, dias: Math.floor(horas / 24) }
}

/**
 * Qué dice la tarjeta debajo del botón de la plataforma: cuánto falta, o cuánto hace que venció.
 *
 * Devuelve también `overdue` para que quien lo dibuja no tenga que volver a calcularlo (y no pueda
 * pintar de rojo un texto que dice "vence en 3 días").
 */
export function dueLabel(
  row: Pick<ReportStatusRow, 'stage' | 'due_at' | 'completed'>,
  now: number = Date.now(),
): { texto: string; overdue: boolean } {
  if (!row.completed) return { texto: 'Se habilita al marcar el procedimiento como realizado.', overdue: false }
  if (!row.due_at) return { texto: 'Sin plazo', overdue: false }
  const delta = new Date(row.due_at).getTime() - now
  if (delta >= 0) {
    const { horas, dias } = partes(delta)
    if (dias >= 1) return { texto: `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`, overdue: false }
    if (horas >= 1) return { texto: `Vence en ${horas} h`, overdue: false }
    return { texto: 'Vence en menos de 1 h', overdue: false }
  }
  const { horas, dias } = partes(-delta)
  const overdue = row.completed && row.stage === 'pendiente'
  if (dias >= 1) return { texto: `Vencido hace ${dias} ${dias === 1 ? 'día' : 'días'}`, overdue }
  if (horas >= 1) return { texto: `Vencido hace ${horas} h`, overdue }
  return { texto: 'Vencido hace menos de 1 h', overdue }
}

/**
 * ¿Un reporte ya es una TARJETA del tablero? Sólo cuando su procedimiento está realizado: antes de
 * eso el plazo no arrancó y no hay nada que gestionar.
 */
export function esTarjeta(row: Pick<ReportStatusRow, 'completed'>): boolean {
  return row.completed
}

/**
 * ¿La visita quedó cerrada?
 *
 * DOS condiciones, y la segunda es la que se olvida: todos los procedimientos con reporte tienen
 * que estar REALIZADOS, y además todos sus reportes en `evolucionado`. Mirando sólo los reportes
 * de lo ya realizado, una visita con dos procedimientos donde uno todavía no se hizo daría cerrada
 * —sus únicos reportes visibles estarían evolucionados— y se iría del tablero con trabajo adentro.
 * Por eso la vista arranca de lo ASIGNADO y no de lo realizado: el procedimiento pendiente sigue
 * presente acá, con `completed` en false.
 *
 * Ojo también con el caso vacío: una visita SIN reportes no está "cerrada", simplemente no
 * participa del tablero. Devolver true la haría aparecer en "Visitas cerradas · alerta finalizada"
 * sin que nunca hubiera habido nada que cerrar.
 *
 * Esta es la regla que la 0092 replica en `v_patient_visits.computed_status` (rama 'realizada').
 */
export function visitClosed(rows: readonly ReportStatusRow[]): boolean {
  if (rows.length === 0) return false
  return rows.every((r) => r.completed && r.stage === 'evolucionado')
}

/** Quién y cuándo cerró la visita: el ÚLTIMO movimiento, que es el que la terminó de cerrar. */
export function closedBy(rows: readonly ReportStatusRow[]): { nombre: string; cuando: string } | null {
  if (!visitClosed(rows)) return null
  let mejor: ReportStatusRow | null = null
  for (const r of rows) {
    if (!r.updated_at) continue
    if (!mejor || !mejor.updated_at || new Date(r.updated_at) > new Date(mejor.updated_at)) mejor = r
  }
  if (!mejor?.updated_at) return null
  return { nombre: mejor.updated_by_name ?? 'Equipo', cuando: mejor.updated_at }
}

/**
 * ¿Se puede destildar "realizado" este procedimiento?
 *
 * No, si alguno de sus reportes ya salió de pendiente: destildarlo borraría en cascada el historial
 * de esas etapas. Espeja el guard `guard_uncomplete_with_reports` de la 0090 — el de la base es el
 * que manda; éste existe para poder DECIRLO antes de que la persona choque contra el error.
 */
export function canUntickProcedure(rows: readonly ReportStatusRow[]): { puede: boolean; avanzados: number } {
  const avanzados = rows.filter((r) => r.stage !== 'pendiente').length
  return { puede: avanzados === 0, avanzados }
}

/** Reparte las filas en las tres columnas, respetando el orden de `STAGE_ORDER`. */
export function porEtapa(rows: readonly ReportStatusRow[]): Record<ReportStage, ReportStatusRow[]> {
  const out = { pendiente: [] as ReportStatusRow[], descargado: [] as ReportStatusRow[], evolucionado: [] as ReportStatusRow[] }
  for (const r of rows) {
    if (isStage(r.stage)) out[r.stage].push(r)
  }
  return out
}

/** Agrupa por visita. Lo usan el cierre de visita y la sección de cerradas. */
export function porVisita(rows: readonly ReportStatusRow[]): Map<string, ReportStatusRow[]> {
  const m = new Map<string, ReportStatusRow[]>()
  for (const r of rows) {
    const lista = m.get(r.visit_id) ?? []
    lista.push(r)
    m.set(r.visit_id, lista)
  }
  return m
}

/** Días que la sección "Visitas cerradas" mira hacia atrás. Ver el porqué en `visitasCerradas`. */
export const DIAS_CERRADAS = 7

/**
 * Las dos mitades del tablero: lo que sigue en juego y lo que se cerró recién.
 *
 * Una visita cuyos reportes están TODOS evolucionados sale de las tres columnas —ya no hay nada
 * que gestionar— y entra a la lista de abajo. Esa lista mira sólo los últimos días: es un acuse de
 * recibo ("esto se cerró, no lo busques más"), no el archivo del estudio. El archivo de verdad es
 * el `audit_log` y el estado de cada visita, que no se pierden. Sin ese recorte, al año de uso la
 * pantalla dibuja cientos de filas cada vez que alguien entra.
 */
export function repartirTablero(
  rows: readonly ReportStatusRow[],
  now: number = Date.now(),
): {
  enJuego: ReportStatusRow[]
  cerradas: { visitId: string; rows: ReportStatusRow[]; cierre: { nombre: string; cuando: string } | null }[]
  cerradasOcultas: number
} {
  const enJuego: ReportStatusRow[] = []
  const cerradas: { visitId: string; rows: ReportStatusRow[]; cierre: { nombre: string; cuando: string } | null }[] = []
  let cerradasOcultas = 0
  const corte = now - DIAS_CERRADAS * 86_400_000

  for (const [visitId, lista] of porVisita(rows)) {
    if (!visitClosed(lista)) {
      // El cierre se juzga con la lista COMPLETA (incluye los procedimientos sin realizar, que son
      // los que impiden cerrar), pero al tablero sólo suben los que ya son tarjeta. Un reporte cuyo
      // procedimiento todavía no se hizo no tiene columna: su lugar es el modal de la visita.
      enJuego.push(...lista.filter(esTarjeta))
      continue
    }
    const cierre = closedBy(lista)
    // Sin fecha de cierre no se puede saber si entra en la ventana: se cuenta como oculta antes
    // que mostrarla con un "cerrada por —" que no dice nada.
    if (cierre && new Date(cierre.cuando).getTime() >= corte) cerradas.push({ visitId, rows: lista, cierre })
    else cerradasOcultas++
  }

  // Las cerradas, de la más reciente a la más vieja: lo que se acaba de cerrar es lo que se mira.
  cerradas.sort((a, b) => new Date(b.cierre?.cuando ?? 0).getTime() - new Date(a.cierre?.cuando ?? 0).getTime())
  return { enJuego, cerradas, cerradasOcultas }
}

/** Cuántos reportes en juego están vencidos (el badge rojo del encabezado). */
export function contarVencidos(rows: readonly ReportStatusRow[], now: number = Date.now()): number {
  return rows.filter((r) => isOverdue(r, now)).length
}
