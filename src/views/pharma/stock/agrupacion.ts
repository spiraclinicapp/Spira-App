import type { LotDetailRow } from '../../../data/pharma'
import type { Estado } from '../expiryState'

/**
 * Reglas puras de la lista de Stock (Farmacia › Stock, apartados Protocolo y Ambulatoria).
 *
 * Están acá y no adentro del JSX porque son EXACTAMENTE lo que falla en silencio: un grupo que
 * debería abrirse por tener un lote vencido y no se abre se ve perfecto en pantalla, sólo está
 * mal. El conector torcido, en cambio, se ve — eso se verifica mirando, no con un test.
 *
 * ── La lista tiene DOS granos ────────────────────────────────────────────────────────────────
 *
 *   medicamento con 1 lote  →  fila plana (LoteRow)
 *   medicamento con N lotes →  grupo plegable: resumen + lotes con conector de árbol
 *
 * ── Y un grupo es (MEDICAMENTO, ÁMBITO), nunca un medicamento suelto ─────────────────────────
 *
 *   El catálogo es GLOBAL desde la 0032 y recibir asigna solo (0040), así que dos estudios que
 *   usen el mismo producto comparten `medication_id`. La query de la vista trae los lotes de
 *   TODOS los protocolos de una sola vez, y el front reparte después por protocolo. Agrupar
 *   sólo por medicamento fusionaba esos dos estudios en un grupo: aparecía una vez, bajo el
 *   protocolo del primer lote, sumando stock ajeno, y desaparecía del otro. Por eso la clave
 *   lleva el ámbito, y por eso `key` existe: es lo único que distingue a los dos grupos en el
 *   plegado, en el kebab y en la reconciliación de React.
 *
 * ── Buscar y filtrar son dos oficios distintos (y acá se nota) ───────────────────────────────
 *
 *   El BUSCADOR SELECCIONA grupos: si algún lote matchea, se muestra el grupo con TODOS sus
 *   lotes. No recorta. Motivo: el stock de un medicamento es un hecho clínico y un buscador no
 *   debería cambiarlo — si el resumen dijera "5 u." porque filtramos el otro lote, estaría
 *   mintiendo sobre cuánto hay. Y encontrar un lote te muestra de paso sus hermanos, que es lo
 *   que necesitás para elegir cuál dispensar.
 *
 *   El FILTRO de vencimiento RECORTA lotes: "Vencidos" muestra los vencidos y nada más. Como
 *   entonces el resumen habla de menos lotes de los que el medicamento tiene, se recalcula sobre
 *   lo visible y la columna Lote lo dice en voz alta: "1 de 3 lotes".
 *
 * (Es la misma distinción que ya estaba escrita en el toolbar de la vista: "el de la izquierda
 * encuentra una fila, los de la derecha recortan el conjunto".)
 */

/** Umbral de "stock bajo" por LOTE. Es el que ya usaba la vista; `low_stock_threshold` de la
 *  migración 0032 —configurable por medicamento— todavía no se usa (ver TODOS.md). */
export const STOCK_BAJO = 5

export type EstadoFilter = 'todos' | 'vigentes' | 'pronto' | 'vencido'

/** Nivel de existencias, independiente del vencimiento. */
export type Nivel = 'ok' | 'bajo' | 'agotado'

export interface GrupoVisible {
  /** Identidad del grupo: `(medicamento, ámbito)`, de `claveDeGrupo`. Es lo que hay que usar como
   *  `key` de React, como índice del plegado y como id del kebab — `medicationId` a secas NO
   *  alcanza, porque el mismo medicamento puede tener un grupo por protocolo en la misma lista. */
  key: string
  medicationId: string
  name: string
  drugName: string | null
  /** EAN13: uno por medicamento, así que es propiedad del GRUPO, no del lote (ver LotDetailRow.code). */
  code: string | null
  protocolId: string | null
  /** Los lotes que se muestran: los que pasan el filtro de vencimiento. Nunca vacío. */
  lotes: LotDetailRow[]
  /** Cuántos lotes tiene el medicamento EN ESTE ÁMBITO antes del filtro. Si difiere de
   *  `lotes.length`, la columna Lote dice "M de N lotes" en vez de "N lotes". */
  totalLotes: number
  /** Estado inicial del plegado. Es una SUGERENCIA: el clic del usuario la pisa, y se vuelve a
   *  calcular cuando cambia la búsqueda o el filtro (ver `claveDePlegado`). */
  abiertoPorDefecto: boolean
}

/* ── Grano lote ─────────────────────────────────────────────────────────────── */

/** Estado de vencimiento a partir de los flags server-side de `v_medication_lots_detail` (0041). */
export function estadoDe(r: LotDetailRow): Estado {
  return r.vencido ? 'vencido' : r.por_vencer ? 'pronto' : 'ok'
}

