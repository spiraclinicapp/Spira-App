/* ┌─ El calendario de Visitas: períodos, pasos y de qué día es cada visita ─────────────────────┐
   Lógica PURA de las vistas Mes / Semana / Día (handoff `docs/design_handoff_visitas_calendario/`).
   Vive aparte de los componentes para poder testearse, y hay que testearla por el mismo motivo que
   `motivosDelDia`: una visita en la celda equivocada, una semana que arranca un martes o un «mes
   siguiente» que saltea febrero no se ven mal. La grilla se dibuja igual de prolija mintiendo.

   TODA LA ARITMÉTICA ES EN UTC SOBRE CADENAS `YYYY-MM-DD`. Un `new Date('2026-10-08')` es la
   medianoche UTC, que en Argentina cae a las 21:00 del día anterior; y CI corre en UTC mientras esta
   máquina corre en AR, así que un test que pase acá puede caer en la PR (ya pasó). Con `Date.UTC` y
   `getUTC*` el resultado es el mismo en cualquier zona.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */
import { isoDayAR } from '../../../lib/dates'
import type { FechasVisita, OperationalStage } from '../../../data/dayVisits'
import type { VisitStatus } from '../../../data/visits'

export type VistaCalendario = 'mes' | 'semana' | 'dia'

/** Orden FIJO del selector (handoff §1.2c): Mes · Semana · Día, siempre a la derecha. */
export const VISTAS: readonly VistaCalendario[] = ['mes', 'semana', 'dia']

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
/* «sep» y no «sept»: es la abreviatura de tres letras de la RAE y la que dibuja el mock
   («29 sep – 3 oct»). */
