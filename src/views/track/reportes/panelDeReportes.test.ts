// Reglas del panel «Reportes pendientes» del modal de visita (plan `docs/plan-resumen-de-visita.md`).
// Todo lo de acá falla EN SILENCIO: el panel se dibuja igual de prolijo con el tag equivocado, con
// una sublínea que dice «al día» sobre un reporte que falta, o escondiéndose entero cuando la
// consulta falló. El tag y los plazos salen de las mismas funciones que el tablero (`estados.ts`).
//
// ⚠️ LAS FECHAS NO SE ASERTAN CONTRA EL RELOJ DE LA MÁQUINA: el CI corre en UTC y acá es AR (−3), y
// `formatTimeAR` usa la hora local. Se testea la REGLA —«hoy» contra la fecha, que se decide por día
// argentino— con timestamps en la forma que manda PostgREST (`+00:00`), no en `-03:00`.
import { describe, expect, it } from 'vitest'
import {
  badgePorCargar, constanciaDeReporte, estadoPanelReportes, sublineaProcedimiento, tagDeReporte,
} from './panelDeReportes'

const AHORA = Date.parse('2026-09-20T12:00:00+00:00')

/** Una fila de `v_protocol_report_status`, con lo que estas reglas miran. */
const fila = (p: Partial<{ completed: boolean; stage: string; due_at: string | null; eta_hours: number | null; updated_at: string | null }> = {}) => ({
  completed: true, stage: 'pendiente', due_at: null, eta_hours: 48, updated_at: null, ...p,
})

describe('tagDeReporte', () => {
  it('sin el procedimiento realizado: «Sin empezar», neutro', () => {
    expect(tagDeReporte(fila({ completed: false }), AHORA)).toMatchObject({ texto: 'Sin empezar', tono: 'neutro' })
  })

  it('realizado y dentro del plazo: «Pendiente»', () => {
    expect(tagDeReporte(fila({ due_at: '2026-09-22T12:00:00+00:00' }), AHORA)).toMatchObject({ texto: 'Pendiente', tono: 'pendiente' })
  })

  it('realizado con el plazo pasado: «Vencido»', () => {
    expect(tagDeReporte(fila({ due_at: '2026-09-20T06:00:00+00:00' }), AHORA)).toMatchObject({ texto: 'Vencido', tono: 'vencido' })
  })

  it('el borde exacto del plazo todavía NO está vencido', () => {
    expect(tagDeReporte(fila({ due_at: '2026-09-20T12:00:00+00:00' }), AHORA).texto).toBe('Pendiente')
  })

  it('un reporte sin plazo no vence nunca', () => {
    expect(tagDeReporte(fila({ due_at: null, eta_hours: null }), AHORA).texto).toBe('Pendiente')
  })

  it('descargado y evolucionado tienen su propio tag, y el plazo ya no corre', () => {
    expect(tagDeReporte(fila({ stage: 'descargado', due_at: '2026-01-01T00:00:00+00:00' }), AHORA)).toMatchObject({ texto: 'Descargado', tono: 'descargado' })
    expect(tagDeReporte(fila({ stage: 'evolucionado' }), AHORA)).toMatchObject({ texto: 'Evolucionado', tono: 'evolucionado' })
  })

  it('una etapa que el front no conoce se trata como pendiente, no rompe el panel', () => {
    expect(tagDeReporte(fila({ stage: 'archivado' }), AHORA).texto).toBe('Pendiente')
  })
})

describe('sublineaProcedimiento', () => {
  const r = (completed: boolean, stage: string) => ({ completed, stage })

  it('sin tildar dice el TOTAL de reportes, nunca «al día»', () => {
    expect(sublineaProcedimiento(false, [r(false, 'pendiente'), r(false, 'pendiente')])).toBe('Sin realizar · 2 reportes')
    expect(sublineaProcedimiento(false, [r(false, 'pendiente')])).toBe('Sin realizar · 1 reporte')
  })

  it('tildado, cuenta lo que falta', () => {
    expect(sublineaProcedimiento(true, [r(true, 'pendiente'), r(true, 'evolucionado')])).toBe('Realizado · 1 reporte pendiente')
    expect(sublineaProcedimiento(true, [r(true, 'pendiente'), r(true, 'descargado')])).toBe('Realizado · 2 reportes pendientes')
  })

  it('tildado y todo evolucionado: «reportes al día»', () => {
    expect(sublineaProcedimiento(true, [r(true, 'evolucionado')])).toBe('Realizado · reportes al día')
  })
})

