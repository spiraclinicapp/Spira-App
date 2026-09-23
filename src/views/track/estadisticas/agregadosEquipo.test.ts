import { describe, expect, it } from 'vitest'
import type { VisitaEquipo } from '../../../data/trackReports'
import {
  cargaMensual, contarFiltros, FILTROS_VACIOS, filasDetalle, filtrarDetalle, opcionesDetalle,
  proyeccion, rangoProyeccion, resumenDetalle, SIN_ASIGNAR, tiemposPorCoordinadora, tonoDesvio,
} from './agregadosEquipo'
import type { FiltrosDetalle } from './agregadosEquipo'

/* Qué falla en silencio acá: a quién se le cuenta una visita. Si las pendientes sin coordinadora se
   descartaran, "Pendientes abiertos" se vería perfecto y sin las vencidas; si el orden pusiera las
   visitas sin dato como "0 min", la mayor espera quedaría escondida al fondo. */

let seq = 0
function v(over: Partial<VisitaEquipo> = {}): VisitaEquipo {
  seq += 1
  return {
    id: `v${seq}`,
    protocol_id: 'p1', protocol_code: 'SCH-1', protocol_name: 'Uno',
    patient_id: `pa${seq}`, patient_name: `Paciente ${seq}`, patient_code: `0${seq}`,
    kind: 'programada', role: 'comun', visit_name: 'V4 · Semana 12',
    real_date: null, estimated_date: '2026-09-10', window_start: null, window_end: null,
    no_show_at: null, computed_status: 'completa',
    coordinator_id: 'c1', coordinator_name: 'Carla',
    arrived_at: null, attended_at: null, ready_at: null, left_at: null,
    arrived_by_name: null, ready_by_name: null, left_by_name: null,
    ...over,
  }
}

/** Visita atendida con los cuatro sellos: espera `e`, atención `a`, estadía `e + a + 10`. */
function atendida(dia: string, e: number, a: number, over: Partial<VisitaEquipo> = {}): VisitaEquipo {
  const base = Date.parse(`${dia}T12:00:00Z`)
  const iso = (min: number) => new Date(base + min * 60_000).toISOString()
  return v({ real_date: dia, estimated_date: dia, arrived_at: iso(0), attended_at: iso(e), ready_at: iso(e + a), left_at: iso(e + a + 10), ...over })
}

const SEP = { desde: '2026-09-01', hasta: '2026-09-30' }

describe('cargaMensual', () => {
  it('cuenta atendidas por quien las atendió y deja "Sin asignar" al final', () => {
    const r = cargaMensual([
      atendida('2026-09-02', 10, 30, { coordinator_id: 'c2', coordinator_name: 'Mariana' }),
      atendida('2026-09-02', 10, 30),
      atendida('2026-09-03', 10, 30),
      v({ estimated_date: '2026-09-05', computed_status: 'ventana_vencida', coordinator_id: null, coordinator_name: null }),
    ], SEP)
    expect(r.filas.map((f) => f.nombre)).toEqual(['Carla', 'Mariana', 'Sin asignar'])
    expect(r.coordinadoras).toBe(2)
  })

  it('una pendiente sin coordinadora NO se pierde: va a "Sin asignar"', () => {
    const r = cargaMensual([v({ estimated_date: '2026-09-05', computed_status: 'ventana_vencida', coordinator_id: null })], SEP)
    const sin = r.filas.find((f) => f.clave === SIN_ASIGNAR)
    expect(sin).toMatchObject({ visitas: 0, pendientes: 1 })
    expect(r.totalPendientes).toBe(1)
  })

  it('una pendiente con coordinadora asignada se le cuenta a ella', () => {
    const r = cargaMensual([v({ estimated_date: '2026-09-05', computed_status: 'por_reprogramar' })], SEP)
    expect(r.filas[0]).toMatchObject({ nombre: 'Carla', visitas: 0, pendientes: 1 })
  })

  it('visitas por día es sobre días CON visitas, y el pico desempata por el primer día', () => {
    const r = cargaMensual([atendida('2026-09-02', 5, 5), atendida('2026-09-02', 5, 5), atendida('2026-09-09', 5, 5), atendida('2026-09-09', 5, 5), atendida('2026-09-10', 5, 5)], SEP)
    expect(r.filas[0].porDia).toBeCloseTo(5 / 3)
    expect(r.filas[0].pico).toEqual({ fecha: '2026-09-02', visitas: 2 })
  })

  it('la serie tiene una cifra por día del mes', () => {
    const r = cargaMensual([atendida('2026-09-03', 5, 5)], { desde: '2026-09-01', hasta: '2026-09-05' })
    expect(r.dias).toHaveLength(5)
    expect(r.filas[0].serie).toEqual([0, 0, 1, 0, 0])
  })

  it('las atendidas fuera del mes no cuentan', () => {
    const r = cargaMensual([atendida('2026-08-31', 5, 5)], SEP)
    expect(r.totalVisitas).toBe(0)
  })
})

