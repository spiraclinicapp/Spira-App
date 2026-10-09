import { describe, expect, it } from 'vitest'
import { GRAVEDAD } from '../views/alertSeverity'
import {
  agruparPorDia, diaDe, grupoDe, horaExacta, momentoDe, tiempoRelativo, TIPOS, tonoDeNoLeidas,
} from './notificaciones'
import type { Momento } from './notificaciones'

/**
 * Las reglas de tiempo del listado v2: en qué grupo cae una tarjeta, cómo se dice cuánto hace y qué
 * hora exacta se muestra.
 *
 * Fallan sin verse: una tarjeta en el grupo equivocado se ve tan prolija como en el correcto, y una
 * hora corrida tres horas —la trampa del huso— también. Por eso los instantes van en UTC explícito
 * y se afirman literales: la función usa el huso FIJO de Argentina, así que el resultado no puede
 * depender de la máquina. Si un día deja de ser así, estos tests caen en CI (que corre en UTC).
 */

const hoy = '2026-10-09'
// 16:40 de hoy en Argentina.
const ahora = Date.parse('2026-10-09T19:40:00Z')
const ts = (iso: string): Momento => momentoDe(iso)!
const fecha = (iso: string): Momento => ({ iso, soloFecha: true })

describe('diaDe', () => {
  it('el día de un timestamp es el argentino, no el UTC', () => {
    // 01:30 UTC del 10 son las 22:30 del 9 en Argentina.
    expect(diaDe(ts('2026-10-10T01:30:00Z'))).toBe('2026-10-09')
  })
  it('una fecha pura es esa fecha', () => {
    expect(diaDe(fecha('2026-10-03'))).toBe('2026-10-03')
  })
})

describe('grupoDe', () => {
  it('Hoy, Ayer, Esta semana (2 a 6) y Anteriores (7 o más), por día calendario', () => {
    expect(grupoDe(ts('2026-10-09T03:05:00Z'), hoy)).toBe('hoy') // 00:05 AR de hoy
    expect(grupoDe(ts('2026-10-09T02:55:00Z'), hoy)).toBe('ayer') // 23:55 AR de ayer
    expect(grupoDe(fecha('2026-10-07'), hoy)).toBe('semana')
    expect(grupoDe(fecha('2026-10-03'), hoy)).toBe('semana')
    expect(grupoDe(fecha('2026-10-02'), hoy)).toBe('anteriores')
  })
  it('sin momento va al fondo; en el futuro, a Hoy', () => {
    expect(grupoDe(null, hoy)).toBe('anteriores')
    expect(grupoDe(fecha('2026-10-12'), hoy)).toBe('hoy')
  })
})

describe('tiempoRelativo', () => {
  it('ahora, minutos, horas y días', () => {
    expect(tiempoRelativo(ts('2026-10-09T19:39:30Z'), ahora, hoy)).toBe('ahora')
    expect(tiempoRelativo(ts('2026-10-09T19:28:00Z'), ahora, hoy)).toBe('hace 12 min')
    expect(tiempoRelativo(ts('2026-10-09T14:05:00Z'), ahora, hoy)).toBe('hace 5 h')
    // Ayer a las 08:00: 32 h, pero el grupo dice «Ayer» y el relativo, «hace 1 d».
    expect(tiempoRelativo(ts('2026-10-08T11:00:00Z'), ahora, hoy)).toBe('hace 1 d')
    expect(tiempoRelativo(ts('2026-10-03T11:00:00Z'), ahora, hoy)).toBe('hace 6 d')
  })
  it('una fecha pura no tiene minutos', () => {
    expect(tiempoRelativo(fecha('2026-10-09'), ahora, hoy)).toBe('hoy')
    expect(tiempoRelativo(fecha('2026-10-07'), ahora, hoy)).toBe('hace 2 d')
  })
  it('un instante apenas en el futuro (relojes desfasados) dice ahora', () => {
    expect(tiempoRelativo(ts('2026-10-09T19:41:00Z'), ahora, hoy)).toBe('ahora')
  })
})

describe('horaExacta', () => {
  it('Hoy y Ayer, sólo la hora; el resto, con el día', () => {
    expect(horaExacta(ts('2026-10-09T19:40:00Z'), hoy)).toBe('16:40 h')
    expect(horaExacta(ts('2026-10-08T11:00:00Z'), hoy)).toBe('08:00 h')
    expect(horaExacta(ts('2026-10-03T11:00:00Z'), hoy)).toBe('3 oct, 08:00 h')
  })
  it('una fecha pura no inventa la hora', () => {
    expect(horaExacta(fecha('2026-10-03'), hoy)).toBe('3 oct')
    expect(horaExacta(fecha('2026-10-09'), hoy)).toBe('9 oct')
  })
  it('de otro año, con el año', () => {
    expect(horaExacta(fecha('2025-12-30'), hoy)).toBe('30 dic 2025')
  })
})

describe('agruparPorDia', () => {
  const m = (x: { m: Momento | null }) => x.m
  it('grupos en orden, sin los vacíos, y de lo más nuevo a lo más viejo', () => {
    const items = [
      { id: 'vieja', m: fecha('2026-09-01') },
      { id: 'hoy-temprano', m: ts('2026-10-09T11:00:00Z') },
      { id: 'sin', m: null },
      { id: 'hoy-tarde', m: ts('2026-10-09T18:00:00Z') },
      { id: 'semana', m: fecha('2026-10-05') },
    ]
    const g = agruparPorDia(items, m, hoy)
    expect(g.map((x) => x.rotulo)).toEqual(['Hoy', 'Esta semana', 'Anteriores'])
    expect(g[0].items.map((x) => x.id)).toEqual(['hoy-tarde', 'hoy-temprano'])
    expect(g[2].items.map((x) => x.id)).toEqual(['vieja', 'sin'])
  })
  it('una fecha pura cuenta como el final de su día: queda arriba de los timestamps de ese día', () => {
    const g = agruparPorDia([{ id: 'ts', m: ts('2026-10-09T18:00:00Z') }, { id: 'f', m: fecha('2026-10-09') }], m, hoy)
    expect(g[0].items.map((x) => x.id)).toEqual(['f', 'ts'])
  })
})

describe('tonoDeNoLeidas', () => {
  it('nada sin leer, sin punto', () => {
    expect(tonoDeNoLeidas([])).toBeNull()
  })
  it('manda lo más grave entre lo no leído', () => {
    expect(tonoDeNoLeidas(['dispensacion', 'reporte', GRAVEDAD[0]])).toBe(TIPOS[GRAVEDAD[0]].tinta)
    expect(tonoDeNoLeidas(['dispensacion', 'reporte'])).toBe(TIPOS.reporte.tinta)
    expect(tonoDeNoLeidas(['dispensacion'])).toBe(TIPOS.dispensacion.tinta)
  })
  it('todos los tipos tienen ícono y tinta (un undefined acá apaga el topbar)', () => {
    for (const t of Object.values(TIPOS)) {
      expect(t.icono).toBeTruthy()
      expect(t.tinta).toBeTruthy()
    }
  })
})
