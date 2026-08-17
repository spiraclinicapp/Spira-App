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
 * ESTOS ANCHOS ESTÁN MEDIDOS, NO ELEGIDOS A OJO. Cumplen dos condiciones del Director:
 *
 *   1. **Las cuatro centrales miden LO MISMO (16,5%)**, así que sus ejes quedan equiespaciados por
 *      construcción. No hay forma de que se desbalanceen al cambiar el contenido.
 *   2. **El hueco entre Medicamento y Código es el mismo que entre Laboratorio y Cantidad.** Eso
 *      NO sale de que los bordes midan igual —el contenido es asimétrico: un nombre llena casi
 *      toda su columna y "5 u." casi nada—, sino de compensar esa asimetría: 22% al medicamento
 *      y 12% a la cantidad.
 *
 * Se barrieron 24 combinaciones midiendo, sobre las 12 filas reales de la pantalla, la diferencia
 * entre los dos huecos (del fin del nombre al código, y del fin del laboratorio al número):
 *
 *   29/16/12/15/16/12       → +71px de diferencia promedio (la primera versión, se veía corrida)
 *   23/15/12/13/14/23       → −105px (bordes iguales: centra el bloque y empeora el aire)
 *   27/15/13/14/16/15       → +12px
 *   22/16,5×4/12            →  −2px, y el peor caso individual más bajo (65px)   ← ésta
 *
 * Si cambian los anchos hay que volver a medir con datos reales: el punto de equilibrio depende
 * del largo de los nombres, y medir una sola fila da una respuesta distinta que medir doce.
 * Cuidado al medir: el nombre del medicamento es un div de bloque, así que su borde derecho es el
 * de la celda y no el del texto — hay que usar un Range sobre el contenido o el número miente.
 */
export const COLUMNAS = [
  { clave: 'medicamento', label: 'Medicamento', ancho: '22%',   align: 'left' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '16.5%', align: 'center' },
  { clave: 'lote',        label: 'Lote',        ancho: '16.5%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '16.5%', align: 'center' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '16.5%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '12%',   align: 'right' },
] as const

/**
 * Ancho mínimo de la TABLA. Por debajo scrollea en horizontal en vez de esconder columnas: es una
 * vista auditable y un dato que no se ve es un dato que no está. El encabezado ya no entra en ese
 * scroll — no comparte anchos con la tabla, así que no tiene con qué desalinearse.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