export function matchTexto(busqueda: string, ...campos: (string | null)[]): boolean {
  const q = busqueda.trim().toLowerCase()
  if (!q) return true
  return campos.some((c) => c?.toLowerCase().includes(q) ?? false)
}

/** Un lote matchea si coincide el medicamento, la droga, el número de lote o el EAN. Los dos
 *  últimos son los que hacen que la búsqueda tenga que ABRIR el grupo: son datos del lote, no
 *  del medicamento, así que sin desplegar no se ven. */
export function loteMatchea(r: LotDetailRow, busqueda: string): boolean {
  return matchTexto(busqueda, r.name, r.drug_name, r.lot_number, r.code)
}

export function pasaEstado(r: LotDetailRow, filtro: EstadoFilter): boolean {
  if (filtro === 'todos') return true
  const e = estadoDe(r)
  if (filtro === 'vigentes') return e === 'ok'
  if (filtro === 'pronto') return e === 'pronto'
  return e === 'vencido'
}

export function nivelDeCantidad(qty: number): Nivel {
  if (qty === 0) return 'agotado'
  return qty <= STOCK_BAJO ? 'bajo' : 'ok'
}

/* ── Grano medicamento ──────────────────────────────────────────────────────── */

/** Peor estado presente. El orden importa: un vencido pisa a un "vence pronto", y los dos pisan
 *  a "vigente". Sin esto, un grupo con un lote vencido y otro sano se resumiría como sano. */
export function estadoDelGrupo(lotes: LotDetailRow[]): Estado {
  let peor: Estado = 'ok'
  for (const l of lotes) {
    const e = estadoDe(l)
    if (e === 'vencido') return 'vencido'
    if (e === 'pronto') peor = 'pronto'
  }
  return peor
}

/** La fecha MÁS PRÓXIMA de los lotes, que es la que manda al dispensar (FEFO). `null` sólo si
 *  ninguno tiene vencimiento — ahí la columna muestra "—". Comparación lexicográfica de
 *  'YYYY-MM-DD', segura y sin Date. */
export function vencimientoDelGrupo(lotes: LotDetailRow[]): string | null {
  let min: string | null = null
  for (const l of lotes) {
    if (!l.expiry_date) continue
    if (min === null || l.expiry_date < min) min = l.expiry_date
  }
  return min
}

export function stockTotal(lotes: LotDetailRow[]): number {
  return lotes.reduce((acc, l) => acc + l.quantity_on_hand, 0)
}

/**
 * Nivel del medicamento. Las dos mitades NO son simétricas y es a propósito:
 *
 *   'agotado' pide que TODOS los lotes estén en cero — un lote vacío al lado de uno con 10
 *             unidades no es un medicamento agotado.
 *   'bajo'    pide que ALGUNO esté bajo. Si sumáramos, dos lotes de 4 y 5 darían 9 y el badge
 *             desaparecería justo al agrupar: agrupar apagaría una advertencia que hoy se ve.
 */
export function nivelDelGrupo(lotes: LotDetailRow[]): Nivel {
  if (lotes.length === 0) return 'ok'
  if (lotes.every((l) => l.quantity_on_hand === 0)) return 'agotado'
  return lotes.some((l) => nivelDeCantidad(l.quantity_on_hand) === 'bajo') ? 'bajo' : 'ok'
}

/**
 * Estado inicial del plegado. Se abre si hay algo que mirar sin que haga falta un clic:
 *   · un lote vencido o por vencer (un vencido no debería depender de que alguien despliegue), o
 *   · un lote que matchea la búsqueda (si no, buscar un número de lote no devuelve nada visible,
 *     que es una regresión contra la lista plana de hoy).
 */
export function debeAbrirse(lotes: LotDetailRow[], busqueda: string): boolean {
  if (estadoDelGrupo(lotes) !== 'ok') return true
  if (busqueda.trim() === '') return false
  return lotes.some((l) => loteMatchea(l, busqueda))
}

/**
 * Clave del cálculo de plegado. El toggle manual del usuario gana sobre `abiertoPorDefecto`,
 * pero sólo mientras la pregunta sea la misma: en cuanto cambia la búsqueda o el filtro, la
 * sugerencia se recalcula desde cero y los cierres a mano se olvidan. Sin esto, cerrar un grupo
 * una vez escondería para siempre un lote que vence la semana que viene.
 */
export function claveDePlegado(busqueda: string, filtro: EstadoFilter): string {
  return `${filtro} ${busqueda.trim().toLowerCase()}`
}

/* ── Armado de la lista ─────────────────────────────────────────────────────── */

