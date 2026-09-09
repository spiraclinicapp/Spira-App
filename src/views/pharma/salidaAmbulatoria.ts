import { formatDayMonth } from '../../lib/dates'
import type { SalidaAmbulatoriaRow } from '../../data/pharma/ambulatoriaModel'

/**
 * Las cuatro partes de un renglón del historial de salidas ambulatorias.
 *
 * Vive afuera del componente porque es lo único testeable de la lista: las cuatro partes salen de
 * campos distintos de la misma fila, y un cruce se lee perfecto en pantalla siendo falso.
 *
 * El tipo se importa de `ambulatoriaModel` y no del barril `data/pharma`: ese barril arrastra
 * `lib/supabase`, que toca `window.sessionStorage` al cargarse y volvería intesteable este módulo.
 */
export function filaDeSalida(s: SalidaAmbulatoriaRow): {
  fecha: string
  medicamento: string
  cantidad: string
  quien: string
} {
  const dosis = s.medication_dosis?.trim()
  return {
    // `.slice(0, 10)` NO es decorativo: formatDayMonth espera YYYY-MM-DD y hace `iso.split('-')`.
    // Con el timestamptz crudo, el tercer pedazo es "08T14:30:00Z" y la fila muestra basura.
    fecha: formatDayMonth(s.created_at.slice(0, 10)),
    medicamento: dosis ? `${s.medication_name} ${dosis}` : s.medication_name,
    cantidad: `${s.quantity} ${s.medication_unit}`,
    quien: `a ${s.recipient_name} · autorizó ${s.authorized_by_name}`,
  }
}
