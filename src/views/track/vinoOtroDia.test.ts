import { describe, expect, it } from 'vitest'
import { atendioPorDefecto, fechaMaximaParaCargar, fechaParaCargarPorDefecto } from './vinoOtroDia'

/*
 * Lo que «Vino otro día» propone por defecto (0158). Falla en silencio: el modal se ve igual proponiendo
 * una fecha que la base rechaza o a alguien que no atendió la visita. Los `hoy` van explícitos: CI corre
 * en UTC y la máquina en Argentina.
 */

const HOY = '2026-10-14'

describe('la fecha', () => {
  it('hasta ayer', () => {
    expect(fechaMaximaParaCargar(HOY)).toBe('2026-10-13')
    expect(fechaMaximaParaCargar('2026-11-01')).toBe('2026-10-31') // cambio de mes
  })
  it('por defecto, la citación si ya pasó', () => {
    expect(fechaParaCargarPorDefecto({ estimated_date: '2026-10-08' }, HOY, null)).toBe('2026-10-08')
    expect(fechaParaCargarPorDefecto({ estimated_date: '2026-10-13' }, HOY, null)).toBe('2026-10-13') // ayer vale
  })
  it('una citación de hoy, futura o ausente no se propone', () => {
    expect(fechaParaCargarPorDefecto({ estimated_date: HOY }, HOY, null)).toBe('')
    expect(fechaParaCargarPorDefecto({ estimated_date: '2026-10-28' }, HOY, null)).toBe('')
    expect(fechaParaCargarPorDefecto({ estimated_date: null }, HOY, null)).toBe('')
  })
  it('una citación anterior al mínimo (la visita previa ya hecha) tampoco: la base la rechazaría', () => {
    expect(fechaParaCargarPorDefecto({ estimated_date: '2026-10-08' }, HOY, '2026-10-10')).toBe('')
    expect(fechaParaCargarPorDefecto({ estimated_date: '2026-10-10' }, HOY, '2026-10-10')).toBe('2026-10-10') // el mínimo vale
  })
})

describe('quién la atendió', () => {
  const estudio = [{ id: 'lautaro' }, { id: 'claudia' }]
  it('el coordinador asignado, si coordina el estudio', () => {
    expect(atendioPorDefecto({ coordinator_id: 'claudia' }, estudio)).toBe('claudia')
  })
  it('un asignado que ya no coordina el estudio no se propone (la base lo rechazaría)', () => {
    expect(atendioPorDefecto({ coordinator_id: 'otra' }, estudio)).toBe('')
  })
  it('sin asignado: si el estudio tiene una sola persona, ésa; si tiene varias, nadie', () => {
    expect(atendioPorDefecto({ coordinator_id: null }, [{ id: 'lautaro' }])).toBe('lautaro')
    expect(atendioPorDefecto({ coordinator_id: null }, estudio)).toBe('')
    expect(atendioPorDefecto({ coordinator_id: null }, [])).toBe('')
  })
})
