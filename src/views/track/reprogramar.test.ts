import { describe, expect, it } from 'vitest'
import { fechaPropuesta, fueraDeVentanaAlReprogramar } from './reprogramar'

const HOY = '2026-10-16'

describe('fechaPropuesta', () => {
  it('con citación, la citación', () => {
    expect(fechaPropuesta({ estimated_date: '2026-10-20' }, HOY)).toBe('2026-10-20')
  })
  it('turno cancelado con la fecha vieja todavía por venir: la propone (deshacer en dos clics)', () => {
    expect(fechaPropuesta({ estimated_date: null, citacion_cancelada: '2026-10-20' }, HOY)).toBe('2026-10-20')
  })
  it('turno cancelado con la fecha vieja de hoy: también', () => {
    expect(fechaPropuesta({ estimated_date: null, citacion_cancelada: HOY }, HOY)).toBe(HOY)
  })
  it('turno cancelado con la fecha vieja ya pasada: vacía, no un día que pasó', () => {
    expect(fechaPropuesta({ estimated_date: null, citacion_cancelada: '2026-10-08' }, HOY)).toBe('')
  })
  it('sin citación ni turno cancelado (una suelta sin fecha): vacía', () => {
    expect(fechaPropuesta({ estimated_date: null }, HOY)).toBe('')
  })
})

describe('fueraDeVentanaAlReprogramar', () => {
  it('sin fecha no está fuera de ventana (antes pedía confirmar un campo vacío)', () => {
    expect(fueraDeVentanaAlReprogramar('', '2026-10-18', '2026-10-22')).toBe(false)
  })
  it('dentro y en los bordes: no', () => {
    expect(fueraDeVentanaAlReprogramar('2026-10-18', '2026-10-18', '2026-10-22')).toBe(false)
    expect(fueraDeVentanaAlReprogramar('2026-10-22', '2026-10-18', '2026-10-22')).toBe(false)
  })
  it('antes o después: sí', () => {
    expect(fueraDeVentanaAlReprogramar('2026-10-17', '2026-10-18', '2026-10-22')).toBe(true)
    expect(fueraDeVentanaAlReprogramar('2026-10-23', '2026-10-18', '2026-10-22')).toBe(true)
  })
  it('sin ventana (una visita libre): nunca', () => {
    expect(fueraDeVentanaAlReprogramar('2026-10-23', null, null)).toBe(false)
  })
})
