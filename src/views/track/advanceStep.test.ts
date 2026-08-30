import { describe, it, expect } from 'vitest'
import { necesitaConfirmacion } from './advanceStep'

/**
 * La regla del avance de etapa desde el modal de la visita (2026-08-20). Se testea porque
 * fallan EN SILENCIO: si `necesitaConfirmacion` queda al revés, la pantalla se ve igual —lo único
 * que cambia es que un click firma un cambio de etapa sin avisar, o que molesta cien veces por día
 * en el recorrido normal—.
 *
 * Acá vivía además `fechaRealAlAvanzar`, retirada el 2026-08-30: escribía la fecha real al marcar
 * la LLEGADA y eso hacía saltar la etapa por encima del inicio de atención, salteándose el sello
 * de la 0102 (ver el comentario en `advanceStep.ts`). Se fue la función y se fueron sus tests.
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
