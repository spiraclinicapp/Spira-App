/**
 * ┌─ El stock que ve Coordinación, dicho en palabras ──────────────────────────────────────────┐
 *
 * Los números vienen de `stock_de_la_visita` (0121). Acá sólo se decide QUÉ decir y CUÁNDO avisar.
 *
 * POR QUÉ ES PURO Y CON TEST: un aviso que no salta se ve exactamente igual que uno que no tenía por
 * qué saltar. Y el caso que importa no es obvio: Farmacia arma cada medicamento desde UN SOLO lote
 * (FEFO de `mark_dispensation_ready`, 0075:499-510). Con 5 en un lote y 5 en otro, el estante dice
 * 10, pero un pedido de 8 revienta en el mostrador con el paciente esperando. El aviso tiene que
 * mirar el lote más grande, no el total.
 *
 *   en_estante = 0                     → "No hay stock de este medicamento."
 *   cantidad > maximo_armable          → "Farmacia puede armar hasta N de una vez."
 *   cantidad > lo que queda sin pedir  → "Quedan N sin pedir." / "Lo que hay ya está pedido."
 *   si no                              → sin aviso
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { StockVisitaRow } from '../../data/pharma'

/**
 * Lo que dice cada medicamento en el desplegable, en dos lugares:
 *
 *   · `meta` — la columna de la derecha: lo DISPONIBLE, o sea el estante menos lo que ya pidieron
 *     (esta visita y las demás del protocolo). Es el número que decide si pedir, y como `meta` el
 *     desplegable lo sigue mostrando en el disparador después de elegir.
 *   · `desc` — la segunda línea, SÓLO cuando hay algo pedido: explica por qué lo disponible es
 *     menos que el estante. Sin pedidos sería repetir el mismo número dos veces.
 *
 * Antes era sólo la segunda línea ("12 en stock · 3 ya pedidas"): el dato estaba, pero en gris, en
 * letra de explicación y con la resta a cargo de quien lee. No se leía como un indicador.
 *
 * Sin dato (cargando, o la consulta falló) devuelve `{}`: mejor no decir nada que afirmar "Sin
 * stock". Cero en el estante y "todo pedido" van en ámbar (`metaAlerta`): avisan, no decoran.
 */
export function indicadorStock(s: StockVisitaRow | undefined): { meta?: string; metaAlerta?: boolean; desc?: string } {
  if (!s) return {}
  if (s.en_estante <= 0) return { meta: 'Sin stock', metaAlerta: true }
  const pedidas = s.pedido_esta_visita + s.pedido_otras
  const libre = Math.max(0, s.en_estante - pedidas)
  const desc = pedidas > 0
    ? `${s.en_estante} en stock · ${pedidas} ya ${pedidas === 1 ? 'pedida' : 'pedidas'}`
    : undefined
  if (libre === 0) return { meta: 'Todo pedido', metaAlerta: true, desc }
  return { meta: `${libre} ${libre === 1 ? 'disponible' : 'disponibles'}`, desc }
}

/**
 * El aviso debajo de la cantidad. Nunca bloquea: el stock puede cambiar entre este momento y el
 * mostrador, y quien decide es la coordinadora.
 *
 * `yaContada` es la cantidad que ESTE renglón ya tiene en el pedido cuando se está editando: esa
 * parte ya está sumada en `pedido_esta_visita`, y sin descontarla una edición de 3 a 4 se
 * compararía como si se pidieran 7.
 *
 * El tope de un lote se compara contra la cantidad del renglón y no contra lo pedido en toda la
 * visita: el FEFO suma POR PEDIDO, y un medicamento no se repite dentro del mismo pedido (el panel
 * no lo ofrece de nuevo).
 */
export function avisoStock(s: StockVisitaRow | undefined, cantidad: number, yaContada = 0): string | null {
  if (!s || !Number.isFinite(cantidad) || cantidad <= 0) return null
  if (s.en_estante <= 0) return 'No hay stock de este medicamento.'
  if (cantidad > s.maximo_armable) return `Farmacia puede armar hasta ${s.maximo_armable} de una vez.`
  const libre = s.en_estante - s.pedido_otras - Math.max(0, s.pedido_esta_visita - yaContada)
  if (cantidad > libre) return libre > 0 ? `Quedan ${libre} sin pedir.` : 'Lo que hay ya está pedido.'
  return null
}
