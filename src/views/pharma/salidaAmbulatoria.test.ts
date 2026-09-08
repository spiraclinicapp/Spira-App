import { describe, expect, it } from 'vitest'
import { filaDeSalida } from './salidaAmbulatoria'
import type { SalidaAmbulatoriaRow } from '../../data/pharma/ambulatoriaModel'

/**
 * Cómo se lee un renglón del historial de salidas ambulatorias.
 *
 * Es presentación pura, y se testea porque las cuatro partes salen de campos distintos de la
 * misma fila: un cruce —la cantidad del medicamento equivocado, el autorizante donde va quien
 * recibe— se lee perfectamente bien en pantalla siendo falso.
 *
 * El tipo se importa de `ambulatoriaModel` y no del barril `data/pharma`: ese barril arrastra
 * `lib/supabase`, que toca `window.sessionStorage` al cargarse y revienta en vitest.
 */
const s = (campos: Partial<SalidaAmbulatoriaRow>): SalidaAmbulatoriaRow =>
  ({
    id: 's1', created_at: '2026-09-08T14:30:00Z', quantity: 1,
    recipient_name: 'Juan Pérez', recipient_document: null,
    authorized_by_name: 'Lautaro Molina', dispensed_by_name: 'Ana Farmacia',
    notes: null, medication_id: 'm1', medication_name: 'Seretide',
    medication_dosis: '25/250 mcg', medication_unit: 'u.', lot_number: 'L-4471',
    ...campos,
  }) as SalidaAmbulatoriaRow

describe('filaDeSalida', () => {
  it('arma las cuatro partes del renglón', () => {
    const f = filaDeSalida(s({}))
    expect(f.medicamento).toBe('Seretide 25/250 mcg')
    expect(f.cantidad).toBe('1 u.')
    expect(f.quien).toBe('a Juan Pérez · autorizó Lautaro Molina')
  })

  it('recorta el timestamp antes de formatear la fecha', () => {
    // `formatDayMonth` espera YYYY-MM-DD y hace `iso.split('-')`: pasarle el timestamptz crudo
    // deja "08T14:30:00Z sep" en pantalla. `created_at` es timestamptz, así que hay que recortar.
    expect(filaDeSalida(s({ created_at: '2026-09-08T14:30:00Z' })).fecha).toBe('08 sep')
  })

  it('sin dosis no deja el espacio colgado', () => {
    expect(filaDeSalida(s({ medication_dosis: null })).medicamento).toBe('Seretide')
    expect(filaDeSalida(s({ medication_dosis: '   ' })).medicamento).toBe('Seretide')
  })

  it('usa la unidad del medicamento, no una fija', () => {
    expect(filaDeSalida(s({ quantity: 30, medication_unit: 'comp.' })).cantidad).toBe('30 comp.')
  })
})
