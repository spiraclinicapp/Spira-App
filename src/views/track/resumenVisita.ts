/**
 * ┌─ El Resumen de la visita ──────────────────────────────────────────────────────────────────┐
 *
 * Qué LLEVA una visita, en cuatro señales: cuántos procedimientos, si lleva sangre, si lleva kit de
 * producto en investigación y cuántos reportes quedan por cargar. Las mismas cuatro alimentan el
 * panel «Resumen de la visita» del modal y la tira compacta de la fila de Visitas del día, para
 * poder programar la agenda sin abrir cada visita (plan `docs/plan-resumen-de-visita.md`).
 *
 * TODO lo de acá falla EN SILENCIO —la tira se dibuja igual de prolija con el dato al revés—, así
 * que vive separado de los componentes y con test. Tres trampas que ya costaron discusión:
 *
 *  · «No lleva sangre» es una AFIRMACIÓN, y sólo se dice cuando todos los procedimientos de la
 *    visita lo definieron. Con uno sin definir no se dibuja nada: en una agenda clínica, un
 *    «Sin sangre» falso se lee como un hecho (ayuno, tubos, courier).
 *  · El kit IP sale de `v_visit_ip_status` (0119), que es la ÚNICA fuente de esa regla, y NO del
 *    `dispenses_ip` del cronograma: la vista ya resuelve el pedido fuera de cronograma, el valor
 *    sellado al fechar la visita y los cierres. Un IP cerrado por excepción no se cuenta.
 *  · El catálogo de procedimientos es GLOBAL y un día mezcla estudios, así que la sangre se cruza
 *    SIEMPRE por (estudio, procedimiento). Por `procedure_id` solo, la sangre de un estudio se
 *    pinta en las visitas de otro.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { TITULO_IP } from './ipEstado'
import { esReportePendiente } from './reportes/estados'

/** 'si' / 'no' / null = no se puede afirmar (hay procedimientos sin definir). */
export type Sangre = 'si' | 'no' | null

/** Un procedimiento del cuadro, con lo que la tira necesita saber de él. */
export interface ProcedimientoDeVisita {
  procedure_id: string
  name: string
  /** `protocol_procedures.draws_blood` (0134). `null` = sin definir. */
  draws_blood: boolean | null
  /** Si el procedimiento define algún reporte en este estudio (0089). */
  tieneReporte: boolean
}

/** Un ítem del listado que se abre al apuntar el conteo. */
export interface ItemDeVisita extends ProcedimientoDeVisita {
  /** La entrega del producto en investigación: va primera y no sale del cuadro. */
  esIp: boolean
}

export interface ResumenVisita {
  /** Procedimientos del cuadro + la entrega del IP, si la lleva. */
  total: number
  items: ItemDeVisita[]
  sangre: Sangre
  kitIp: boolean
}

/** Lo mínimo que hace falta de `v_visit_ip_status` para decidir si la visita lleva kit. */
export interface IpDeVisita {
  /** `no_corresponde` | `entregado_en_otra_visita` | null. */
  cierre: string | null
}

/**
 * ¿La visita lleva kit de producto en investigación?
 *
 * Hay fila en `v_visit_ip_status` —la vista ya decidió que esta visita lo lleva— y nadie la cerró
 * por excepción. Un «No corresponde» o un «Se entregó en otra visita» dicen exactamente que ESTA
 * visita no lo lleva, así que la señal se apaga.
 */
export function llevaKitIp(ip: IpDeVisita | null | undefined): boolean {
  return ip != null && ip.cierre === null
}

/** Si la visita lleva sangre. Ver la regla en la cabecera: `null` no es «no». */
export function sangreDeVisita(procs: readonly ProcedimientoDeVisita[]): Sangre {
  if (procs.some((p) => p.draws_blood === true)) return 'si'
  if (procs.length > 0 && procs.every((p) => p.draws_blood === false)) return 'no'
  return null
}

/**
 * El resumen de UNA visita, o `null` cuando no hay nada que decir.
 *
 * `null` y no un resumen vacío: la fila del día no dibuja la tira ni escribe un texto de reemplazo
 * («Sin procedimientos» sería ruido en cada renglón de una agenda). El modal, en cambio, explica el
 * vacío con su propia frase — ahí un panel con título y nada adentro se lee como un error.
 */
