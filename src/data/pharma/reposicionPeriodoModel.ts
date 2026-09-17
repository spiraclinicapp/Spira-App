import {
  diaMes, envasesTxt, estanteAlComienzo, nombresDePacientes, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
} from './reposicionModel'
import type { Aviso, EstadoRenglon, EstudioInsumo, LoteInsumo, ModoReposicion, PacienteInsumo } from './reposicionModel'
import { enCurso, periodoSiguiente } from './periodoDeCorte'
import type { Periodo } from './periodoDeCorte'
import { armarPedidos, pedidoDestacado, textoDePedidos, yaPedidoDe } from './pedidosMedicacionModel'
import type { PedidoItemInsumo, PedidoMedicacion, PedidoMedicacionInsumo } from './pedidosMedicacionModel'

/**
 * ┌─ Reposición de corte a corte (docs/superpowers/specs/2026-09-16-reposicion-submodulo-design.md) ─────┐
 *
 * La misma cuenta del 14/09 (reposicionModel.ts, «para todos», D8), medida por PERÍODO en vez de por mes
 * calendario, más el libro de lo que entró y salió y la boleta que la explica.
 *
 *   P0 = el período en curso · P1 = el siguiente (el que se compra)
 *
 *   LIBRO de un período, por medicamento (R3, R6):
 *     había = en el estante hoy − todo lo que se movió desde el inicio del período
 *     hay   = había + entró − salió + ajustes             (período cerrado: lo que quedó al corte)
 *
 *   BOLETA de P0 (R7), cada renglón sólo si aplica:
 *       Hacen falta para el próximo período     Σ mensual de los pacientes que siguen en P1
 *     (o Tener siempre                         stock fijo, a demanda)
 *     + Faltan para terminar este período      lo pendiente de P0 que el estante no cubre     D31
 *     − Van a quedar en el estante al corte    FEFO: lo vigente menos lo pendiente de P0      D15
 *     − Ya pedido, sin recibir                 faltante abierto de los pedidos                 R9
 *     = A comprar                              nunca negativo
 *
 * El texto de la boleta sale de ACÁ y no de la vista: el Director rechazó la versión en prosa («Hoy hay 8 y
 * ya retiraron los 12…») por confusa, y la aclaración de cada renglón es parte de lo que se testea.
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════ El JSON de `reposicion_del_periodo` (0128) ═══════════════════════════

/** Un renglón de `protocol_medications` con lo que se cargó para reponerlo. */
export interface RenglonPeriodoInsumo {
  protocol_medication_id: string
  protocol_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación. */
  presentacion: string | null
  drug_id: string | null
  modo: ModoReposicion | null
  envases_por_mes: number | null
  stock_fijo: number | null
}

/** Una asignación activa, igual que en la 0125 salvo lo retirado, que se mide en el período pedido. */
export type PacientePeriodoInsumo = Omit<PacienteInsumo, 'retirado_mes'> & {
  /** Neto retirado entre `p_desde` y `p_hasta` (hora AR), en lista o entregada. */
  retirado_periodo: number
}

/** Lo que se movió en el estante de un medicamento del estudio, con el protocolo por el LOTE. */
export interface MovimientoInsumo {
  protocol_id: string
  medication_id: string
  /** Recepciones menos anulaciones de recepción, dentro del período. */
  entro: number
  /** Dispensaciones menos devoluciones, dentro del período (positivo = salió). */
  salio: number
  /** Ajustes manuales, reasignaciones y bajas por vencimiento, con su signo, dentro del período. */
  ajustes: number
  /** Todo lo movido desde el inicio del período hasta hoy, con su signo. */
  desde_inicio: number
}

export interface InsumosDelPeriodo {
  estudios: EstudioInsumo[]
  renglones: RenglonPeriodoInsumo[]
  pacientes: PacientePeriodoInsumo[]
  /** Todos los lotes de protocolo con stock, VENCIDOS INCLUIDOS (el libro cuenta lo físico). */
  lotes: LoteInsumo[]
  movimientos: MovimientoInsumo[]
  pedidos: PedidoMedicacionInsumo[]
  pedido_items: PedidoItemInsumo[]
  /** Enrolamientos en screening/activo sin ninguna medicación habilitada, por estudio. */
  sin_medicacion: { protocol_id: string; enrolamientos: number }[]
}

// ═══════════════════════════ El libro ═══════════════════════════

export interface Libro {
  habia: number
  entro: number
  salio: number
  ajustes: number
  hay: number
}

