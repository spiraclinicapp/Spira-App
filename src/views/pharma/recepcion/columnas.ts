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
 * SEIS COLUMNAS IGUALES Y TODO CENTRADO. Los ejes quedan equiespaciados por construcción y los
 * huecos se emparejan solos: al centrar, el sobrante de cada columna se reparte mitad y mitad a
 * cada lado, así que el hueco entre dos columnas vecinas es siempre la suma de dos mitades. No
 * hay porcentaje que ajustar.
 *
 * A esto se llegó después de tres intentos de emparejar los huecos moviendo anchos, y el motivo
 * de que ninguno cerrara vale escribirlo: **ese hueco se mide dos veces y da distinto**. El título
 * decía "MEDICAMENTO" (93px) y el dato "Salbutral 100 mcg" (187px), los dos anclados al MISMO
 * borde izquierdo; emparejar el hueco de los títulos desemparejaba el de los valores y al revés.
 * Barridas 121 combinaciones, la suma de ambos errores nunca bajó de ~70px. El problema no eran
 * los anchos: era anclar al borde dos textos de largo muy distinto.
 *
 * El título del medicamento vuelve (2026-08-17, pedido del Director). No reintroduce el problema
 * porque ya no está anclado a la izquierda: centrado en una columna del mismo ancho que las demás,
 * su largo deja de importar. Lo que desbalanceaba no era el título, era el anclaje al borde.
 */
export const COLUMNAS = [
  { clave: 'medicamento', label: 'Medicamento', ancho: '16.67%', align: 'center' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '16.67%', align: 'center' },
  { clave: 'lote',        label: 'Lote',        ancho: '16.67%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '16.67%', align: 'center' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '16.66%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '16.66%', align: 'center' },
] as const

/**
 * Ancho mínimo de la TABLA. Por debajo scrollea en horizontal en vez de esconder columnas: es una
 * vista auditable y un dato que no se ve es un dato que no está. El encabezado ya no entra en ese
 * scroll — no comparte anchos con la tabla, así que no tiene con qué desalinearse.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
