import { describe, expect, it } from 'vitest'
import { atendioPorDefecto, fechaFijaParaCargar, fechaMaximaParaCargar, fechaParaCargarPorDefecto, quienesPudieronAtenderla } from './vinoOtroDia'

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

/* 0160: una visita en Concurrió que llegó OTRO día se carga con el día de la llegada, sin elegir. Si quedara
   al revés, el modal propondría una fecha que la base rechaza («Llegó el …»), o se ofrecería para una
   visita que llegó hoy y sólo tiene que iniciar la atención. */
describe('la fecha fija (Concurrió de otro día)', () => {
  const concurrio = (arrived_at: string | null) => ({ operational_stage: 'concurrio_al_centro' as const, arrived_at })
  it('llegó otro día: el día de la llegada', () => {
    expect(fechaFijaParaCargar(concurrio('2026-10-10T14:37:00.000Z'), HOY)).toBe('2026-10-10')
  })
  it('el día es el ARGENTINO: las 23:30 del 13 en AR son el 14 en UTC, y fue ayer', () => {
    expect(fechaFijaParaCargar(concurrio('2026-10-14T02:30:00.000Z'), HOY)).toBe('2026-10-13')
  })
  it('llegó hoy: no aplica (para eso está «Iniciar atención»)', () => {
    expect(fechaFijaParaCargar(concurrio('2026-10-14T13:00:00.000Z'), HOY)).toBeNull()
  })
  it('fuera de Concurrió, o sin llegada: no aplica', () => {
    expect(fechaFijaParaCargar({ operational_stage: 'por_llegar', arrived_at: null }, HOY)).toBeNull()
    expect(fechaFijaParaCargar({ operational_stage: 'inicio_atencion', arrived_at: '2026-10-10T14:37:00.000Z' }, HOY)).toBeNull()
    expect(fechaFijaParaCargar(concurrio(null), HOY)).toBeNull()
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

/* 0159 · «Gerencia puede hacer todo lo que pueden hacer los roles inferiores» (Director, 2026-10-14). TEST-QA no
   tenía coordinadores y «Vino otro día» no se podía usar: quien carga, si es de gerencia, también se ofrece. */
describe('a quién se ofrece', () => {
  const estudio = [{ id: 'lautaro', full_name: 'Lautaro Molina' }]
  it('los coordinadores del estudio, tal cual', () => {
    expect(quienesPudieronAtenderla(estudio, null)).toEqual([{ id: 'lautaro', nombre: 'Lautaro Molina', deGerencia: false }])
  })
  it('quien carga, si es de gerencia, al final y marcada como gerencia', () => {
    expect(quienesPudieronAtenderla(estudio, { id: 'director', nombre: 'Spira Clinic', esGerencia: true })).toEqual([
      { id: 'lautaro', nombre: 'Lautaro Molina', deGerencia: false },
      { id: 'director', nombre: 'Spira Clinic', deGerencia: true },
    ])
  })
  it('un estudio sin coordinadores deja a gerencia nombrarse (y queda propuesta: es la única opción)', () => {
    const lista = quienesPudieronAtenderla([], { id: 'director', nombre: 'Spira Clinic', esGerencia: true })
    expect(lista.map((p) => p.id)).toEqual(['director'])
    expect(atendioPorDefecto({ coordinator_id: null }, lista)).toBe('director')
  })
  it('quien carga sin gerencia no se suma; y si ya coordina el estudio, no se repite', () => {
    expect(quienesPudieronAtenderla(estudio, { id: 'otra', nombre: 'Otra', esGerencia: false })).toHaveLength(1)
    expect(quienesPudieronAtenderla(estudio, { id: 'lautaro', nombre: 'Lautaro Molina', esGerencia: true })).toEqual([
      { id: 'lautaro', nombre: 'Lautaro Molina', deGerencia: false },
    ])
  })
})
