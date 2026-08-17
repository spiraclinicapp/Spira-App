import { describe, expect, it } from 'vitest'
import { EXPIRY_SOON_DAYS, estadoFromExpiry } from './expiryState'

/**
 * El estado de vencimiento de un renglón.
 *
 * POR QUÉ ESTA FUNCIÓN: decide si un lote se pinta rojo, ámbar o neutro en el detalle de
 * Recepción y en el catálogo de Medicamentos. Si el umbral queda corrido por un día, la pantalla
 * se ve perfecta y un lote vencido pasa por vigente — el error no tiene ninguna manifestación
 * visual que delate el problema. Es exactamente el caso que pide un test.
 *
 * La función ya estaba en producción sin cobertura; se agrega junto con el reskin "2c" porque
 * la tabla de renglones es lo que la usa.
 *
 * Fecha de "hoy" pasada como parámetro (`todayISO()` en la app), así que el test es determinista.
 */

const HOY = '2026-08-17'

describe('estadoFromExpiry', () => {
  it('sin fecha de vencimiento es vigente: una recepción puede no traerla y eso no bloquea nada', () => {
    expect(estadoFromExpiry(null, HOY)).toBe('ok')
  })

  it('ayer está vencido', () => {
    expect(estadoFromExpiry('2026-08-16', HOY)).toBe('vencido')
  })

  it('hoy NO está vencido todavía: vence hoy', () => {
    // El límite es estricto (`iso < hoy`). Un lote que vence hoy sigue siendo dispensable.
    expect(estadoFromExpiry(HOY, HOY)).toBe('pronto')
  })

  it('el último día del umbral todavía es "pronto"', () => {
    expect(EXPIRY_SOON_DAYS).toBe(30)
    expect(estadoFromExpiry('2026-09-16', HOY)).toBe('pronto')   // hoy + 30
  })

  it('un día después del umbral ya es vigente', () => {
    expect(estadoFromExpiry('2026-09-17', HOY)).toBe('ok')       // hoy + 31
  })

  it('cruza el fin de mes sin marearse', () => {
    expect(estadoFromExpiry('2026-09-01', HOY)).toBe('pronto')
  })

  it('cruza el fin de año', () => {
    expect(estadoFromExpiry('2027-01-05', '2026-12-20')).toBe('pronto')
    expect(estadoFromExpiry('2026-12-19', '2026-12-20')).toBe('vencido')
  })

  it('un vencimiento lejano es vigente', () => {
    expect(estadoFromExpiry('2027-07-15', HOY)).toBe('ok')
  })
})
