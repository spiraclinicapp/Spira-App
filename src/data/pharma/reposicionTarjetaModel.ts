import { diaMes, envasesTxt } from './reposicionModel'
import { textoPeriodo } from './periodoDeCorte'
import type { Periodo } from './periodoDeCorte'
import { faltaTxt, numerosDePedidos, pastillaDePedido, seSuperpone, textoDeRecepciones } from './pedidosMedicacionModel'
import type { PastillaPedido, PedidoMedicacion } from './pedidosMedicacionModel'
import type { EstudioReposicion, ReposicionDelPeriodo } from './reposicionPeriodoModel'

/**
 * ┌─ Lo que dicen la grilla y el estudio (spec 2026-09-16, revisión de diseño RD1, RD4-RD7, RD17) ─────┐
 *
 * La cuenta vive en reposicionPeriodoModel; acá se decide QUÉ se muestra de ella:
 *
 *   tarjeta   con pedido del período objetivo → el pedido y su pastilla (RD5)
 *             tarde → «N envases para comprar» + «Para el período que empezó · quedan 3 días» (RD1)
 *             ≤ 7 días al corte, o le falta algo al período en curso → «N envases para comprar» (RD6)
 *             el resto del mes → «Cubierto» + «Para el corte del 28/10: N envases · todavía sin pedido»
 *             + un renglón por los pedidos anteriores que todavía deben algo (RD4)
 *             Un pedido «Cerrado · no llegó» NO es el del período (Director, 2026-09-19): la tarjeta va
 *             como sin pedido y el renglón fijo lo nombra («… el Pedido Nº 14 no llegó»).
 *   franja    cuenta SÓLO los estudios con compras y sin pedido para su período objetivo (RD7)
 *
 * Se testea porque elegir mal no se ve: «Cubierto» con compras pendientes, o una franja que cuenta un
 * estudio que ya pidió, se dibujan igual de prolijos que lo correcto.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** RD6: faltando 7 días o menos para el corte, lo que hay que comprar es una tarea. */
export const DIAS_MODO_TAREA = 7

export type PrincipalTarjeta =
  | { tipo: 'comprar'; envases: number }
  | { tipo: 'cubierto' }
  | { tipo: 'falta_cargar' }
  | { tipo: 'sin_medicacion' }
  | { tipo: 'sin_cuenta' }
  | { tipo: 'pedido'; numero: number; pastilla: PastillaPedido }

export interface TextoTarjeta {
  texto: string
  /** Va en ámbar. */
  aviso: boolean
}

export interface RenglonTarjeta {
  texto: string
  /** El renglón fijo sin pedido va apagado; el de un pedido que debe algo, o que no llegó, no. */
  mudo: boolean
}

