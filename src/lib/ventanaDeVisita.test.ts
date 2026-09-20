import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../data/visits'
import { ventanaDeVisita } from './visits'

/**
 * El renglón de abajo del cronograma del paciente: «Día 56 (±3 días)». Reemplazó al «Semana W8»
 * que estaba ahí hasta el 2026-09-20 (pedido del Director), cuando la semana se mudó al título.
 *
 * Se testea porque falla EN SILENCIO. El renglón se dibuja igual de prolijo si la ventana sale al
 * revés (restar en el orden equivocado da un negativo o un cero plausible), si una ventana
 * asimétrica se promedia a un ± —afirmando algo FALSO sobre una fecha límite, en una app
 * auditable— o si se lee la ventana de la definición del cuadro en vez de la de esta visita. Nada
 * de eso se ve mirando la pantalla: hay que comparar contra un calendario.
 *
 * Las fechas van EXPLÍCITAS, nunca derivadas de `todayISO()`: el CI corre en UTC y esta máquina en
 * AR, y un test de fechas anclado en "ahora" pasa acá y falla en la PR.
 */

/** Ventana simétrica de ±3 alrededor del 15/10, con la visita en el día 56 del estudio. */
const v = (campos: Partial<TrackVisitRow>) =>
  ({
    kind: 'programada', offset_days: 56, estimated_date: '2026-10-15',
    window_start: '2026-10-12', window_end: '2026-10-18', real_date: null,
    ...campos,
  }) as TrackVisitRow

describe('ventanaDeVisita', () => {
  it('dice el día y la ventana simétrica', () => {
    expect(ventanaDeVisita(v({}))).toBe('Día 56 (±3 días)')
  })

  it('el ± sale de las fechas de ESTA visita, no de un número fijo', () => {
    expect(ventanaDeVisita(v({ window_start: '2026-10-08', window_end: '2026-10-22' }))).toBe('Día 56 (±7 días)')
  })

  it('no confunde el orden de la resta: la ventana nunca es negativa', () => {
    const r = ventanaDeVisita(v({}))!
    expect(r).not.toContain('-3')
    expect(r).not.toContain('−3 días)')
    expect(r).toContain('±3')
  })

  it('una ventana asimétrica se dice como es, sin promediarla', () => {
    // Promediar 1 y 3 en "±2" diría que la visita puede hacerse dos días antes, y no puede.
    expect(ventanaDeVisita(v({ window_start: '2026-10-14', window_end: '2026-10-18' }))).toBe('Día 56 (−1/+3 días)')
  })

  it('concuerda el singular', () => {
    expect(ventanaDeVisita(v({ window_start: '2026-10-14', window_end: '2026-10-16' }))).toBe('Día 56 (±1 día)')
  })

  it('una ventana de cero no se escribe', () => {
    expect(ventanaDeVisita(v({ window_start: '2026-10-15', window_end: '2026-10-15' }))).toBe('Día 56')
  })

  it('acompaña los días negativos de las visitas pre-randomización', () => {
    expect(ventanaDeVisita(v({ offset_days: -28 }))).toBe('Día -28 (±3 días)')
  })

  it('una ventana que no contiene a su fecha estimada no escribe una cadena rota', () => {
    // Apareció verificando en el navegador: con la ventana desfasada de la estimada, un lado da
    // negativo y el renglón salía "(−31/+-25 días)". Peor que no decir nada.
    const r = ventanaDeVisita(v({ estimated_date: '2026-11-12' }))!
    expect(r).toBe('Día 56')
    expect(r).not.toContain('+-')
  })

  it('sin fechas de ventana muestra el día solo, no un ± inventado', () => {
    expect(ventanaDeVisita(v({ window_start: null, window_end: null }))).toBe('Día 56')
  })

  it('las sueltas no tienen día de estudio y no muestran nada', () => {
    expect(ventanaDeVisita(v({ kind: 'vnp', offset_days: null }))).toBeNull()
  })
})
