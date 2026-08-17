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
 * ESTOS ANCHOS ESTÁN MEDIDOS, NO ELEGIDOS A OJO, y equilibran el AIRE, no las columnas.
 *
 * Son dos cosas distintas y no se pueden tener las dos. Para centrar geométricamente el bloque del
 * medio, Medicamento y Cantidad tienen que medir lo mismo (23% y 23%); pero entonces el aire se
 * desbalancea al revés, porque el contenido de los bordes es asimétrico: un nombre de medicamento
 * ocupa casi toda su columna y "5 u." casi nada. Se probaron cinco distribuciones midiendo, sobre
 * las 12 filas reales de la pantalla, la diferencia entre el hueco que queda a la izquierda del
 * bloque central y el que queda a la derecha:
 *
 *   29/16/12/15/16/12  → +71px de diferencia promedio (la primera versión; se veía corrido)
 *   23/15/12/13/14/23  → −105px (bloque geométricamente centrado, aire peor)
 *   26/15/13/14/15/17  → −15px
 *   27/15/13/14/16/15  → +12px, y el peor caso individual más bajo de todos (81px)  ← ésta
 *
 * Si cambian los anchos hay que volver a medir con datos reales: el punto de equilibrio depende
 * del largo de los nombres, y medir una sola fila da una respuesta distinta que medir doce.
 */
export const COLUMNAS = [
  { clave: 'medicamento', label: 'Medicamento', ancho: '27%', align: 'left' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '15%', align: 'center' },
  { clave: 'lote',        label: 'Lote',        ancho: '13%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '14%', align: 'center' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '16%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '15%', align: 'right' },
] as const

/**
 * Ancho mínimo de la TABLA. Por debajo scrollea en horizontal en vez de esconder columnas: es una
 * vista auditable y un dato que no se ve es un dato que no está. El encabezado ya no entra en ese
 * scroll — no comparte anchos con la tabla, así que no tiene con qué desalinearse.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