export function libroDe(mov: MovimientoInsumo | undefined, enEstanteHoy: number): Libro {
  const entro = mov?.entro ?? 0
  const salio = mov?.salio ?? 0
  const ajustes = mov?.ajustes ?? 0
  const habia = enEstanteHoy - (mov?.desde_inicio ?? 0)
  return { habia, entro, salio, ajustes, hay: habia + entro - salio + ajustes }
}

// ═══════════════════════════ La boleta y el armado ═══════════════════════════

export type TipoLineaBoleta = 'hacen_falta' | 'tener_siempre' | 'faltan_este_periodo' | 'quedan_al_corte' | 'ya_pedido'

export interface LineaBoleta {
  tipo: TipoLineaBoleta
  titulo: string
  /** La explicación chica debajo del renglón. */
  aclaracion: string
  signo: '' | '+' | '−'
  valor: number
}

export interface Boleta {
  lineas: LineaBoleta[]
  aComprar: number
}

export interface RenglonDelPeriodo {
  clave: string
  protocolMedicationId: string
  medicationId: string
  nombre: string
  presentacion: string | null
  modo: ModoReposicion | null
  /** Lo cargado en el estudio, para abrir el formulario con el valor actual. */
  envasesPorMes: number | null
  stockFijo: number | null
  estado: EstadoRenglon
  /** Envases a comprar para P1 (0 si no aplica o si el período no está en curso). */
  comprar: number
  libro: Libro
  /** null: sin cargar, no se compra, o período que no está en curso. */
  boleta: Boleta | null
  avisos: Aviso[]
}

export type EstadoTarjeta = 'comprar' | 'cubierto' | 'todo_sin_cargar' | 'sin_medicacion'

export interface EstudioReposicion {
  estudio: EstudioInsumo
  /** Por nombre de medicamento. */
  renglones: RenglonDelPeriodo[]
  /** Del más nuevo al más viejo. */
  pedidos: PedidoMedicacion[]
  destacado: PedidoMedicacion | null
  resumen: {
    envases: number
    medicamentos: number
    sinCargar: number
    /** Renglones que no son «no se compra». */
    reponibles: number
  }
  estadoTarjeta: EstadoTarjeta
  sinMedicacionHabilitada: number
}

export interface ReposicionDelPeriodo {
  hoy: string
  periodo: Periodo
  /** El período siguiente al pedido: el que se compra cuando `periodo` está en curso. */
  proximo: Periodo
  enCurso: boolean
  /** Por código, sin los cerrados. */
  estudios: EstudioReposicion[]
}

const pacientesTxt = (n: number) => `${n} ${n === 1 ? 'paciente' : 'pacientes'}`
const retiraronTxt = (n: number) => (n === 1 ? 'retiró' : 'retiraron')

interface Contexto {
  insumos: InsumosDelPeriodo
  hoy: string
  periodo: Periodo
  proximo: Periodo
  actual: boolean
  pedidos: PedidoMedicacion[]
  duplicados: Set<string>
  noventaDias: string
}

