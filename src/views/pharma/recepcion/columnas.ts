/**
 * Las seis columnas del detalle de una recepción, en UN SOLO LUGAR.
 *
 * El header del documento y la tabla de renglones usan exactamente estos anchos: el header es un
 * grid y la tabla un `<table>` con `<col>`, y lo que hace que el texto de cada celda del header
 * caiga sobre el título de su columna es que los dos lean de acá. Escribirlos dos veces es la
 * forma segura de que alguien toque uno y la alineación se rompa sin que nadie se entere.
 *
 * `table-layout: fixed` es REQUISITO en la tabla: sin él el navegador ignora los porcentajes y
 * reparte a su gusto según el contenido, que es justo lo que la grilla rígida viene a evitar.
 */
export const COLUMNAS = [
  { clave: 'medicamento', label: 'Medicamento', ancho: '29%', align: 'left' },
  { clave: 'codigo',      label: 'Código / EAN', ancho: '16%', align: 'left' },
  // Lote y Laboratorio se centran: su título es más ancho que el valor, y centrando los dos
  // comparten eje vertical. Las demás alinean al borde.
  { clave: 'lote',        label: 'Lote',        ancho: '12%', align: 'center' },
  { clave: 'vence',       label: 'Vence',       ancho: '15%', align: 'left' },
  { clave: 'laboratorio', label: 'Laboratorio', ancho: '16%', align: 'center' },
  { clave: 'cantidad',    label: 'Cantidad',    ancho: '12%', align: 'right' },
] as const

/** Para el `grid-template-columns` del header. Mismos anchos, mismo orden. */
export const GRID_COLUMNAS = COLUMNAS.map((c) => c.ancho).join(' ')

/**
 * Ancho mínimo del bloque. Por debajo, el header y la tabla scrollean JUNTOS en horizontal en
 * vez de esconder columnas: es una vista auditable y un dato que no se ve es un dato que no está.
 * Scrollean juntos porque viven en el mismo contenedor con overflow — si no, se desalinean al
 * primer scroll y la grilla rígida deja de serlo.
 */
export const ANCHO_MINIMO = 700

/** Padding lateral de TODA celda (header, th y td). El handoff insiste: no se cambia por separado. */
export const PADDING_LATERAL = 20
