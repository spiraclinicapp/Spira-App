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
export const COLUMNAS = [
  // Las cuatro del medio van CENTRADAS. Son datos cortos de cotejo —código, lote, fecha,
  // laboratorio— y centrarlos les da un eje propio, con el nombre del medicamento anclado a la
  // izquierda y la cantidad a la derecha cerrando la fila. Los bordes cargan el peso; el medio
  // respira.
  { clave: 'medicamento', label: 'Medicamento', ancho: '29%', align: 'left' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '16%', align: 'center' },
  { clave: 'lote',        label: 'Lote',        ancho: '12%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '15%', align: 'center' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '16%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '12%', align: 'right' },
] as const

/**
 * Ancho mínimo de la TABLA. Por debajo scrollea en horizontal en vez de esconder columnas: es una
 * vista auditable y un dato que no se ve es un dato que no está. El encabezado ya no entra en ese
 * scroll — no comparte anchos con la tabla, así que no tiene con qué desalinearse.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