describe('tiemposPorCoordinadora', () => {
  it('promedia por persona y compara la atención contra el promedio general', () => {
    const r = tiemposPorCoordinadora([
      atendida('2026-09-02', 10, 20),
      atendida('2026-09-02', 10, 60, { coordinator_id: 'c2', coordinator_name: 'Mariana' }),
    ], SEP)
    expect(r.atencionProm).toBe(40)
    const carla = r.filas.find((f) => f.nombre === 'Carla')!
    expect(carla.atencionProm).toBe(20)
    expect(carla.desvioPct).toBe(-50)
    expect(r.filas.find((f) => f.nombre === 'Mariana')!.desvioPct).toBe(50)
  })

  it('desglosa por tipo de visita', () => {
    const r = tiemposPorCoordinadora([
      atendida('2026-09-02', 10, 60, { role: 'screening' }),
      atendida('2026-09-03', 10, 20),
    ], SEP)
    expect(r.filas[0].porTipo.map((t) => [t.label, t.atencionProm])).toEqual([['Screening', 60], ['Visita de tratamiento', 20]])
  })

  it('sin atención medida, el desvío es null y no un cero', () => {
    const r = tiemposPorCoordinadora([v({ real_date: '2026-09-02' })], SEP)
    expect(r.filas[0].desvioPct).toBeNull()
    expect(r.filas[0].coberturaAtencion).toBe(0)
  })
})

describe('tonoDesvio', () => {
  it('parecido hasta 10 %, se aparta hasta 25 %, se aparta mucho después — para los dos lados', () => {
    expect(tonoDesvio(10)).toBe('ok')
    expect(tonoDesvio(-10)).toBe('ok')
    expect(tonoDesvio(11)).toBe('medio')
    expect(tonoDesvio(-25)).toBe('medio')
    expect(tonoDesvio(26)).toBe('alto')
  })
})

