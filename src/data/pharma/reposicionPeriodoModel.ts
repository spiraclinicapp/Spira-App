import {
  diaMes, enTratamiento, envasesTxt, estanteAlComienzo, nombresDePacientes, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
} from './reposicionModel'
import type { Aviso, EstadoEnrolamiento, EstadoRenglon, EstudioInsumo, LoteInsumo, ModoReposicion, PacienteInsumo } from './reposicionModel'
import { diasHastaElCorte, enCurso, periodoSiguiente, ventanaTarde } from './periodoDeCorte'
import type { Periodo, VentanaTarde } from './periodoDeCorte'
import { armarPedidos, faltaVerificarTxt, pedidoPara, seSuperpone, sinVerificarDe, textoDePedidos, yaPedidoDe } from './pedidosMedicacionModel'
import type { PedidoItemInsumo, PedidoMedicacion, PedidoMedicacionInsumo, RecepcionDePedidoInsumo } from './pedidosMedicacionModel'

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
 *   BOLETA de P0 (R7). Las dos restas van siempre, aunque valgan 0 (handoff «renglón abierto», 2026-09-29):
 *       Necesitan el período que viene          Σ mensual de los pacientes que siguen en P1
 *     (o Tener siempre                         stock fijo, a demanda)
 *     + Faltan para terminar este período      lo pendiente de P0 que el estante no cubre     D31  (sólo si > 0)
 *     − Quedan en el estante al corte          FEFO: lo vigente menos lo pendiente de P0      D15
 *     − En camino                              faltante abierto de los pedidos            R9 RD12
 *     = A comprar                              nunca negativo
 *
 *   PEDIDO TARDE (RD1): hasta 5 días después del corte, si el período que empezó no tiene pedido y le
 *   falta algo, la cuenta es la de ESE período y pide sólo lo que le falta:
 *       Les falta retirar                       lo que les falta retirar a sus pacientes
 *     (o Tener siempre)
 *     − Hay en el estante                      lo vigente hoy
 *     − En camino
 *     = A comprar
 *   El siguiente se pide en el próximo corte. Si al período que empezó no le falta nada, la cuenta sigue
 *   siendo la del que viene: no hay nada tarde que pedir.
 *
 * «Hay» es siempre lo FÍSICO, vencidos incluidos (RD13): la boleta dice cuántos lo están.
 * El texto de la boleta sale de ACÁ y no de la vista: el Director rechazó la versión en prosa («Hoy hay 8 y
 * ya retiraron los 12…») por confusa, y la aclaración de cada renglón es parte de lo que se testea.
 * └────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════ El JSON de `reposicion_del_periodo` (0128, 0133) ═══════════════════════════

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

