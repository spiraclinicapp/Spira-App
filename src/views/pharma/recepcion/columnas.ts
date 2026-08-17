/**
 * Las seis columnas del detalle de una recepción, en UN SOLO LUGAR.
 *
 * SOLO LA TABLA usa esta grilla. La primera versión del reskin la compartía con el encabezado del
 * documento, siguiendo el handoff: el folio caía sobre "Medicamento", la fecha sobre "Código". Se
 * alineaba al píxel y aun así hacía ruido, porque son dos sistemas distintos peleando en la misma
 * franja — el encabezado identifica un documento, la tabla enumera renglones. Alinear el uno con
 * el otro no los une, los superpone. El encabezado pasó a componerse solo (2026-08-17).
 *
 * `table-layout: fixed` es REQUISITO: sin él el navegador ignora los porcentajes y reparte a su
 * gusto según el contenido, que es lo que estos anchos vienen a evitar.
 */
/**
 * Las cuatro del medio van CENTRADAS: son datos cortos de cotejo —código, lote, fecha,
 * laboratorio— y centrarlos les da un eje propio, con el nombre del medicamento anclado a la
 * izquierda y la cantidad cerrando a la derecha.
 *
 * ESTOS ANCHOS ESTÁN MEDIDOS, NO ELEGIDOS A OJO.
 *
 * **Las cuatro centrales miden LO MISMO (18,25%)**, así que sus ejes quedan equiespaciados por
 * construcción y no pueden desbalancearse al cambiar el contenido.
 *
 * Los dos bordes reparten un error que NO SE PUEDE ELIMINAR. El hueco de la izquierda se mide
 * dos veces y da distinto según qué fila mires: el título dice "MEDICAMENTO" (93px) y el dato dice
 * "Salbutral 100 mcg" (187px), los dos anclados al mismo borde. Emparejar el hueco de los TÍTULOS
 * desemparejaba el de los VALORES y al revés; barriendo 121 combinaciones, el mínimo de la suma de
 * los dos errores nunca baja de ~70px. Así que se reparte:
 *
 *   22 / 16,5×4 / 12   → títulos +102px, valores  −2px   (emparejaba los datos, el título se veía torcido)
 *   14 / 18,5×4 / 12   → títulos   −2px, valores −73px   (al revés)
 *   16 / 18,25×4 / 11  → títulos  +37px, valores −38px   ← ésta: el error queda partido y de signo opuesto,
 *                                                          así que la fila de títulos y la de datos se
 *                                                          compensan entre sí en vez de sumar
 *
 * Si cambian los anchos hay que volver a medir con datos reales, y medir LAS DOS FILAS: la de
 * títulos y la de valores. Optimizar una sola fue el error que costó tres iteraciones.
 * Cuidado además con el método: el nombre del medicamento es un div de bloque, así que su borde
 * derecho es el de la celda y no el del texto — se mide con un Range sobre el contenido o el
 * número miente.
 */
export const COLUMNAS = [
  { clave: 'medicamento', label: 'Medicamento', ancho: '16%',    align: 'left' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '18.25%', align: 'center' },
  { clave: 'lote',        label: 'Lote',        ancho: '18.25%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '18.25%', align: 'center' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '18.25%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '11%',    align: 'right' },
] as const

/**
 * Ancho mínimo de la TABLA. Por debajo scrollea en horizontal en vez de esconder columnas: es una
 * vista auditable y un dato que no se ve es un dato que no está. El encabezado ya no entra en ese
 * scroll — no comparte anchos con la tabla, así que no tiene con qué desalinearse.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