describe('detalle visita por visita', () => {
  const filas = filasDetalle([
    atendida('2026-09-02', 15, 30, { patient_name: 'Rocío Benítez' }),
    atendida('2026-09-03', 25, 30, { patient_name: 'Ana Díaz', protocol_code: 'SCH-2', coordinator_id: 'c2', coordinator_name: 'Mariana' }),
    atendida('2026-09-04', 45, 30, { patient_name: 'Zoe Luna', role: 'screening' }),
    v({ real_date: '2026-09-05', patient_name: 'Beto Sin Sellos', coordinator_id: null }),
    v({ real_date: null, estimated_date: '2026-09-06', patient_name: 'Agendada' }),
  ], SEP)
  const f = (over: Partial<FiltrosDetalle>) => ({ ...FILTROS_VACIOS, ...over })
  const nombres = (xs: ReturnType<typeof filtrarDetalle>) => xs.map((x) => x.v.patient_name)

  it('sólo trae visitas atendidas del período', () => {
    expect(filas).toHaveLength(4)
  })

  it('el buscador no distingue tildes ni mayúsculas', () => {
    expect(nombres(filtrarDetalle(filas, f({ q: 'ROCIO' })))).toEqual(['Rocío Benítez'])
  })

  it('"Sin asignar" es un valor filtrable', () => {
    expect(nombres(filtrarDetalle(filas, f({ coord: SIN_ASIGNAR })))).toEqual(['Beto Sin Sellos'])
  })

  it('los tramos de espera; una visita sin espera medida no cae en ninguno', () => {
    expect(nombres(filtrarDetalle(filas, f({ esp: 'a' })))).toEqual(['Rocío Benítez'])
    expect(nombres(filtrarDetalle(filas, f({ esp: 'b' })))).toEqual(['Ana Díaz'])
    expect(nombres(filtrarDetalle(filas, f({ esp: 'c' })))).toEqual(['Zoe Luna'])
  })

  it('los filtros son Y entre sí', () => {
    expect(nombres(filtrarDetalle(filas, f({ est: 'SCH-1', tipo: 'screening' })))).toEqual(['Zoe Luna'])
  })

  it('"Mayor espera" deja las visitas sin dato al final, no como cero minutos', () => {
    expect(nombres(filtrarDetalle(filas, f({ orden: 'esp' })))).toEqual(['Zoe Luna', 'Ana Díaz', 'Rocío Benítez', 'Beto Sin Sellos'])
  })

  it('"Más recientes" y "Paciente (A–Z)"', () => {
    expect(nombres(filtrarDetalle(filas, f({})))[0]).toBe('Beto Sin Sellos')
    expect(nombres(filtrarDetalle(filas, f({ orden: 'pac' })))).toEqual(['Ana Díaz', 'Beto Sin Sellos', 'Rocío Benítez', 'Zoe Luna'])
  })

  it('el orden no cuenta como filtro', () => {
    expect(contarFiltros(f({ orden: 'pac' }))).toBe(0)
    expect(contarFiltros(f({ q: '  ', est: 'SCH-1' }))).toBe(1)
  })

  it('el pie se calcula sobre lo filtrado', () => {
    expect(resumenDetalle(filtrarDetalle(filas, f({ est: 'SCH-2' })))).toEqual({ visitas: 1, espera: 25, atencion: 30, estadia: 65 })
  })

  it('las opciones salen del período entero, con "Sin asignar" al final', () => {
    const o = opcionesDetalle(filas)
    expect(o.coordinadoras.map((c) => c.label)).toEqual(['Carla', 'Mariana', 'Sin asignar'])
    expect(o.estudios.map((e) => e.value)).toEqual(['SCH-1', 'SCH-2'])
    expect(o.fechas[0]).toBe('2026-09-05')
  })
})

describe('proyeccion', () => {
  it('son las cuatro semanas que empiezan mañana', () => {
    expect(rangoProyeccion('2026-09-23')).toEqual({ desde: '2026-09-24', hasta: '2026-10-21' })
  })

  it('cuenta sólo lo agendado: sin atender y sin "no vino"', () => {
    const r = proyeccion([
      v({ estimated_date: '2026-09-24' }),
      v({ estimated_date: '2026-09-30' }),
      v({ estimated_date: '2026-10-01' }),
      v({ estimated_date: '2026-09-25', real_date: '2026-09-25' }),
      v({ estimated_date: '2026-09-25', no_show_at: '2026-09-25T10:00:00Z' }),
      v({ estimated_date: '2026-10-22' }),
    ], '2026-09-23')
    expect(r.semanas.map((s) => s.visitas)).toEqual([2, 1, 0, 0])
    expect(r.total).toBe(3)
  })

  it('los tres estudios con más visitas, y el resto junto', () => {
    const e = (code: string, n: number) => Array.from({ length: n }, () => v({ protocol_code: code, protocol_name: code, estimated_date: '2026-09-24' }))
    const r = proyeccion([...e('A', 4), ...e('B', 3), ...e('C', 2), ...e('D', 1), ...e('E', 1)], '2026-09-23')
    expect(r.estudios.map((x) => x.protocolCode)).toEqual(['A', 'B', 'C'])
    expect(r.otros).toEqual({ estudios: 2, visitas: 2 })
  })
})
