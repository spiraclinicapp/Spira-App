import { describe, expect, it } from 'vitest'
import { contadorDeProcedimientos, notaDelRetest, proximaVisitaDe } from './pedirRetest'

describe('notaDelRetest', () => {
  it('motivo y comentario: el motivo al frente', () => {
    expect(notaDelRetest('Muestra no válida', '  Hemolizada  ')).toBe('Motivo: Muestra no válida. Hemolizada')
  })
  it('sólo motivo, sólo comentario, o nada', () => {
    expect(notaDelRetest('Pedido del sponsor', '   ')).toBe('Motivo: Pedido del sponsor.')
    expect(notaDelRetest(null, 'Repetir ECG')).toBe('Repetir ECG')
    expect(notaDelRetest(null, '  ')).toBeNull()
  })
})

describe('proximaVisitaDe', () => {
  const HOY = '2026-10-13'
  const origen = { id: 'v6', enrollment_id: 'e1' }
  const v = (id: string, extra: Partial<{ enrollment_id: string; kind: 'programada' | 'vnp' | 'retest'; real_date: string | null; estimated_date: string | null }> = {}) => ({
    id, enrollment_id: 'e1', kind: 'programada' as const, real_date: null, estimated_date: '2026-10-28', ...extra,
  })

  it('la próxima del cronograma sin hacer, de la misma inscripción', () => {
    const visitas = [v('v8', { estimated_date: '2026-11-20' }), v('v7', { estimated_date: '2026-10-28' })]
    expect(proximaVisitaDe(visitas, origen, HOY)?.id).toBe('v7')
  })
  it('no cuentan: hechas, de hoy o antes, sueltas, la propia ni las de otra inscripción', () => {
    const visitas = [
      v('hecha', { real_date: '2026-10-20', estimated_date: '2026-10-20' }),
      v('hoy', { estimated_date: HOY }),
      v('suelta', { kind: 'vnp' }),
      v('v6'),
      v('otra', { enrollment_id: 'e2' }),
      v('sinFecha', { estimated_date: null }),
    ]
    expect(proximaVisitaDe(visitas, origen, HOY)).toBeNull()
  })
})

describe('contadorDeProcedimientos', () => {
  it('singular, plural y vacío', () => {
    expect(contadorDeProcedimientos(0)).toBe('Elegí al menos uno')
    expect(contadorDeProcedimientos(1)).toBe('1 procedimiento')
    expect(contadorDeProcedimientos(4)).toBe('4 procedimientos')
  })
})