describe('badgePorCargar', () => {
  it('cuenta lo que falta, y en cero dice «Al día» en neutro', () => {
    expect(badgePorCargar(2)).toEqual({ texto: '2 por cargar', pendiente: true })
    expect(badgePorCargar(1)).toEqual({ texto: '1 por cargar', pendiente: true })
    expect(badgePorCargar(0)).toEqual({ texto: 'Al día', pendiente: false })
  })
})

describe('constanciaDeReporte', () => {
  it('pendiente: dice el plazo', () => {
    expect(constanciaDeReporte(fila({ due_at: '2026-09-22T12:00:00+00:00' }), AHORA)).toMatchObject({ texto: 'Vence en 2 días', overdue: false })
    expect(constanciaDeReporte(fila({ due_at: '2026-09-20T06:00:00+00:00' }), AHORA)).toMatchObject({ texto: 'Vencido hace 6 h', overdue: true })
  })

  it('sin el procedimiento realizado no dice nada: el aviso ya lo explica', () => {
    expect(constanciaDeReporte(fila({ completed: false }), AHORA).texto).toBe('')
  })

  it('una fila recién tildada, sin plazo todavía, calla en vez de decir «Sin plazo»', () => {
    // El tilde es optimista: `completed` ya es true en pantalla, pero `due_at` lo calcula el
    // servidor y llega un render después. Decir «Sin plazo» ahí sería afirmar algo falso.
    expect(constanciaDeReporte(fila({ due_at: null, eta_hours: 48 }), AHORA).texto).toBe('')
  })

  it('un reporte que de verdad no vence lo dice', () => {
    expect(constanciaDeReporte(fila({ due_at: null, eta_hours: null }), AHORA).texto).toBe('Sin plazo')
  })

  it('movido HOY: la etapa y la hora, sin fecha', () => {
    const c = constanciaDeReporte(fila({ stage: 'descargado', updated_at: '2026-09-20T15:00:00+00:00' }), AHORA)
    expect(c.texto).toMatch(/^Descargado hoy \d{2}:\d{2}$/)
  })

  it('«hoy» se decide por DÍA ARGENTINO, no por UTC', () => {
    // 2026-09-21T01:30Z son las 22:30 del 20 en Argentina, y el movimiento fue a las 20:00 del 20.
    // Comparando en UTC caerían en días distintos y diría «20 sep» en vez de «hoy».
    const ahoraNoche = Date.parse('2026-09-21T01:30:00+00:00')
    const c = constanciaDeReporte(fila({ stage: 'descargado', updated_at: '2026-09-20T23:00:00+00:00' }), ahoraNoche)
    expect(c.texto).toMatch(/^Descargado hoy /)
  })

  it('movido otro día: la fecha, sin hora', () => {
    const c = constanciaDeReporte(fila({ stage: 'evolucionado', updated_at: '2026-09-16T18:00:00+00:00' }), AHORA)
    expect(c.texto).toBe('Evolucionado 16 sep')
  })

  it('nunca nombra a nadie: el autor del último movimiento puede ser quien RETROCEDIÓ el reporte', () => {
    const c = constanciaDeReporte(fila({ stage: 'descargado', updated_at: '2026-09-16T18:00:00+00:00' }), AHORA)
    expect(c.texto).toBe('Descargado 16 sep')
  })

  it('movido sin fecha registrada: sólo la etapa', () => {
    expect(constanciaDeReporte(fila({ stage: 'descargado', updated_at: null }), AHORA).texto).toBe('Descargado')
  })
})

describe('estadoPanelReportes', () => {
  const filas = [fila()]

  it('mientras carga y todavía no hay filas, avisa', () => {
    expect(estadoPanelReportes({ loading: true, error: null, rows: null })).toBe('cargando')
  })

  it('un ERROR se muestra: esconder el panel diría «esta visita no tiene reportes», que es mentira', () => {
    expect(estadoPanelReportes({ loading: false, error: 'falló', rows: null })).toBe('error')
    expect(estadoPanelReportes({ loading: false, error: 'falló', rows: [] })).toBe('error')
  })

  it('sin reportes, el panel no se dibuja', () => {
    expect(estadoPanelReportes({ loading: false, error: null, rows: [] })).toBe('oculto')
  })

  it('con reportes, la lista', () => {
    expect(estadoPanelReportes({ loading: false, error: null, rows: filas })).toBe('lista')
  })

  it('mientras refresca con filas viejas sigue mostrando la lista, no vuelve a «cargando»', () => {
    expect(estadoPanelReportes({ loading: true, error: null, rows: filas })).toBe('lista')
  })
})
