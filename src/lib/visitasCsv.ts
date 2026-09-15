import type { TrackVisitRow } from '../data/visits'
import { desvioDias, visitTitle } from './visits'

/**
 * El CSV de visitas del protocolo ("Exportar reporte" del Detalle de Protocolo), una fila por visita.
 * PRIVACIDAD: exporta el código del paciente, nunca el nombre.
 *
 * Vive fuera del componente para poder fijarlo con un test: un CSV no se mira en la app, así que un
 * dato mal armado acá no se ve roto en ninguna pantalla — se descubre en una planilla, meses después.
 *
 * LA COLUMNA "Visita" ERA UN CONTADOR (hasta el 2026-09-14): `V${n}` con `n` sacado de numerar en
 * orden de fecha TODAS las filas recibidas, que son las de todos los pacientes del protocolo. Salían
 * "V1"…"V300" con la forma exacta de un código de protocolo, sin relación con ninguno y ni siquiera
 * por paciente. Ahora es el título de la visita, el mismo que se lee en la ficha. Las columnas
 * conservan nombre y posición: alguien puede tener una planilla armada contra ellas.
 */
export const VISITAS_CSV_HEADERS = ['Paciente', 'Visita', 'Codigo', 'Nombre visita', 'Estimada', 'Real', 'Desvio (dias)', 'Estado', 'Ventana inicio', 'Ventana fin']

export function filasVisitasCsv(rows: TrackVisitRow[]): unknown[][] {
  return rows.map((v) => [
    v.patient_code, visitTitle(v), v.visit_code ?? '', v.visit_name,
    v.estimated_date, v.real_date ?? '', desvioDias(v.estimated_date, v.real_date) ?? '', v.computed_status, v.window_start, v.window_end,
  ])
}