/** Una asignación activa, con lo retirado medido en el período pedido. */
export type PacientePeriodoInsumo = PacienteInsumo & {
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
  /** Las recepciones no anuladas de esos pedidos (0133). Antes de la 0133 no viene: se lee como vacía. */
  recepciones: RecepcionDePedidoInsumo[]
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

export type TipoLineaBoleta =
  | 'hacen_falta' | 'tener_siempre' | 'faltan_este_periodo' | 'quedan_al_corte' | 'hay_en_el_estante' | 'ya_pedido'

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

/**
 * Lo que antes eran avisos al pie del renglón y ahora va en la fila de cada paciente (handoff «renglón
 * abierto», 2026-09-29). El aviso de vencimiento no es de un paciente: sigue en `avisos`.
 */
export type MarcaPaciente = 'sin_retiros' | 'termino_cronograma' | 'dos_presentaciones' | 'varios_meses'

/** Un paciente en tratamiento que tiene asignado el medicamento, con lo que aporta a la cuenta. */
export interface PacienteDelRenglon {
  enrollmentId: string
  nombre: string
  estado: EstadoEnrolamiento
  /** Lo que recibe por mes: su cantidad propia o, si no tiene, la del estudio. */
  porMes: number
  /** `porMes` es su cantidad propia y no la del estudio. */
  propia: boolean
  /** Lo retirado en el período, con tope en `porMes`: la barra no pasa de llena (el exceso es una marca). */
  retiro: number
  ultimoRetiro: string | null
  /** La última visita programada, si tiene cronograma automático (D23). */
  cronogramaHasta: string | null
  /** Entra en la cuenta del período para el que se compra. */
  suma: boolean
  marcas: MarcaPaciente[]
}

/**
 * `EstadoRenglon` (la card vieja, `reposicionModel.ts`) más `'sin_cuenta'`: esta vista corta por
 * `enCurso` (R6) y, en un período que no está en curso, NO calcula la compra — mostrar `'alcanza'`
 * sería un dato inventado presentado como real (regla de honestidad de CLAUDE.md).
 * `'sin_cuenta'` es sólo para `mensual`/`a_demanda`: `sin_cargar` y `no_se_compra` son configuración del
 * medicamento, no una cuenta, y siguen valiendo igual esté o no en curso el período.
 */
export type EstadoRenglonPeriodo = EstadoRenglon | 'sin_cuenta'

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
  /** Asignaciones activas, sin la habilitación de una entrega: «3 pacientes lo tienen habilitado». */
  pacientes: number
  estado: EstadoRenglonPeriodo
  /** Envases a comprar para el período objetivo (0 si no aplica o si el período no está en curso). */
  comprar: number
  /** Lo que descuenta el renglón «En camino» de la boleta. */
  enCamino: number
  /**
   * Lo que ni el estante ni lo en camino cubren para terminar el período en curso (D31). Neto de lo en
   * camino (revisión de ingeniería, 5): el día después del corte, con el pedido todavía viajando, lo que
   * falta ya está pedido y no es una tarea.
   */
  faltaEstePeriodo: number
  /**
   * El stock mínimo de un período entero (pedido del Director, 2026-09-19): lo que reciben por mes los
   * pacientes que lo tienen asignado y siguen en el período objetivo —con su cantidad propia o, si no
   * tienen, la del estudio—, o el «tener siempre» si es a demanda (`pacientes` null). Tarde, es el período
   * que empezó ENTERO: no lo que le falta, que es lo que dice la boleta. null sin cargar, no se compra, o
   * período que no está en curso.
   */
  minimo: { envases: number; pacientes: number | null } | null
  libro: Libro
  /** null: sin cargar, no se compra, o período que no está en curso. */
  boleta: Boleta | null
  avisos: Aviso[]
  /**
   * Quiénes lo reciben, por nombre. Sólo `mensual` en un período en curso: a demanda no depende de los
   * pacientes, y sin cuenta no hay «suma» que mostrar. Se arma con los mismos filtros que la boleta, así
   * la tabla y el número no pueden decir cosas distintas.
   */
  detallePacientes: PacienteDelRenglon[]
}

/** `'sin_cuenta'`: el período no está en curso (R6), no se sabe cubierto de verdad — no confundir con `'cubierto'`. */
export type EstadoTarjeta = 'comprar' | 'cubierto' | 'todo_sin_cargar' | 'sin_medicacion' | 'sin_cuenta'

