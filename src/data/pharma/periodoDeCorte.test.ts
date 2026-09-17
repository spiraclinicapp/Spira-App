import { describe, expect, it } from 'vitest'
import {
  corteDelMes, diasHastaElCorte, enCurso, esDiaDeCorteValido, periodoAnterior, periodoDe, periodoSiguiente,
  textoPeriodo, ultimoDiaDelMes,
} from './periodoDeCorte'
import { sumarDias } from './reposicionModel'

/**
 * El período de corte a corte (spec 2026-09-16, R4).
 *
 * Se testea porque un período mal armado no se ve: la pantalla dibuja igual de prolijo un «01/03 → 30/03»
 * que un «04/03 → 30/03», y lo retirado de esos tres días desaparece de la cuenta sin avisar.
 */

describe('corteDelMes', () => {
  it('recorta el día al último del mes', () => {
    expect(corteDelMes(2026, 2, 31)).toBe('2026-02-28')
    expect(corteDelMes(2028, 2, 30)).toBe('2028-02-29')
    expect(corteDelMes(2026, 4, 31)).toBe('2026-04-30')
    expect(corteDelMes(2026, 9, 28)).toBe('2026-09-28')
  })
  it('cruza el año hacia los dos lados', () => {
    expect(corteDelMes(2026, 13, 28)).toBe('2027-01-28')
    expect(corteDelMes(2026, 0, 28)).toBe('2025-12-28')
  })
})

describe('periodoDe (R4)', () => {
  it('corte 28: a mitad de septiembre va del 29/08 al 28/09', () => {
    expect(periodoDe('2026-09-16', 28)).toEqual({ desde: '2026-08-29', hasta: '2026-09-28' })
  })
  it('el día de corte todavía es del período que termina', () => {
    expect(periodoDe('2026-09-28', 28)).toEqual({ desde: '2026-08-29', hasta: '2026-09-28' })
  })
  it('el día siguiente al corte empieza el período nuevo', () => {
    expect(periodoDe('2026-09-29', 28)).toEqual({ desde: '2026-09-29', hasta: '2026-10-28' })
  })
  it('cruza el año', () => {
    expect(periodoDe('2026-12-29', 28)).toEqual({ desde: '2026-12-29', hasta: '2027-01-28' })
  })
  it('corte 31: febrero corta el 28, y el 29 en bisiesto', () => {
    expect(periodoDe('2027-02-15', 31)).toEqual({ desde: '2027-02-01', hasta: '2027-02-28' })
    expect(periodoDe('2027-03-01', 31)).toEqual({ desde: '2027-03-01', hasta: '2027-03-31' })
    expect(periodoDe('2028-02-29', 31)).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
  it('corte 30: el 31 de enero ya es del período de febrero', () => {
    expect(periodoDe('2027-01-31', 30)).toEqual({ desde: '2027-01-31', hasta: '2027-02-28' })
  })
  it('corte 1: el período va del 2 al 1', () => {
    expect(periodoDe('2026-09-01', 1)).toEqual({ desde: '2026-08-02', hasta: '2026-09-01' })
    expect(periodoDe('2026-09-02', 1)).toEqual({ desde: '2026-09-02', hasta: '2026-10-01' })
  })
})

describe('períodos seguidos', () => {
  it('corte 30: después de febrero viene del 01/03 al 30/03, y antes, del 31/12 al 30/01', () => {
    const feb = { desde: '2027-01-31', hasta: '2027-02-28' }
    expect(periodoSiguiente(feb, 30)).toEqual({ desde: '2027-03-01', hasta: '2027-03-30' })
    expect(periodoAnterior(feb, 30)).toEqual({ desde: '2026-12-31', hasta: '2027-01-30' })
  })
  for (const dia of [1, 15, 28, 29, 30, 31]) {
    it(`corte ${dia}: dos años de períodos sin huecos ni superposiciones`, () => {
      let p = periodoDe('2026-01-10', dia)
      for (let i = 0; i < 24; i++) {
        const sig = periodoSiguiente(p, dia)
        expect(sig.desde).toBe(sumarDias(p.hasta, 1))
        expect(periodoAnterior(sig, dia)).toEqual(p)
        const [y, m, d] = sig.hasta.split('-').map(Number)
        expect(d).toBe(Math.min(dia, ultimoDiaDelMes(y, m)))
        p = sig
      }
    })
  }
})

describe('ayudas de pantalla', () => {
  const p = { desde: '2026-08-29', hasta: '2026-09-28' }
  it('enCurso incluye los dos bordes', () => {
    expect(enCurso(p, '2026-08-29')).toBe(true)
    expect(enCurso(p, '2026-09-28')).toBe(true)
    expect(enCurso(p, '2026-09-29')).toBe(false)
  })
  it('días hasta el corte', () => {
    expect(diasHastaElCorte('2026-09-16', p)).toBe(12)
    expect(diasHastaElCorte('2026-09-28', p)).toBe(0)
  })
  it('texto del período', () => {
    expect(textoPeriodo(p)).toBe('29/08 → 28/09')
  })
  it('día de corte válido: entero del 1 al 31', () => {
    expect([1, 28, 31].every((n) => esDiaDeCorteValido(n))).toBe(true)
    expect([0, 32, 2.5, Number.NaN].some((n) => esDiaDeCorteValido(n))).toBe(false)
  })
})