const MESES_CORTOS = MESES.map((m) => m.slice(0, 3))
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function partes(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

function aISO(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mm}-${dd}`
}

function utc(iso: string): number {
  const [y, m, d] = partes(iso)
  return Date.UTC(y, m - 1, d)
}

export function sumarDias(iso: string, n: number): string {
  return aISO(utc(iso) + n * 86_400_000)
}

/**
 * Suma meses RECORTANDO el día al último del mes de destino: 31/01 + 1 = 28/02 (29 en bisiesto), no
 * 03/03. `Date.UTC(2026, 1, 31)` desborda a marzo, y en un calendario eso es saltearse febrero entero
 * al apretar «siguiente» parado en un 31.
 */
export function sumarMeses(iso: string, n: number): string {
  const [y, m, d] = partes(iso)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return aISO(Date.UTC(ny, nm, Math.min(d, ultimo)))
}

/** 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(iso: string): number {
  return new Date(utc(iso)).getUTCDay()
}

export function lunesDe(iso: string): string {
  return sumarDias(iso, -((diaDeLaSemana(iso) + 6) % 7))
}

export const esFinDeSemana = (iso: string) => {
  const d = diaDeLaSemana(iso)
  return d === 0 || d === 6
}

export function primeroDelMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function ultimoDelMes(iso: string): string {
  const [y, m] = partes(iso)
  return aISO(Date.UTC(y, m, 0))
}

/**
 * El PERÍODO de la vista: lo que cuentan los contadores y lo que ve el panel de filtros.
 *
 * La semana va de lunes a DOMINGO aunque la grilla muestre L–V: el fin de semana aparece solo cuando
 * tiene visitas (ver `conFinDeSemana`), así que sin visitas el sábado y el domingo no suman nada al
 * conteo, y con visitas se dibujan. Contar siempre los siete días es lo que impide que una visita de
 * un sábado exista en los números y no en la pantalla, o al revés.
 */
export function periodoDe(vista: VistaCalendario, iso: string): { desde: string; hasta: string } {
  if (vista === 'dia') return { desde: iso, hasta: iso }
  if (vista === 'semana') {
    const lunes = lunesDe(iso)
    return { desde: lunes, hasta: sumarDias(lunes, 6) }
  }
  return { desde: primeroDelMes(iso), hasta: ultimoDelMes(iso) }
}

/** Paso de ‹ › y de las flechas: Día ±1 día · Semana ±7 · Mes ±1 mes. */
export function pasoPeriodo(vista: VistaCalendario, iso: string, n: number): string {
  if (vista === 'dia') return sumarDias(iso, n)
  if (vista === 'semana') return sumarDias(iso, 7 * n)
  return sumarMeses(iso, n)
}

/** «Hoy» se deshabilita cuando el período visible ya lo contiene (handoff §1.2a). */
export function contieneHoy(vista: VistaCalendario, iso: string, hoy: string): boolean {
  const { desde, hasta } = periodoDe(vista, iso)
  return hoy >= desde && hoy <= hasta
}

/**
 * La etiqueta del período (handoff §1.2b): principal + año aparte.
 *   Día     «Jueves 8 de octubre» · 2026
 *   Semana  «5 – 9 oct», o «29 sep – 3 oct» si cruza de mes · año del FINAL (la semana del 29/12
 *           al 2/01 ya es del año nuevo en la grilla que viene)
 *   Mes     «Octubre» · 2026
 * `conFinDeSemana` corre el final de la semana al domingo, igual que la grilla.
 */
export function rotuloPeriodo(vista: VistaCalendario, iso: string, conFinDeSemana = false): { principal: string; anio: string } {
  const [y, m, d] = partes(iso)
  if (vista === 'dia') return { principal: `${cap(DIAS[diaDeLaSemana(iso)])} ${d} de ${MESES[m - 1]}`, anio: String(y) }
  if (vista === 'mes') return { principal: cap(MESES[m - 1]), anio: String(y) }
  const desde = lunesDe(iso)
  const hasta = sumarDias(desde, conFinDeSemana ? 6 : 4)
  const [, ma, da] = partes(desde)
  const [yb, mb, db] = partes(hasta)
  const inicio = ma === mb ? `${da}` : `${da} ${MESES_CORTOS[ma - 1]}`
  return { principal: `${inicio} – ${db} ${MESES_CORTOS[mb - 1]}`, anio: String(yb) }
}

/**
 * La grilla del mes: semanas enteras desde el lunes de la semana del 1° hasta la que contiene el
 * último día. Cada semana trae sus siete días; cuántas columnas se dibujan lo decide quien la usa
 * (`conFinDeSemana`). El primer y el último día del RANGO son lo que hay que pedirle a la base: los
 * días de los meses vecinos también se dibujan (atenuados), con sus visitas.
 */
export function grillaDelMes(iso: string): { semanas: string[][]; desde: string; hasta: string } {
  const primero = primeroDelMes(iso)
  const ultimo = ultimoDelMes(iso)
  const inicio = lunesDe(primero)
  const semanas: string[][] = []
  for (let lunes = inicio; lunes <= ultimo; lunes = sumarDias(lunes, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)))
  }
  return { semanas, desde: inicio, hasta: semanas[semanas.length - 1][6] }
}

/** Lo que hay que pedirle a la base para dibujar la vista (la grilla del mes excede al mes). */
export function rangoDeConsulta(vista: VistaCalendario, iso: string): { desde: string; hasta: string } {
  if (vista === 'mes') {
    const { desde, hasta } = grillaDelMes(iso)
    return { desde, hasta }
  }
  return periodoDe(vista, iso)
}

/** ¿Hay que dibujar sábado y domingo? Sólo si alguna visita cae en uno (nunca esconder una visita). */
export function conFinDeSemana(dias: Iterable<string>): boolean {
  for (const d of dias) if (esFinDeSemana(d)) return true
  return false
}

// ————————————————————————————————————————————————————
// De qué día es una visita
// ————————————————————————————————————————————————————

/** Las fechas que deciden el día de una visita: las mismas que trae `useVisitDates`, sin el id. */
export type FechasDeVisita = Omit<FechasVisita, 'id'>

/**
 * Los días en los que aparece una visita: el ESPEJO en el cliente de `motivosDelDia`
 * (`data/dayVisitsFilter.ts`), que decide lo mismo del lado de la base para la vista Día. Si estas
 * dos reglas divergen, la semana muestra una visita en un día y al hacer clic en ese día, la lista no
 * la tiene. Por eso los dos test describen los mismos casos.
 *
 *   · la citación (`estimated_date`) sólo manda mientras la visita no se atendió;
 *   · la fecha realizada (`real_date`), siempre;
 *   · las marcas operativas, en el día LOCAL en que pasaron (offset fijo −03:00, `isoDayAR`).
 *
 * Casi siempre es un solo día; puede ser más si una marca cayó en otro (llegó a las 23:50 y se
 * cerró pasada la medianoche), y entonces aparece en los dos, igual que en la lista del día.
 */
export function diasDeLaVisita(v: FechasDeVisita): string[] {
  const dias = new Set<string>()
  if (v.real_date === null && v.estimated_date) dias.add(v.estimated_date)
  if (v.real_date) dias.add(v.real_date)
  for (const marca of [v.arrived_at, v.ready_at, v.left_at]) if (marca) dias.add(isoDayAR(marca))
  return [...dias].sort()
}

/** Agrupa visitas por día, dentro de `[desde, hasta]`. Una visita de dos días entra en los dos. */
export function visitasPorDia<T extends FechasDeVisita>(filas: T[], desde: string, hasta: string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const v of filas) {
    for (const d of diasDeLaVisita(v)) {
      if (d < desde || d > hasta) continue
      const lista = out.get(d)
      if (lista) lista.push(v)
      else out.set(d, [v])
    }
  }
  return out
}

/** Las visitas que tienen al menos un día dentro del período, una sola vez cada una. */
export function visitasDelPeriodo<T extends FechasDeVisita>(filas: T[], desde: string, hasta: string): T[] {
  return filas.filter((v) => diasDeLaVisita(v).some((d) => d >= desde && d <= hasta))
}

// ————————————————————————————————————————————————————
// Estado, grupo y rótulos cortos
// ————————————————————————————————————————————————————

/** Lo que hace falta para decidir el estado de una fila. `no_show_at` es opcional para las filas
 *  que no lo traen (tests, otras pantallas): sin él vale sólo el estado clínico. */
export interface FilaConEstado {
  operational_stage: OperationalStage
  computed_status: VisitStatus
  no_show_at?: string | null
}

/**
 * «No vino»: se marcó la falta y el paciente nunca llegó. Chip, grupo, contador, filtro y botón leen
 * de acá: si uno usara otra regla, la misma fila diría «No vino» en el chip y contaría como «por
 * llegar».
 *
 * NO alcanza con `computed_status = 'por_reprogramar'`: en la vista, `ventana_vencida` le gana
 * (0144), así que una falta cuya ventana venció dejaba de leerse «No vino» y volvía a ofrecer
 * «Marcar llegada» mientras el menú ⋯ ofrecía «Deshacer no vino». La marca `no_show_at` la limpian
 * la llegada y el reagendado (0067), así que con la etapa todavía en «por llegar» es la falta vigente.
 */
export function esNoVino(v: FilaConEstado): boolean {
  return v.computed_status === 'por_reprogramar' || (!!v.no_show_at && v.operational_stage === 'por_llegar')
}

/** Clave de ESTADO de una fila para filtrar: la etapa operativa, salvo «No vino», que gana. */
export type EstadoDeFila = OperationalStage | 'por_reprogramar'

export function estadoDeFila(v: FilaConEstado): EstadoDeFila {
  return esNoVino(v) ? 'por_reprogramar' : v.operational_stage
}

export type GrupoDeVisita = 'centro' | 'llegar' | 'fin'

/**
 * Los tres grupos de la vista Día y de los contadores (handoff §3): En el centro · Por llegar ·
 * Finalizadas. «No vino» va a Finalizadas aunque operativamente siga «por llegar»: el paciente ya no
 * viene, y dejarlo entre los que se esperan es mandar a recepción a buscarlo.
 */
export function grupoDeVisita(v: FilaConEstado): GrupoDeVisita {
  if (esNoVino(v)) return 'fin'
  if (v.operational_stage === 'concurrio_al_centro' || v.operational_stage === 'inicio_atencion') return 'centro'
  if (v.operational_stage === 'fin_atencion') return 'fin'
  return 'llegar'
}

export interface ConteoPorGrupo { total: number; llegar: number; centro: number; fin: number }

export function contarPorGrupo(filas: FilaConEstado[]): ConteoPorGrupo {
  const c: ConteoPorGrupo = { total: filas.length, llegar: 0, centro: 0, fin: 0 }
  for (const v of filas) c[grupoDeVisita(v)]++
  return c
}

/** El orden de los grupos en el encabezado del período, y en el resumen de una celda del mes. */
export const ORDEN_GRUPOS: GrupoDeVisita[] = ['llegar', 'centro', 'fin']

/**
 * La celda del mes en estilo «Resumen» (la alternativa del handoff §5): cuántas visitas de cada grupo,
 * sin nombres. Es lo que se dibuja cuando la celda queda angosta —una tablet—, donde la lista de
 * nombres se reducía a una inicial o a nada. Sólo los grupos con visitas, en el orden del encabezado
 * del período, que es la leyenda: un «0 en el centro» en cada celda sería ruido.
 */
export function resumenDelDia(filas: FilaConEstado[]): { grupo: GrupoDeVisita; n: number }[] {
  const c = contarPorGrupo(filas)
  return ORDEN_GRUPOS.filter((g) => c[g] > 0).map((g) => ({ grupo: g, n: c[g] }))
}

/**
 * Orden de las visitas dentro de un día (la lista, la columna de la semana y la celda del mes): lo
 * que está pasando arriba —en atención, después las que concurrieron—, luego las que se esperan y al
 * final las cerradas, «No vino» último; a igual estado, por hora de llegada y después por nombre. Es
 * el orden base que ya tenía la lista del día, con «No vino» en su grupo.
 */
const RANGO_ESTADO: EstadoDeFila[] = ['inicio_atencion', 'concurrio_al_centro', 'por_llegar', 'fin_atencion', 'por_reprogramar']

export function compararVisitas(
  a: FilaConEstado & { arrived_at: string | null; patient_name: string },
  b: FilaConEstado & { arrived_at: string | null; patient_name: string },
): number {
  return RANGO_ESTADO.indexOf(estadoDeFila(a)) - RANGO_ESTADO.indexOf(estadoDeFila(b))
    || (a.arrived_at ?? '').localeCompare(b.arrived_at ?? '')
    || a.patient_name.localeCompare(b.patient_name)
}

/**
 * «Ricardo Lucio Aguero» → «R. Aguero», para la celda del mes (handoff §5). Inicial del primer
 * nombre + la última palabra. Un nombre de una sola palabra queda como está.
 */
export function nombreCorto(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean)
  if (p.length < 2) return p[0] ?? ''
  return `${p[0][0]}. ${p[p.length - 1]}`
}

/**
 * El código de la visita recortado para la celda del mes: «V2 W4» → «V2». Las continuaciones y los
 * retest conservan su origen («Cont. V3», «Retest V3»): recortados a la primera palabra dirían
 * «Cont.» a secas, que no identifica nada.
 */
/**
 * ¿Se puede reprogramar desde la fila? Recepción, y sólo si la visita no pasó: `rescheduleVisit` es un
 * update directo que sólo toca `estimated_date` y no mira `real_date` ni la etapa (ni la RLS, que
 * sólo verifica rol/protocolo), así que reprogramar una visita ya atendida deja una visita fantasma en
 * la fecha nueva. Mismo guard que AgendaView/PatientFichaView; lo usan el botón y el menú ⋯.
 */
export function puedeReprogramar(v: { real_date: string | null }, canReception: boolean): boolean {
  return canReception && v.real_date === null
}

export function codigoCorto(codigo: string): string {
  const p = codigo.trim().split(/\s+/)
  if ((p[0] === 'Cont.' || p[0] === 'Retest') && p[1]) return `${p[0]} ${p[1]}`
  return p[0] ?? ''
}