/**
 * La identidad de un grupo. Va aparte —y exportada— para que el formato tenga UNA definición: la
 * usan el armado, el plegado, el kebab y los tests, y si dos de esos la escribieran a mano se
 * desincronizarían sin que nada falle a la vista.
 *
 * `protocolId` null es el ámbito ambulatorio (CHECK de la 0035) y se serializa explícitamente:
 * dejarlo caer a `undefined` o a cadena vacía lo volvería indistinguible de un protocolo sin id.
 * Los ids son uuid, así que los dos puntos nunca aparecen dentro de una mitad.
 */
export function claveDeGrupo(medicationId: string, protocolId: string | null): string {
  return `${medicationId}:${protocolId ?? 'ambulatoria'}`
}

/**
 * Agrupa por (medicamento, ámbito) conservando el orden de llegada (la query ordena por protocolo,
 * nombre y vencimiento).
 *
 * NUNCA por nombre: dos medicamentos distintos pueden llamarse igual, y fusionarlos sumaría stock
 * de dos productos diferentes. Y NUNCA por medicamento a secas: el mismo producto puede tener
 * lotes en dos estudios, y fusionarlos suma stock de dos ámbitos y lo hace desaparecer de uno
 * (ver el bloque de cabecera).
 */
export function agruparPorMedicamentoYAmbito(lotes: LotDetailRow[]): Map<string, LotDetailRow[]> {
  const grupos = new Map<string, LotDetailRow[]>()
  for (const l of lotes) {
    const clave = claveDeGrupo(l.medication_id, l.protocol_id)
    const arr = grupos.get(clave)
    if (arr) arr.push(l)
    else grupos.set(clave, [l])
  }
  return grupos
}

/**
 * De los lotes crudos de un apartado a lo que la lista dibuja.
 *
 *   todos ──► agrupar por (med, ámbito) ──► ¿algún lote matchea la búsqueda?  (SELECCIONA)
 *                                              │ no → el grupo no se muestra
 *                                              ▼ sí
 *                                     recortar por el filtro de estado      (RECORTA)
 *                                              │ queda vacío → no se muestra
 *                                              ▼
 *                                          GrupoVisible
 *
 * `medicationId` y `protocolId` salen del LOTE, no de la clave: la clave es una cadena armada y
 * volver a partirla para recuperar sus mitades es la clase de astucia que se rompe callada.
 */
export function construirGrupos(
  todos: LotDetailRow[],
  busqueda: string,
  filtro: EstadoFilter,
): GrupoVisible[] {
  const salida: GrupoVisible[] = []
  for (const [key, lotes] of agruparPorMedicamentoYAmbito(todos)) {
    if (!lotes.some((l) => loteMatchea(l, busqueda))) continue
    const visibles = lotes.filter((l) => pasaEstado(l, filtro))
    if (visibles.length === 0) continue
    const primero = lotes[0]
    salida.push({
      key,
      medicationId: primero.medication_id,
      name: primero.name,
      drugName: primero.drug_name,
      code: primero.code,
      protocolId: primero.protocol_id,
      lotes: visibles,
      totalLotes: lotes.length,
      abiertoPorDefecto: debeAbrirse(visibles, busqueda),
    })
  }
  return salida
}

/**
 * Un grupo se dibuja plegable cuando tiene más de un lote EN SU ÁMBITO, aunque el filtro deje uno
 * solo a la vista: si no, el "1 de 3 lotes" no tendría dónde vivir y el filtro escondería dos
 * lotes sin decirlo.
 */
export function esPlegable(g: GrupoVisible): boolean {
  return g.totalLotes > 1
}

/** Texto de la columna Lote en la fila resumen. Dice "3 lotes" normalmente, y "1 de 3 lotes"
 *  cuando el filtro de vencimiento dejó afuera a alguno. */
export function etiquetaLotes(g: GrupoVisible): string {
  const n = g.lotes.length
  const plural = g.totalLotes === 1 ? 'lote' : 'lotes'
  return n === g.totalLotes ? `${n} ${plural}` : `${n} de ${g.totalLotes} ${plural}`
}

/** Conteo del encabezado de sección/protocolo, sobre los grupos ya armados. Cuenta grupos y los
 *  llama "medicamentos", y eso sigue siendo honesto porque quien la llama ya recortó a UN ámbito:
 *  la sección de un protocolo (que `ProtocoloGroups` reparte antes de contar) o Ambulatoria
 *  entera. Pasarle grupos de varios ámbitos contaría dos veces el mismo medicamento. */
export function contarGrupos(grupos: GrupoVisible[]): string {
  const nMeds = grupos.length
  const nLotes = grupos.reduce((acc, g) => acc + g.lotes.length, 0)
  return `${nMeds} ${nMeds === 1 ? 'medicamento' : 'medicamentos'} · ${nLotes} ${nLotes === 1 ? 'lote' : 'lotes'}`
}