function armarRenglon(r: RenglonPeriodoInsumo, ctx: Contexto): RenglonDelPeriodo {
  const lotes = ctx.insumos.lotes.filter((l) => l.protocol_id === r.protocol_id && l.medication_id === r.medication_id)
  const mov = ctx.insumos.movimientos.find((m) => m.protocol_id === r.protocol_id && m.medication_id === r.medication_id)
  const base = {
    clave: r.protocol_medication_id,
    protocolMedicationId: r.protocol_medication_id,
    medicationId: r.medication_id,
    nombre: r.medication_name,
    presentacion: r.presentacion,
    modo: r.modo,
    envasesPorMes: r.envases_por_mes,
    stockFijo: r.stock_fijo,
    libro: libroDe(mov, lotes.reduce((s, l) => s + l.quantity, 0)),
  }
  if (r.modo == null) return { ...base, estado: 'sin_cargar', comprar: 0, boleta: null, avisos: [] }
  if (r.modo === 'no_se_compra') return { ...base, estado: 'no_se_compra', comprar: 0, boleta: null, avisos: [] }
  if (!ctx.actual) return { ...base, estado: 'alcanza', comprar: 0, boleta: null, avisos: [] }

  const lineas: LineaBoleta[] = []
  const avisos: Aviso[] = []
  let pendiente = 0
  let pendientes = 0
  let pacientesDelPeriodo = 0

  if (r.modo === 'mensual') {
    const asignaciones = ctx.insumos.pacientes.filter(
      (p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id && !p.habilitacion_id,
    )
    const suman = asignaciones.filter((p) => !ctx.duplicados.has(p.patient_medication_id))
    const mensual = (p: PacientePeriodoInsumo) => p.envases_por_mes ?? r.envases_por_mes ?? 0

    const delPeriodo = suman.filter((p) => sigueEnElMes(p, ctx.periodo.desde))
    pacientesDelPeriodo = delPeriodo.length
    for (const p of delPeriodo) {
      const falta = Math.max(0, mensual(p) - p.retirado_periodo)
      pendiente += falta
      if (falta > 0) pendientes += 1
    }

    const delProximo = suman.filter((p) => sigueEnElMes(p, ctx.proximo.desde))
    const propios = delProximo.filter((p) => p.envases_por_mes != null).length
    lineas.push({
      tipo: 'hacen_falta',
      titulo: 'Hacen falta para el próximo período',
      signo: '',
      valor: delProximo.reduce((s, p) => s + mensual(p), 0),
      aclaracion: delProximo.length === 0 ? 'ningún paciente lo recibe'
        : propios > 0 ? `${pacientesTxt(delProximo.length)} (${propios} con cantidad propia)`
          : `${pacientesTxt(delProximo.length)}, ${envasesTxt(r.envases_por_mes ?? 0)} por mes`,
    })

    const terminaron = asignaciones.filter((p) => terminoCronograma(p, ctx.proximo.desde))
    if (terminaron.length) avisos.push({ tipo: 'termino_cronograma', ambar: false, texto: `Terminó su cronograma y no suma: ${nombresDePacientes(terminaron)}` })
    const sinRetiros = delProximo.filter((p) => !p.ultimo_retiro || p.ultimo_retiro.slice(0, 10) < ctx.noventaDias)
    if (sinRetiros.length) avisos.push({ tipo: 'sin_retiros', ambar: false, texto: `Sin retiros en 90 días, suma igual: ${nombresDePacientes(sinRetiros)}` })
    const dobles = asignaciones.filter((p) => ctx.duplicados.has(p.patient_medication_id))
    if (dobles.length) avisos.push({ tipo: 'dos_presentaciones', ambar: true, texto: `Tiene otra presentación habilitada, suma una sola: ${nombresDePacientes(dobles)}` })
    const varios = suman.filter((p) => mensual(p) > 0 && p.retirado_periodo > mensual(p))
    if (varios.length) avisos.push({ tipo: 'varios_meses', ambar: false, texto: `Se llevó más de un mes en este período: ${nombresDePacientes(varios)}` })
  } else {
    lineas.push({ tipo: 'tener_siempre', titulo: 'Tener siempre', signo: '', valor: r.stock_fijo ?? 0, aclaracion: 'a demanda' })
  }

  const est = estanteAlComienzo(lotes, pendiente, ctx.hoy, ctx.proximo)
  const vencidos = lotes.filter((l) => l.expiry_date != null && l.expiry_date < ctx.hoy).reduce((s, l) => s + l.quantity, 0)
  // Lo vigente que no se lleva lo pendiente de P0 y tampoco llega vivo al inicio de P1.
  const vencenAntes = est.vigenteHoy - (pendiente - est.faltaEsteMes) - est.alComienzo

  if (est.faltaEsteMes > 0) {
    lineas.push({
      tipo: 'faltan_este_periodo',
      titulo: 'Faltan para terminar este período',
      signo: '+',
      valor: est.faltaEsteMes,
      aclaracion: `${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)} y en el estante no alcanza`,
    })
  }
  if (est.alComienzo > 0) {
    const partes = [
      pacientesDelPeriodo === 0 ? `hay ${est.vigenteHoy}`
        : pendientes > 0 ? `hay ${est.vigenteHoy}, y ${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)}`
          : `hay ${est.vigenteHoy} y ya retiraron todos`,
    ]
    if (vencenAntes > 0) partes.push(`${vencenAntes} ${vencenAntes === 1 ? 'vence' : 'vencen'} antes del próximo período`)
    if (vencidos > 0) partes.push(`sin contar ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`)
    lineas.push({ tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: est.alComienzo, aclaracion: partes.join(', ') })
  }

  const ya = yaPedidoDe(ctx.pedidos, r.protocol_id, r.medication_id)
  if (ya.envases > 0) {
    lineas.push({ tipo: 'ya_pedido', titulo: 'Ya pedido, sin recibir', signo: '−', valor: ya.envases, aclaracion: textoDePedidos(ya.pedidos) })
  }
  for (const v of est.vencenEnElMes) {
    avisos.push({ tipo: 'vence', ambar: true, texto: `Vence el ${diaMes(v.expiry_date)}: lote ${v.lot_number}, ${envasesTxt(v.quantity)}` })
  }

  const comprar = Math.max(0, lineas.reduce((s, l) => (l.signo === '−' ? s - l.valor : s + l.valor), 0))
  const estado: EstadoRenglon = comprar > 0 ? 'comprar' : ya.envases > 0 ? 'en_camino' : 'alcanza'
  return { ...base, estado, comprar, boleta: { lineas, aComprar: comprar }, avisos }
}

export function armarReposicionDelPeriodo(
  insumos: InsumosDelPeriodo,
  hoy: string,
  periodo: Periodo,
  diaCorte: number,
): ReposicionDelPeriodo {
  const proximo = periodoSiguiente(periodo, diaCorte)
  const actual = enCurso(periodo, hoy)
  const pedidos = armarPedidos(insumos.pedidos, insumos.pedido_items)
  const ctx: Contexto = {
    insumos, hoy, periodo, proximo, actual, pedidos,
    duplicados: presentacionesDuplicadas(insumos.pacientes),
    noventaDias: sumarDias(hoy, -90),
  }

  const estudios = insumos.estudios
    .filter((e) => e.status !== 'cerrado')
    .sort((a, b) => a.code.localeCompare(b.code, 'es'))
    .map((estudio): EstudioReposicion => {
      const renglones = insumos.renglones
        .filter((r) => r.protocol_id === estudio.id)
        .map((r) => armarRenglon(r, ctx))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      const reponibles = renglones.filter((r) => r.estado !== 'no_se_compra').length
      const sinCargar = renglones.filter((r) => r.estado === 'sin_cargar').length
      const aComprar = renglones.filter((r) => r.comprar > 0)
      const envases = aComprar.reduce((s, r) => s + r.comprar, 0)
      const pedidosDelEstudio = pedidos.filter((p) => p.protocol_id === estudio.id)
      return {
        estudio,
        renglones,
        pedidos: pedidosDelEstudio,
        destacado: pedidoDestacado(pedidosDelEstudio, proximo),
        resumen: { envases, medicamentos: aComprar.length, sinCargar, reponibles },
        estadoTarjeta: reponibles === 0 ? 'sin_medicacion'
          : sinCargar === reponibles ? 'todo_sin_cargar'
            : envases > 0 ? 'comprar'
              : 'cubierto',
        sinMedicacionHabilitada: insumos.sin_medicacion.find((s) => s.protocol_id === estudio.id)?.enrolamientos ?? 0,
      }
    })

  return { hoy, periodo, proximo, enCurso: actual, estudios }
}

// ═══════════════════════════ «Armar pedido» (R8) ═══════════════════════════

export interface RenglonBorrador {
  medicationId: string
  nombre: string
  presentacion: string | null
  /** Lo que calculó Spira; null = estaba sin cargar. */
  calculado: number | null
  pedir: number
}

/** Arranca en lo calculado; lo sin cargar en cero para pedirlo a mano; «no se compra» no aparece. */
export function borradorDelPedido(e: EstudioReposicion): RenglonBorrador[] {
  return e.renglones
    .filter((r) => r.estado !== 'no_se_compra')
    .map((r) => ({
      medicationId: r.medicationId,
      nombre: r.nombre,
      presentacion: r.presentacion,
      calculado: r.modo == null ? null : r.comprar,
      pedir: r.modo == null ? 0 : r.comprar,
    }))
}

/** Lo que viaja a `emitir_pedido_medicacion`: sólo cantidades enteras mayores a cero. */
export function renglonesAEmitir(b: readonly RenglonBorrador[]): { medication_id: string; calculado: number | null; pedido: number }[] {
  return b
    .filter((r) => Number.isInteger(r.pedir) && r.pedir > 0)
    .map((r) => ({ medication_id: r.medicationId, calculado: r.calculado, pedido: r.pedir }))
}

/** «Seretide 250/50: pedís 6, Spira calculó 4.» */
export function cambiosDelBorrador(b: readonly RenglonBorrador[]): string[] {
  return b
    .filter((r) => r.calculado != null && Number.isInteger(r.pedir) && r.pedir !== r.calculado)
    .map((r) => `${r.nombre}: pedís ${r.pedir}, Spira calculó ${r.calculado}.`)
}
