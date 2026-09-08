import type { AmbitoDestino } from '../../../data/pharma'
import type { ProtocolRow } from '../../../data/protocols'

/**
 * Reglas puras de "Reasignar stock" (Farmacia › Stock, RPC `reassign_lot_stock` de la 0113).
 *
 * Están acá y no adentro del modal porque son las que fallan EN SILENCIO. Un desplegable de
 * destino que ofrece el ámbito donde el lote YA está se ve impecable: el usuario elige, confirma,
 * y la base rechaza con un mensaje que parece un error del sistema en vez de una opción que nunca
 * debió existir. Y uno que ofrece un estudio CERRADO se ve todavía mejor: la base lo acepta hasta
 * que alguien mira el inventario de un protocolo que ya terminó. El layout del modal, en cambio,
 * falla de manera visible y se verifica mirando.
 *
 * ── El destino es un ÁMBITO, no un protocolo ─────────────────────────────────────────────────
 *
 *   Ambulatoria no es "sin protocolo": es uno de los tres ámbitos del stock (CHECK de la 0035), y
 *   en la base se escribe como `protocol_id is null`. Por eso la opción vive en la misma lista que
 *   los estudios y no como una casilla aparte — y por eso el valor que viaja es una unión y no un
 *   id nullable (ver `AmbitoDestino` en data/pharma/stock.ts).
 *
 *   El ámbito de INVESTIGACIÓN no aparece nunca: el IP no vive en `medication_lots` desde la 0038
 *   (se lleva macro por cantidad, agregado desde las recepciones en `v_ip_stock`), así que no hay
 *   lote que mover ni a dónde moverlo. No es una omisión: es que el modelo no lo tiene.
 */

/** Clave de la opción "Ambulatoria" en el desplegable. No es un uuid, así que no colisiona con
 *  ningún `protocols.id`. */
export const AMBULATORIA_VALUE = 'ambulatoria'

export interface OpcionDestino {
  /** Clave para el `SearchableSelect`: el id del protocolo, o `AMBULATORIA_VALUE`. */
  value: string
  label: string
  /** Lo que se le manda al RPC. Viaja junto a la opción para que el modal no tenga que volver a
   *  deducirlo desde `value` (deducirlo dos veces es lo que las desincroniza). */
  destino: AmbitoDestino
}

/**
 * A dónde se puede mover un lote que hoy está en `protocolIdActual` (null = Ambulatoria).
 *
 * Se caen tres clases de destino, cada una por su motivo:
 *   · el ÁMBITO ACTUAL, porque mover algo a donde ya está no es una operación: la base lo rechaza
 *     y el usuario se queda mirando un error por haber elegido lo que le ofrecimos;
 *   · los protocolos CERRADOS, porque dejar entrar medicación a un estudio terminado es un
 *     hallazgo de auditoría. 'pausado' NO se cae: es un estudio vivo que está detenido, y
 *     reponerle stock es justamente lo que se hace cuando se reanuda;
 *   · nada más. La lista llega ya ordenada por código desde `useProtocols`, y Ambulatoria va al
 *     final porque es el ámbito que no es un estudio, no el primero de los estudios.
 */
export function destinosPara(
  protocolIdActual: string | null,
  protocolos: readonly ProtocolRow[],
): OpcionDestino[] {
  const salida: OpcionDestino[] = []
  for (const p of protocolos) {
    if (p.id === protocolIdActual) continue
    if (p.status === 'cerrado') continue
    salida.push({
      value: p.id,
      label: `${p.code} — ${p.name}`,
      destino: { tipo: 'protocolo', protocolId: p.id },
    })
  }
  if (protocolIdActual !== null) {
    salida.push({ value: AMBULATORIA_VALUE, label: 'Ambulatoria', destino: { tipo: 'ambulatoria' } })
  }
  return salida
}

export type Cantidad = { ok: true; cantidad: number } | { ok: false; error: string }

/**
 * La cantidad tecleada, validada contra lo que hay en el lote.
 *
 * Cada rechazo tiene SU mensaje: "ingresá algo", "tiene que ser entera" y "no hay tanto" son tres
 * cosas distintas para quien está parado frente al estante, y un único "cantidad inválida" lo
 * obliga a adivinar cuál de las tres. El tope se valida también en la base (el front no es la
 * autoridad); esto está para que el error llegue antes de apretar y sea sereno.
 *
 * Mover el lote ENTERO es válido: deja el lote origen en cero, que es exactamente lo que pasa
 * cuando se llevan todas las cajas. La fila se queda con su historial.
 */
export function validarCantidad(texto: string, disponible: number): Cantidad {
  const limpio = texto.trim()
  if (limpio === '') return { ok: false, error: 'Ingresá cuántas unidades querés mover.' }
  const n = Number(limpio)
  if (!Number.isFinite(n)) return { ok: false, error: 'La cantidad tiene que ser un número.' }
  if (!Number.isInteger(n)) return { ok: false, error: 'La cantidad tiene que ser un número entero.' }
  if (n <= 0) return { ok: false, error: 'La cantidad tiene que ser mayor que cero.' }
  if (n > disponible) {
    return {
      ok: false,
      error: `En el lote hay ${disponible} ${disponible === 1 ? 'unidad' : 'unidades'}: no podés mover ${n}.`,
    }
  }
  return { ok: true, cantidad: n }
}