export interface TarjetaEstudio {
  principal: PrincipalTarjeta
  /** Debajo del principal, unidos por « · ». */
  detalle: TextoTarjeta[]
  /** RD4: el renglón fijo del período objetivo y, si hay, el de los pedidos anteriores que deben algo. */
  renglones: RenglonTarjeta[]
  /** Sin medicación de base no se entra (RD16). */
  clicable: boolean
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
export const quedanTxt = (n: number) => (n === 1 ? 'queda 1 día' : `quedan ${n} días`)
const periodoDelPedido = (p: PedidoMedicacion): Periodo => ({ desde: p.periodo_desde, hasta: p.periodo_hasta })

/** RD4: «Pedido Nº 13 · falta 1 envase» — sólo si un pedido que no es el del objetivo todavía debe algo. */
function renglonesQueDeben(e: EstudioReposicion): RenglonTarjeta[] {
  if (e.pedidosQueDeben.length === 0) return []
  const falta = e.pedidosQueDeben.reduce((s, p) => s + p.faltanteTotal, 0)
  return [{ texto: `${numerosDePedidos(e.pedidosQueDeben)} · ${faltaTxt(falta)}`, mudo: false }]
}

/**
 * El pedido del período objetivo que se cerró sin que llegara nada, el más nuevo. `pedidoPara` lo saltea
 * porque no cubre el período, pero callarlo haría decir «sin pedido» de un estudio que pidió y se quedó sin
 * nada: quien mira la tarjeta volvería a la farmacia sin saber que ya fue (Director, 2026-09-19).
 */
function pedidoQueNoLlego(e: EstudioReposicion): PedidoMedicacion | null {
  const objetivo = e.objetivo
  if (!objetivo) return null
  // `e.pedidos` viene del más nuevo al más viejo: el primero que aparece es el más nuevo.
  return e.pedidos.find((p) => p.estado === 'no_llego' && seSuperpone(p, objetivo)) ?? null
}

/**
 * El renglón FIJO del período objetivo cuando no hay pedido (RD4): «… sin pedido», apagado, o el pedido que
 * no llegó, sin apagar. Sigue siendo UN renglón: la tarjeta no pasa de dos (RD4, Director).
 */
function renglonSinPedido(inicio: string, sinPedido: string, noLlego: PedidoMedicacion | null): RenglonTarjeta {
  return noLlego
    ? { texto: `${inicio}el Pedido Nº ${noLlego.numero} no llegó`, mudo: false }
    : { texto: `${inicio}${sinPedido}`, mudo: true }
}

export function tarjetaDe(e: EstudioReposicion, rep: ReposicionDelPeriodo): TarjetaEstudio {
  const t = tarjetaSinAvisos(e, rep)
  // Revisión de ingeniería, 13: la grilla no puede dar por cerrada una cuenta que deja pacientes afuera. Es
  // la decisión 9 del plan (el aviso dentro del estudio) llevada a donde se decide si entrar.
  if (e.sinMedicacionHabilitada === 0 || t.principal.tipo === 'sin_medicacion') return t
  const fuera = `${plural(e.sinMedicacionHabilitada, 'paciente', 'pacientes')} sin medicación habilitada`
  return { ...t, detalle: [...t.detalle, { texto: fuera, aviso: true }] }
}

function tarjetaSinAvisos(e: EstudioReposicion, rep: ReposicionDelPeriodo): TarjetaEstudio {
  const deben = renglonesQueDeben(e)
  if (e.estadoTarjeta === 'sin_medicacion') return { principal: { tipo: 'sin_medicacion' }, detalle: [], renglones: [], clicable: false }
  // La grilla siempre es del período en curso; esto es por si alguna vez se arma con uno cerrado.
  if (!rep.enCurso || !e.objetivo) return { principal: { tipo: 'sin_cuenta' }, detalle: [], renglones: deben, clicable: true }

  // `pedidoPara` ya no devuelve uno «no llegó» (Director, 2026-09-19): si hay pedido, es uno que va a llegar.
  const p = e.pedidoDelObjetivo
  if (p) {
    const pastilla = pastillaDePedido(p)
    const detalle: TextoTarjeta[] = pastilla.clave === 'llego'
      ? [{ texto: `${textoDeRecepciones(p.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio))} sin verificar`, aviso: false }]
      : [{ texto: `${envasesTxt(p.pedidoTotal)} para el ${textoPeriodo(periodoDelPedido(p))}`, aviso: false }]
    // Pidió menos de lo que hacía falta (o se cerró parte): lo que sigue faltando no puede quedar callado.
    if (e.resumen.envases > 0) detalle.push({ texto: `${faltaTxt(e.resumen.envases)} más`, aviso: true })
    return { principal: { tipo: 'pedido', numero: p.numero, pastilla }, detalle, renglones: deben, clicable: true }
  }

  const envases = e.resumen.envases
  const sinCargar: TextoTarjeta[] = e.resumen.sinCargar > 0 ? [{ texto: `${e.resumen.sinCargar} sin cargar`, aviso: true }] : []
  const noLlego = pedidoQueNoLlego(e)

  if (e.estadoTarjeta === 'todo_sin_cargar') {
    return {
      principal: { tipo: 'falta_cargar' },
      detalle: [{ texto: `0 de ${e.resumen.reponibles} cargados`, aviso: false }],
      renglones: [renglonSinPedido('Para el período que viene: ', 'sin pedido', noLlego), ...deben],
      clicable: true,
    }
  }
  if (e.tarde) {
    return {
      principal: { tipo: 'comprar', envases },
      detalle: [{ texto: `Para el período que empezó · ${quedanTxt(e.tarde.quedan)}`, aviso: true }, ...sinCargar],
      renglones: [renglonSinPedido(`Para el período ${textoPeriodo(e.objetivo)}: `, 'sin pedido', noLlego), ...deben],
      clicable: true,
    }
  }
  if (envases === 0) {
    return {
      principal: { tipo: 'cubierto' },
      detalle: sinCargar,
      renglones: [{ texto: 'Para el período que viene: no hace falta pedir', mudo: true }, ...deben],
      clicable: true,
    }
  }
  // RD6 + decisión 3 del plan: es tarea cerca del corte, o si al período en curso le falta algo (si no,
  // el modo tranquilo diría «Cubierto» con pacientes que no van a tener su medicación).
  const tarea = (rep.diasAlCorte ?? 0) <= DIAS_MODO_TAREA || e.resumen.faltaEstePeriodo > 0
  if (tarea) {
    return {
      principal: { tipo: 'comprar', envases },
      detalle: [{ texto: plural(e.resumen.medicamentos, 'medicamento', 'medicamentos'), aviso: false }, ...sinCargar],
      renglones: [renglonSinPedido('Para el período que viene: ', 'sin pedido', noLlego), ...deben],
      clicable: true,
    }
  }
  return {
    principal: { tipo: 'cubierto' },
    detalle: sinCargar,
    renglones: [
      renglonSinPedido(`Para el corte del ${diaMes(rep.periodo.hasta)}: ${envasesTxt(envases)} · `, 'todavía sin pedido', noLlego),
      ...deben,
    ],
    clicable: true,
  }
}

export interface FranjaCorte {
  texto: string
  sub: string
  aviso: boolean
}

/** RD7: la franja arriba de la grilla. null si el período no está en curso. */
export function franjaDelCorte(rep: ReposicionDelPeriodo): FranjaCorte | null {
  if (!rep.enCurso || rep.diasAlCorte == null) return null
  const tardes = rep.estudios.filter((e) => e.tarde).length
  if (rep.ventana && tardes > 0) {
    return {
      texto: `El corte fue el ${diaMes(rep.ventana.corte)} · ${quedanTxt(rep.ventana.quedan)} para pedir el período que empezó`,
      sub: `${plural(tardes, 'estudio', 'estudios')} sin pedido para el ${textoPeriodo(rep.periodo)}.`,
      aviso: true,
    }
  }
  // Sólo los que tienen compras Y todavía no tienen pedido: uno que ya pidió no es una tarea pendiente.
  // Uno que no llegó no cuenta como pedido (`pedidoPara`): ese estudio vuelve a ser una tarea.
  const sinPedido = rep.estudios.filter((e) => e.resumen.envases > 0 && !e.pedidoDelObjetivo).length
  // «No hay nada para pedir» sólo si la cuenta está completa: con renglones sin cargar no se sabe
  // (revisión de ingeniería, 13). Si aplican las dos cosas se dicen las dos (revisión final, T4a): elegir
  // una callaba los renglones sin cargar en cuanto algún estudio tenía su pedido.
  const sinCargar = rep.estudios.filter((e) => e.resumen.sinCargar > 0).length
  const casos = [
    ...(rep.estudios.some((e) => e.pedidoDelObjetivo) ? ['todos los estudios con compras tienen su pedido'] : []),
    ...(sinCargar > 0 ? [`falta cargar cómo se repone en ${plural(sinCargar, 'estudio', 'estudios')}`] : []),
  ]
  const nada = `${casos.length > 0 ? casos.join('; ') : 'no hay nada para pedir'}.`
  const corte = diaMes(rep.periodo.hasta)
  const cortoSub = sinPedido > 0 ? `${plural(sinPedido, 'estudio', 'estudios')} sin pedido para el período que viene.` : nada.charAt(0).toUpperCase() + nada.slice(1)
  if (rep.diasAlCorte === 0) return { texto: 'El corte es hoy', sub: cortoSub, aviso: true }
  if (rep.diasAlCorte === 1) return { texto: `Corte mañana (${corte})`, sub: cortoSub, aviso: false }
  return {
    texto: `Corte el ${corte} · faltan ${rep.diasAlCorte} días`,
    sub: `Período ${textoPeriodo(rep.periodo)} · ${sinPedido > 0
      ? `${plural(sinPedido, 'estudio tiene', 'estudios tienen')} compras y todavía no ${sinPedido === 1 ? 'tiene' : 'tienen'} pedido.`
      : nada}`,
    aviso: false,
  }
}

/** Lo que va al lado de las flechas del período en el estudio. */
export function subtituloDelPeriodo(rep: ReposicionDelPeriodo, e: EstudioReposicion | null): TextoTarjeta {
  if (!rep.enCurso || rep.diasAlCorte == null) return { texto: 'Período cerrado', aviso: false }
  if (e?.tarde) return { texto: `Período en curso · ${quedanTxt(e.tarde.quedan)} para pedirlo`, aviso: true }
  if (rep.diasAlCorte === 0) return { texto: 'El corte es hoy', aviso: true }
  if (rep.diasAlCorte === 1) return { texto: 'Período en curso · el corte es mañana', aviso: false }
  return { texto: `Período en curso · el corte es en ${rep.diasAlCorte} días`, aviso: false }
}

export type ResumenEstudio =
  | { tipo: 'compra'; titulo: string; envases: number; sinCargar: number; detalle: string }
  | { tipo: 'pedido'; titulo: string; pedido: PedidoMedicacion; pastilla: PastillaPedido; detalle: string }

/** La franja blanca arriba de la tabla del estudio (mock «Estudio» y «2b»). null fuera de curso. */
export function resumenDelEstudio(e: EstudioReposicion, rep: ReposicionDelPeriodo): ResumenEstudio | null {
  if (!rep.enCurso || !e.objetivo) return null
  const titulo = `${e.tarde ? 'Para el período que empezó' : 'Para el período que viene'} (${textoPeriodo(e.objetivo)})`
  const p = e.pedidoDelObjetivo
  if (p) {
    const emitido = p.emitido_el === rep.hoy ? 'Emitido hoy' : `Emitido el ${diaMes(p.emitido_el)}`
    const cierre = e.resumen.envases === 0 ? 'con esto alcanza' : `${faltaTxt(e.resumen.envases)} más`
    return { tipo: 'pedido', titulo, pedido: p, pastilla: pastillaDePedido(p), detalle: `${emitido} · ${envasesTxt(p.pedidoTotal)} · ${cierre}` }
  }
  // Sin pedido que cubra el período; si hubo uno y no llegó, se nombra en vez de «todavía sin pedido».
  const noLlego = pedidoQueNoLlego(e)
  return {
    tipo: 'compra', titulo, envases: e.resumen.envases, sinCargar: e.resumen.sinCargar,
    detalle: e.resumen.envases > 0
      ? `${plural(e.resumen.medicamentos, 'medicamento', 'medicamentos')} para comprar · ${noLlego ? `el Pedido Nº ${noLlego.numero} no llegó` : 'todavía sin pedido'}`
      : 'No hace falta pedir',
  }
}

/**
 * Los pedidos que lista el estudio, del más nuevo al más viejo. En curso: los del período en curso y del
 * que viene, más cualquiera que todavía deba algo o tenga una recepción sin verificar. En un período
 * cerrado: los que eran para él.
 */
export function pedidosAMostrar(e: EstudioReposicion, rep: ReposicionDelPeriodo): PedidoMedicacion[] {
  return e.pedidos.filter((p) => (rep.enCurso
    ? seSuperpone(p, rep.periodo) || seSuperpone(p, rep.proximo) || p.faltanteTotal > 0 || p.conRecepcionSinVerificar
    : seSuperpone(p, rep.periodo)))
}
