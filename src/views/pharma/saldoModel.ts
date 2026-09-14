/**
 * ┌─ El saldo de una entrega en partes, dicho en la tarjeta (plan D8, D21 y R2, Tanda 3b) ───────┐
 *
 * Fenisona son 60 dosis y se entregan 30 cada 15 días: el renglón queda «entregar 1 de 2 envases» y
 * en la visita siguiente aparece «Saldo de Fenisona: 1 envase» con «Pedir el saldo».
 *
 *   saldo = indicado − entregado − en camino − lo que ya se sumó en esta pantalla sin mandar
 *
 * Los tres primeros números vienen de `contexto_dispensacion` (0123), por renglón original: el
 * vínculo es AL RENGLÓN, así que sigue a la sustitución y un cancelado devuelve su parte. La base
 * vuelve a hacer la misma cuenta al pedir y es la autoridad; ésta es la que decide qué se ve.
 *
 *   estado          cuándo (en este orden)                            qué se ve
 *   en_pantalla     ya se sumó un saldo sin mandar                    «Es el saldo de Fenisona»
 *   ya_pedido       lo que falta ya está en camino                    «… · ya pedido», sin botón
 *   ocupado         el medicamento ya tiene renglón en el pedido      sin botón (un renglón por medicamento)
 *   no_habilitado   se deshabilitó después de entregar la primera     «Ya no está habilitada», sin botón (D21)
 *   pedible         nada de lo anterior                               «Pedir el saldo»
 *
 * POR QUÉ ES PURO Y CON TEST. Un saldo mal contado se dibuja igual de prolijo: ofrecer otra vez lo
 * que ya está en camino (y entregar de más), o esconder un saldo que existe (y que el paciente se
 * quede sin la segunda parte). Ver el criterio en `dispensaciones/estados.test.ts`.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { ContextoDispensacionRow } from '../../data/pharma/dispensationModel'
import { formatAR, isoDayAR } from '../../lib/dates'

/** Un renglón elegido en la pantalla y todavía sin mandar. */
export interface RenglonLocal {
  medication_id: string
  quantity: number
  saldo_de_item_id?: string | null
}

export type EstadoSaldo = 'en_pantalla' | 'ya_pedido' | 'ocupado' | 'no_habilitado' | 'pedible'

export interface SaldoCaja {
  /** El renglón original: es lo que viaja como `saldo_de_item_id`. */
  itemId: string
  medicationId: string
  nombre: string
  indicado: number
  entregado: number
  enCamino: number
  /** Lo que falta sin contar lo sumado en pantalla. */
  pendiente: number
  /** Lo sumado en pantalla como saldo de esta indicación. */
  enPantalla: number
  /** Lo que se puede pedir ahora: `pendiente − enPantalla`. */
  restante: number
  /** La última parte entregada. */
  ultimaEntrega: string | null
  estado: EstadoSaldo
}

const envases = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`

/**
 * Los saldos de la visita. `ocupados` son los medicamentos que ya tienen un renglón normal en el
 * pedido abierto o en la pantalla: la base no deja dos renglones del mismo medicamento (0123).
 */
export function saldosDeLaVisita(
  contexto: readonly ContextoDispensacionRow[],
  locales: readonly RenglonLocal[],
  ocupados: ReadonlySet<string> = new Set(),
): SaldoCaja[] {
  const cajas: SaldoCaja[] = []
  for (const f of contexto) {
    if (f.tipo !== 'indicacion' || !f.item_id || !f.medication_id || f.indicado == null) continue
    const entregado = f.entregado ?? 0
    const enCamino = f.en_camino ?? 0
    const pendiente = Math.max(0, f.indicado - entregado - enCamino)
    const enPantalla = locales
      .filter((l) => l.saldo_de_item_id === f.item_id)
      .reduce((s, l) => s + l.quantity, 0)
    // Nada que decir: lo indicado ya se entregó entero y no hay nada en camino.
    if (pendiente === 0 && enCamino === 0 && enPantalla === 0) continue

    let estado: EstadoSaldo
    if (enPantalla > 0) estado = 'en_pantalla'
    else if (pendiente === 0) estado = 'ya_pedido'
    else if (ocupados.has(f.medication_id)) estado = 'ocupado'
    else if (f.habilitado === false) estado = 'no_habilitado'
    else estado = 'pedible'

    cajas.push({
      itemId: f.item_id,
      medicationId: f.medication_id,
      nombre: f.medication_name ?? 'Medicamento',
      indicado: f.indicado,
      entregado,
      enCamino,
      pendiente,
      enPantalla,
      restante: Math.max(0, pendiente - enPantalla),
      ultimaEntrega: f.instante,
      estado,
    })
  }
  return cajas
}

/** El renglón que agrega «Pedir el saldo»: todo lo que falta, del mismo medicamento. */
export function renglonDeSaldo(s: SaldoCaja): RenglonLocal & { quantity: number } {
  return { medication_id: s.medicationId, quantity: s.restante, saldo_de_item_id: s.itemId }
}

/** Fecha de la última parte, en hora argentina. */
const elDia = (ts: string | null) => (ts ? ` el ${formatAR(isoDayAR(ts))}` : '')

/** Las dos líneas de la caja. */
export function textoSaldo(s: SaldoCaja): { titulo: string; detalle: string } {
  const entregoDe = `Se entregó ${s.entregado} de ${s.indicado}${elDia(s.ultimaEntrega)}.`
  switch (s.estado) {
    case 'en_pantalla': {
      const quedan = s.pendiente - s.enPantalla
      return {
        titulo: `Es el saldo de ${s.nombre}`,
        detalle: quedan <= 0
          ? `Se entregó ${s.entregado}${elDia(s.ultimaEntrega)}. Con este se completan los ${s.indicado} indicados.`
          : `${entregoDe} Con este queda ${envases(quedan)} por pedir.`,
      }
    }
    case 'ya_pedido':
      return { titulo: `Saldo de ${s.nombre}: ${envases(s.indicado - s.entregado)} · ya pedido`, detalle: entregoDe }
    case 'ocupado':
      return {
        titulo: `Saldo de ${s.nombre}: ${envases(s.pendiente)}`,
        detalle: `${entregoDe} Ya hay un renglón de ${s.nombre} en el pedido.`,
      }
    case 'no_habilitado':
    case 'pedible':
      return { titulo: `Saldo de ${s.nombre}: ${envases(s.pendiente)}`, detalle: entregoDe }
  }
}