export interface EstudioReposicion {
  estudio: EstudioInsumo
  /** Por nombre de medicamento. */
  renglones: RenglonDelPeriodo[]
  /** Todos los del estudio, del más nuevo al más viejo. */
  pedidos: PedidoMedicacion[]
  /** El período para el que se arma el pedido: el que viene, o el que empezó si se pide tarde (RD1).
   *  null si el período que se mira no está en curso. */
  objetivo: Periodo | null
  /** RD1: el período empezó hace 5 días o menos, no tiene pedido y le falta algo. La cuenta es la suya. */
  tarde: VentanaTarde | null
  /** El pedido del período objetivo, si ya se emitió (el más nuevo que se le superpone). */
  pedidoDelObjetivo: PedidoMedicacion | null
  /** RD4: los otros pedidos que todavía deben algo, del más viejo al más nuevo. */
  pedidosQueDeben: PedidoMedicacion[]
  resumen: {
    envases: number
    medicamentos: number
    sinCargar: number
    /** Renglones que no son «no se compra». */
    reponibles: number
    /** Σ de lo que ni el estante ni lo en camino cubren para terminar el período en curso (D31). */
    faltaEstePeriodo: number
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
  /** Días que faltan para el corte; null si el período no está en curso. */
  diasAlCorte: number | null
  /** RD1, para toda Farmacia: hoy cae en los 5 días después de un corte. null si no, o fuera de curso. */
  ventana: VentanaTarde | null
  /** Por código, sin los cerrados. */
  estudios: EstudioReposicion[]
}

const pacientesTxt = (n: number) => `${n} ${n === 1 ? 'paciente' : 'pacientes'}`
const retiraronTxt = (n: number) => (n === 1 ? 'retiró' : 'retiraron')

/** RD13: «hay» es lo físico, vencidos incluidos, y se dice cuántos lo están. */
function textoHay(vigente: number, vencidos: number): string {
  const fisico = vigente + vencidos
  // La resta en cero se muestra igual (handoff «renglón abierto»): la aclaración dice por qué vale 0.
  if (fisico === 0) return 'sin stock hoy'
  if (vencidos === 0) return `hay ${fisico}`
  if (vigente === 0) return fisico === 1 ? 'hay 1, vencido' : `hay ${fisico}, todos vencidos`
  return `hay ${fisico}, ${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`
}

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

function armarRenglon(r: RenglonPeriodoInsumo, ctx: Contexto, tarde: boolean): RenglonDelPeriodo {
  const lotes = ctx.insumos.lotes.filter((l) => l.protocol_id === r.protocol_id && l.medication_id === r.medication_id)
  const mov = ctx.insumos.movimientos.find((m) => m.protocol_id === r.protocol_id && m.medication_id === r.medication_id)
  const asignaciones = ctx.insumos.pacientes.filter(
    (p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id && !p.habilitacion_id,
  )
  /**
   * Las de una inscripción en tratamiento. El RPC trae la medicación activa de TODAS las inscripciones —la
   * de un paciente discontinuado sigue `active` en patient_medications—, y el filtro vivía sólo en
   * `sigueEnElMes`. El resto del renglón usaba la lista entera: «N pacientes lo tienen habilitado» (Cargar
   * reposición) y los avisos de dos presentaciones y de más de un mes contaban a quien ya no estaba
   * (Director, 2026-09-29).
   */
  const enCurso = asignaciones.filter(enTratamiento)
  const base = {
    clave: r.protocol_medication_id,
    protocolMedicationId: r.protocol_medication_id,
    medicationId: r.medication_id,
    nombre: r.medication_name,
    presentacion: r.presentacion,
    modo: r.modo,
    envasesPorMes: r.envases_por_mes,
    stockFijo: r.stock_fijo,
    pacientes: enCurso.length,
    libro: libroDe(mov, lotes.reduce((s, l) => s + l.quantity, 0)),
  }
  const sinCuenta: Pick<RenglonDelPeriodo, 'comprar' | 'enCamino' | 'faltaEstePeriodo' | 'minimo' | 'boleta' | 'avisos' | 'detallePacientes'> =
    { comprar: 0, enCamino: 0, faltaEstePeriodo: 0, minimo: null, boleta: null, avisos: [], detallePacientes: [] }
  if (r.modo == null) return { ...base, ...sinCuenta, estado: 'sin_cargar' }
  if (r.modo === 'no_se_compra') return { ...base, ...sinCuenta, estado: 'no_se_compra' }
  // Período que no está en curso (R6): sin_cargar/no_se_compra son configuración y ya se resolvieron
  // arriba; para mensual/a_demanda no hay cuenta hecha, así que decirlo es honesto y 'alcanza' no lo era.
  if (!ctx.actual) return { ...base, ...sinCuenta, estado: 'sin_cuenta' }

  // El período para el que se compra: el que viene, o el que empezó si se pide tarde (RD1).
  const objetivo = tarde ? ctx.periodo : ctx.proximo
  const lineas: LineaBoleta[] = []
  const avisos: Aviso[] = []
  const detallePacientes: PacienteDelRenglon[] = []
  let pendiente = 0
  let pendientes = 0
  let pacientesDelPeriodo = 0
  let minimo: RenglonDelPeriodo['minimo'] = { envases: r.stock_fijo ?? 0, pacientes: null }

  if (r.modo === 'mensual') {
    const suman = enCurso.filter((p) => !ctx.duplicados.has(p.patient_medication_id))
    const mensual = (p: PacientePeriodoInsumo) => p.envases_por_mes ?? r.envases_por_mes ?? 0

    const delPeriodo = suman.filter((p) => sigueEnElMes(p, ctx.periodo.desde))
    pacientesDelPeriodo = delPeriodo.length
    let retiraron = 0
    for (const p of delPeriodo) {
      const falta = Math.max(0, mensual(p) - p.retirado_periodo)
      pendiente += falta
      if (falta > 0) pendientes += 1
      retiraron += Math.min(mensual(p), p.retirado_periodo)
    }

    // Tarde, cuentan los del período que empezó; si no, los que siguen en el que viene.
    const delObjetivo = tarde ? delPeriodo : suman.filter((p) => sigueEnElMes(p, ctx.proximo.desde))
    minimo = { envases: delObjetivo.reduce((s, p) => s + mensual(p), 0), pacientes: delObjetivo.length }
    const propios = delObjetivo.filter((p) => p.envases_por_mes != null).length
    const quienes = delObjetivo.length === 0 ? 'ningún paciente lo recibe'
      : propios > 0 ? `${pacientesTxt(delObjetivo.length)} (${propios} con cantidad propia)`
        : `${pacientesTxt(delObjetivo.length)}, ${envasesTxt(r.envases_por_mes ?? 0)} por mes`
    // Títulos cortos (handoff «renglón abierto»): van en una tarjeta de la ecuación, no en un renglón ancho.
    lineas.push(tarde
      ? {
          tipo: 'hacen_falta', titulo: 'Les falta retirar', signo: '', valor: pendiente,
          aclaracion: delObjetivo.length === 0 ? quienes : `${quienes}; retiraron ${retiraron}`,
        }
      : {
          tipo: 'hacen_falta', titulo: 'Necesitan el período que viene', signo: '',
          valor: delObjetivo.reduce((s, p) => s + mensual(p), 0), aclaracion: quienes,
        })

    const terminaron = asignaciones.filter((p) => terminoCronograma(p, objetivo.desde))
    if (terminaron.length) avisos.push({ tipo: 'termino_cronograma', ambar: false, texto: `Terminó su cronograma y no suma: ${nombresDePacientes(terminaron)}` })
    const sinRetiros = delObjetivo.filter((p) => !p.ultimo_retiro || p.ultimo_retiro.slice(0, 10) < ctx.noventaDias)
    if (sinRetiros.length) avisos.push({ tipo: 'sin_retiros', ambar: false, texto: `Sin retiros en 90 días, suma igual: ${nombresDePacientes(sinRetiros)}` })
    const dobles = enCurso.filter((p) => ctx.duplicados.has(p.patient_medication_id))
    if (dobles.length) avisos.push({ tipo: 'dos_presentaciones', ambar: true, texto: `Tiene otra presentación habilitada, suma una sola: ${nombresDePacientes(dobles)}` })
    const varios = suman.filter((p) => mensual(p) > 0 && p.retirado_periodo > mensual(p))
    if (varios.length) avisos.push({ tipo: 'varios_meses', ambar: false, texto: `Se llevó más de un mes en este período: ${nombresDePacientes(varios)}` })

    // La misma información, paciente por paciente: salen de los MISMOS conjuntos que los avisos y la cuenta,
    // para que la tabla y el número no puedan contar distinto. Los avisos se quedan: el renglón cerrado los
    // cuenta en su «N avisos».
    const en = (lista: readonly PacientePeriodoInsumo[]) => new Set(lista.map((p) => p.patient_medication_id))
    const sumanAlObjetivo = en(delObjetivo), sinRetirosIds = en(sinRetiros), terminaronIds = en(terminaron), variosIds = en(varios)
    for (const p of [...enCurso].sort((a, b) => a.patient_name.localeCompare(b.patient_name, 'es'))) {
      const id = p.patient_medication_id
      const marcas: MarcaPaciente[] = []
      if (sinRetirosIds.has(id)) marcas.push('sin_retiros')
      if (terminaronIds.has(id)) marcas.push('termino_cronograma')
      if (ctx.duplicados.has(id)) marcas.push('dos_presentaciones')
      if (variosIds.has(id)) marcas.push('varios_meses')
      detallePacientes.push({
        enrollmentId: p.enrollment_id,
        nombre: p.patient_name,
        estado: p.enrollment_status,
        porMes: mensual(p),
        propia: p.envases_por_mes != null,
        retiro: Math.min(p.retirado_periodo, mensual(p)),
        ultimoRetiro: p.ultimo_retiro,
        cronogramaHasta: p.tiene_cronograma ? p.ultima_programada : null,
        suma: sumanAlObjetivo.has(id),
        marcas,
      })
    }
  } else {
    lineas.push({ tipo: 'tener_siempre', titulo: 'Tener siempre', signo: '', valor: r.stock_fijo ?? 0, aclaracion: 'a demanda' })
  }

  const est = estanteAlComienzo(lotes, pendiente, ctx.hoy, objetivo)
  const vencidos = lotes.filter((l) => l.expiry_date != null && l.expiry_date < ctx.hoy).reduce((s, l) => s + l.quantity, 0)

  // Las dos restas (el estante y lo en camino) van SIEMPRE, aunque valgan 0 (handoff «renglón abierto»,
  // 2026-09-29): la cuenta tiene una sola forma y la aclaración dice por qué no resta nada («sin stock hoy»,
  // «sin pedidos abiertos»). «Faltan para terminar este período» sigue saliendo sólo cuando falta algo: es un
  // término que SUMA, y «+ 0» no explica nada.
  if (tarde) {
    // Tarde no hay «al corte»: lo vigente hoy es lo que atiende a los que todavía no retiraron.
    lineas.push({ tipo: 'hay_en_el_estante', titulo: 'Hay en el estante', signo: '−', valor: est.vigenteHoy, aclaracion: textoHay(est.vigenteHoy, vencidos) })
  } else {
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
    // Con valor 0 también cuando no queda nada VIGENTE pero hay vencidos o algo que vence antes del período
    // que viene: si el libro dice «Hay 10» y la boleta pidiera igual sin explicarlo, no cierra a la vista.
    let aclaracion = textoHay(est.vigenteHoy, vencidos)
    if (est.vigenteHoy > 0 && pacientesDelPeriodo > 0) {
      aclaracion += pendientes > 0
        ? `, y ${pacientesTxt(pendientes)} todavía no ${retiraronTxt(pendientes)}`
        : `${vencidos > 0 ? ', y' : ' y'} ya retiraron todos`
    }
    if (vencenAntes > 0) aclaracion += `, ${vencenAntes} ${vencenAntes === 1 ? 'vence' : 'vencen'} antes del período que viene`
    lineas.push({ tipo: 'quedan_al_corte', titulo: 'Quedan en el estante al corte', signo: '−', valor: est.alComienzo, aclaracion })
  }

  const ya = yaPedidoDe(ctx.pedidos, r.protocol_id, r.medication_id)
  // RD17: si ya llegó y falta verificarlo, se dice acá también, para que no se vuelva a pedir.
  const llego = ya.envases > 0 ? sinVerificarDe(ctx.pedidos, r.protocol_id, r.medication_id) : null
  lineas.push({
    tipo: 'ya_pedido', titulo: 'En camino', signo: '−', valor: ya.envases,
    aclaracion: ya.envases === 0 ? 'sin pedidos abiertos'
      : llego ? `${textoDePedidos(ya.pedidos)} · ${faltaVerificarTxt(llego)}` : textoDePedidos(ya.pedidos),
  })
  for (const v of est.vencenEnElMes) {
    avisos.push({ tipo: 'vence', ambar: true, texto: `Vence el ${diaMes(v.expiry_date)}: lote ${v.lot_number}, ${envasesTxt(v.quantity)}` })
  }

  const comprar = Math.max(0, lineas.reduce((s, l) => (l.signo === '−' ? s - l.valor : s + l.valor), 0))
  const estado: EstadoRenglon = comprar > 0 ? 'comprar' : ya.envases > 0 ? 'en_camino' : 'alcanza'
  return {
    ...base, estado, comprar, enCamino: ya.envases, faltaEstePeriodo: Math.max(0, est.faltaEsteMes - ya.envases), minimo,
    boleta: { lineas, aComprar: comprar }, avisos, detallePacientes,
  }
}

/** El subtítulo de «Pacientes que lo reciben»: «2 · ambos suman a la cuenta», «3 · 1 no suma». */
export function textoPacientesQueSuman(ps: readonly Pick<PacienteDelRenglon, 'suma'>[]): string {
  const n = ps.length
  if (n === 0) return 'ningún paciente en tratamiento lo tiene asignado'
  const fuera = ps.filter((p) => !p.suma).length
  if (fuera === 0) return `${n} · ${n === 1 ? 'suma' : n === 2 ? 'ambos suman' : 'todos suman'} a la cuenta`
  if (fuera === n) return `${n} · ninguno suma`
  return `${n} · ${fuera} no ${fuera === 1 ? 'suma' : 'suman'}`
}

export function armarReposicionDelPeriodo(
  insumos: InsumosDelPeriodo,
  hoy: string,
  periodo: Periodo,
  diaCorte: number,
): ReposicionDelPeriodo {
  const proximo = periodoSiguiente(periodo, diaCorte)
  const actual = enCurso(periodo, hoy)
  const ventana = actual ? ventanaTarde(hoy, diaCorte) : null
  const pedidos = armarPedidos(insumos.pedidos, insumos.pedido_items, insumos.recepciones)
  const ctx: Contexto = {
    insumos, hoy, periodo, proximo, actual, pedidos,
    duplicados: presentacionesDuplicadas(insumos.pacientes),
    noventaDias: sumarDias(hoy, -90),
  }

  const estudios = insumos.estudios
    .filter((e) => e.status !== 'cerrado')
    .sort((a, b) => a.code.localeCompare(b.code, 'es'))
    .map((estudio): EstudioReposicion => {
      const pedidosDelEstudio = pedidos.filter((p) => p.protocol_id === estudio.id)
      const renglonesCon = (tarde: boolean) => insumos.renglones
        .filter((r) => r.protocol_id === estudio.id)
        .map((r) => armarRenglon(r, ctx, tarde))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      // RD1: dentro de la ventana, un período que empezó sin pedido y al que le falta algo se pide a sí
      // mismo. Si no le falta nada, no hay nada tarde que pedir y la cuenta es la del que viene.
      const renglonesTarde = ventana && !pedidoPara(pedidosDelEstudio, periodo) ? renglonesCon(true) : null
      const tarde = renglonesTarde?.some((r) => r.comprar > 0) ? ventana : null
      const renglones = tarde && renglonesTarde ? renglonesTarde : renglonesCon(false)
      const objetivo = !actual ? null : tarde ? periodo : proximo
      const pedidoDelObjetivo = objetivo ? pedidoPara(pedidosDelEstudio, objetivo) : null

      const reponibles = renglones.filter((r) => r.estado !== 'no_se_compra').length
      const sinCargar = renglones.filter((r) => r.estado === 'sin_cargar').length
      const aComprar = renglones.filter((r) => r.comprar > 0)
      const envases = aComprar.reduce((s, r) => s + r.comprar, 0)
      return {
        estudio,
        renglones,
        pedidos: pedidosDelEstudio,
        objetivo,
        tarde,
        pedidoDelObjetivo,
        // RD4: el renglón de «lo anterior» es de OTROS períodos. Un segundo pedido del mismo (con «Armar
        // otro pedido») se ve en la lista del estudio, no ahí (revisión de ingeniería, 11).
        pedidosQueDeben: pedidosDelEstudio
          .filter((p) => p.estado !== 'anulado' && p.faltanteTotal > 0 && p.id !== pedidoDelObjetivo?.id
            && !(objetivo && seSuperpone(p, objetivo)))
          .sort((a, b) => a.numero - b.numero),
        resumen: {
          envases, medicamentos: aComprar.length, sinCargar, reponibles,
          faltaEstePeriodo: renglones.reduce((s, r) => s + r.faltaEstePeriodo, 0),
        },
        // 'sin_medicacion' primero: es cierto pase lo que pase con el período. Después, si el período no
        // está en curso (R6), la tarjeta tampoco inventa 'cubierto': dice 'sin_cuenta'.
        estadoTarjeta: reponibles === 0 ? 'sin_medicacion'
          : !actual ? 'sin_cuenta'
            : sinCargar === reponibles ? 'todo_sin_cargar'
              : envases > 0 ? 'comprar'
                : 'cubierto',
        sinMedicacionHabilitada: insumos.sin_medicacion.find((s) => s.protocol_id === estudio.id)?.enrolamientos ?? 0,
      }
    })

  return {
    hoy, periodo, proximo, enCurso: actual,
    diasAlCorte: actual ? diasHastaElCorte(hoy, periodo) : null,
    ventana,
    estudios,
  }
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

/**
 * Arranca en lo calculado; lo sin cargar en cero para pedirlo a mano; «no se compra» no aparece.
 * Sólo tiene sentido con un `EstudioReposicion` del período EN CURSO: fuera de curso todo renglón con
 * cuenta es `'sin_cuenta'` (comprar 0), y armar el pedido desde ahí pediría todo en cero.
 */
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