export function resumenDeVisita(
  procs: readonly ProcedimientoDeVisita[],
  ip: IpDeVisita | null | undefined,
): ResumenVisita | null {
  const kitIp = llevaKitIp(ip)
  if (procs.length === 0 && !kitIp) return null

  /* La entrega del IP va PRIMERA, como en el panel de Procedimientos desde la 0119: es lo que la
     visita "lleva" antes que cualquier otra cosa. No define sangre ni reporte propios. */
  const items: ItemDeVisita[] = [
    ...(kitIp ? [{ procedure_id: 'ip', name: TITULO_IP, draws_blood: false, tieneReporte: false, esIp: true }] : []),
    ...procs.map((p) => ({ ...p, esIp: false })),
  ]

  return { total: items.length, items, sangre: sangreDeVisita(procs), kitIp }
}

/**
 * Cuántos reportes de la visita quedan por cargar.
 *
 * Es `esReportePendiente`, la MISMA definición del tablero y del Resumen de Coordinación: el
 * procedimiento está realizado y el reporte no llegó a evolucionado. El badge del panel y el
 * indicador del resumen cuentan con esta función y no cada uno con la suya — que es justo lo que el
 * handoff prohíbe («no hay dos números distintos en pantalla»).
 *
 * Recibe las filas YA con el tilde optimista aplicado, así el conteo sube en el mismo render en que
 * se tilda el procedimiento, sin esperar a que vuelva la consulta.
 */
export function porCargar(reportes: readonly { completed: boolean; stage: string }[]): number {
  return reportes.filter(esReportePendiente).length
}

/** Una asignación del cronograma: este cuadro de visita lleva este procedimiento. */
export interface AsignacionDelDia {
  visit_def_id: string
  procedure_id: string
  name: string
}

/** Un procedimiento del cuadro de un estudio (`protocol_procedures`), con sus marcas. */
export interface ProcedimientoDelEstudio {
  protocol_id: string
  procedure_id: string
  draws_blood: boolean | null
  tieneReporte: boolean
}

/** El estado del IP de una visita del día. */
export interface IpDelDia extends IpDeVisita {
  visit_id: string
}

/** Clave del cruce: el catálogo es global, así que un procedimiento se identifica CON su estudio. */
const clave = (protocolId: string, procedureId: string) => `${protocolId}|${procedureId}`

/**
 * Los resúmenes de todas las visitas de un día, unidos en el cliente.
 *
 * Tres consultas en paralelo y una sola unión acá (misma decisión que `useVisitProcedureStatus`:
 * nada de embeds anidados, que se vuelven ambiguos apenas alguien agrega una FK, y cada tabla
 * filtrada por su propia RLS). Las visitas del mismo cuadro comparten sus asignaciones, así que la
 * consulta de asignaciones es una sola para todo el día.
 */
export function armarResumenesDelDia(
  visitas: readonly { id: string; visit_def_id: string | null; protocol_id: string }[],
  asignaciones: readonly AsignacionDelDia[],
  delEstudio: readonly ProcedimientoDelEstudio[],
  ips: readonly IpDelDia[],
): Record<string, ResumenVisita | null> {
  const porDef = new Map<string, AsignacionDelDia[]>()
  for (const a of asignaciones) {
    const lista = porDef.get(a.visit_def_id) ?? []
    lista.push(a)
    porDef.set(a.visit_def_id, lista)
  }

  const marcas = new Map<string, ProcedimientoDelEstudio>()
  for (const p of delEstudio) marcas.set(clave(p.protocol_id, p.procedure_id), p)

  const ipPorVisita = new Map<string, IpDelDia>()
  for (const ip of ips) ipPorVisita.set(ip.visit_id, ip)

  const out: Record<string, ResumenVisita | null> = {}
  for (const v of visitas) {
    const asignados = v.visit_def_id ? porDef.get(v.visit_def_id) ?? [] : []
    const procs: ProcedimientoDeVisita[] = asignados.map((a) => {
      // Sin fila en el cuadro del estudio, la sangre queda SIN DEFINIR. `false` sería afirmar que no
      // lleva algo que nadie definió (pasa con un procedimiento recién asignado a una visita).
      const marca = marcas.get(clave(v.protocol_id, a.procedure_id))
      return {
        procedure_id: a.procedure_id,
        name: a.name,
        draws_blood: marca?.draws_blood ?? null,
        tieneReporte: marca?.tieneReporte ?? false,
      }
    })
    out[v.id] = resumenDeVisita(procs, ipPorVisita.get(v.id) ?? null)
  }
  return out
}
