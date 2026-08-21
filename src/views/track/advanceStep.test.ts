import { describe, it, expect } from 'vitest'
import { necesitaConfirmacion, fechaRealAlAvanzar } from './advanceStep'

/**
 * Las dos reglas del avance de etapa desde el modal de la visita (2026-08-20). Se testean porque
 * fallan EN SILENCIO: si `necesitaConfirmacion` queda al revés, la pantalla se ve igual —lo único
 * que cambia es que un click firma un cambio de etapa sin avisar, o que molesta cien veces por día
 * en el recorrido normal—; y si `fechaRealAlAvanzar` queda al revés, se pisa una fecha clínica ya
 * cargada, que es peor todavía y nadie lo ve hasta el cierre de período.
 */
const HOY = '2026-08-20'

describe('necesitaConfirmacion', () => {
  it('no interrumpe el recorrido normal: la visita de hoy avanza de un click', () => {
    expect(necesitaConfirmacion(HOY, HOY)).toBe(false)
  })

  it('confirma si la visita es de otro día', () => {
    expect(necesitaConfirmacion('2026-07-03', HOY)).toBe(true)
  })

  it('confirma si la visita todavía no tiene fecha real', () => {
    expect(necesitaConfirmacion(null, HOY)).toBe(true)
  })

  it('confirma también las futuras (una visita agendada para mañana no es la de hoy)', () => {
    expect(necesitaConfirmacion('2026-08-21', HOY)).toBe(true)
  })
})

describe('fechaRealAlAvanzar', () => {
  it('sin fecha real: la escribe con la de hoy', () => {
    expect(fechaRealAlAvanzar(null, 'fin_atencion', HOY)).toBe(HOY)
    expect(fechaRealAlAvanzar(null, 'concurrio_al_centro', HOY)).toBe(HOY)
  })

  it('NUNCA pisa una fecha real ya cargada', () => {
    expect(fechaRealAlAvanzar('2026-07-03', 'fin_atencion', HOY)).toBeNull()
    expect(fechaRealAlAvanzar('2026-07-03', 'inicio_atencion', HOY)).toBeNull()
    expect(fechaRealAlAvanzar('2026-07-03', 'concurrio_al_centro', HOY)).toBeNull()
  })

  it('no se adelanta a "iniciar atención", que es el avance que ya fecha la visita', () => {
    expect(fechaRealAlAvanzar(null, 'inicio_atencion', HOY)).toBeNull()
  })
})
