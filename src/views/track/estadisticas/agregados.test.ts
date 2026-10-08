import { describe, expect, it } from 'vitest'
import { formatMinutosLargo, porEstudio, porVisita } from './agregados'
import type { VisitaEstadistica } from './agregados'
import type { Rango } from './rango'

let seq = 0
function fila(over: Partial<VisitaEstadistica> = {}): VisitaEstadistica {
  seq += 1
  return {
    id: `v${seq}`,
    protocol_id: 'p1',
    protocol_code: 'SCH-0001',
    protocol_name: 'Estudio Uno',
    kind: 'programada',
    role: 'comun',
    visit_name: 'V4 · Semana 12',
    real_date: null,
    estimated_date: null,
    window_start: null,
    window_end: null,
    no_show_at: null,
    computed_status: 'completa',
    arrived_at: null,
    attended_at: null,
    ready_at: null,
    left_at: null,
    ...over,
  }
}

const RANGO: Rango = { desde: '2026-09-01', hasta: '2026-09-30' }

describe('porEstudio', () => {
  it('cuenta una visita atendida por su real_date', () => {
    const r = porEstudio([fila({ real_date: '2026-09-15' })], RANGO)
    expect(r.totalVisitas).toBe(1)
  })

  it('cuenta una visita no atendida por su estimated_date (agendada o vencida sin atender)', () => {
    const r = porEstudio([fila({ real_date: null, estimated_date: '2026-09-20' })], RANGO)
    expect(r.totalVisitas).toBe(1)
  })

  it('excluye una visita cuya fecha (real o estimada) cae fuera del rango', () => {
    const r = porEstudio([fila({ real_date: '2026-08-31' }), fila({ estimated_date: '2026-10-01' })], RANGO)
    expect(r.totalVisitas).toBe(0)
  })

  it('excluye una visita sin ninguna fecha', () => {
    const r = porEstudio([fila({ real_date: null, estimated_date: null })], RANGO)
    expect(r.totalVisitas).toBe(0)
  })

  it('cuenta perdida por no_show_at, aunque el estado calculado no sea ventana_vencida', () => {
    const r = porEstudio([fila({ real_date: '2026-09-10', no_show_at: '2026-09-10T10:00:00Z', computed_status: 'por_reprogramar' })], RANGO)
    expect(r.totalPerdidas).toBe(1)
  })

  it('cuenta perdida por ventana_vencida aunque no_show_at sea null', () => {
    const r = porEstudio([fila({ estimated_date: '2026-09-10', computed_status: 'ventana_vencida' })], RANGO)
    expect(r.totalPerdidas).toBe(1)
  })

  it('no cuenta perdida una visita completa sin marca de ausencia', () => {
    const r = porEstudio([fila({ real_date: '2026-09-10', computed_status: 'completa' })], RANGO)
    expect(r.totalPerdidas).toBe(0)
  })

  it('en ventana: sólo mide visitas con ventana (programadas atendidas) y excluye las sueltas del cálculo', () => {
    const rows = [
      fila({ real_date: '2026-09-05', window_start: '2026-09-01', window_end: '2026-09-10' }), // en ventana
      fila({ real_date: '2026-09-15', window_start: '2026-09-01', window_end: '2026-09-10' }), // fuera de ventana
      fila({ kind: 'vnp', role: null, real_date: '2026-09-05', window_start: null, window_end: null }), // suelta, sin ventana
    ]
    const r = porEstudio(rows, RANGO)
    expect(r.totalEnVentana).toEqual({ si: 1, de: 2 })
  })

  it('pendientes: las tres clases de alerta cuentan, otros estados no', () => {
    const rows = [
      fila({ estimated_date: '2026-09-05', computed_status: 'ventana_vencida' }),
      fila({ real_date: '2026-09-05', computed_status: 'item_vencido' }),
      fila({ estimated_date: '2026-09-05', computed_status: 'por_reprogramar' }),
      fila({ real_date: '2026-09-05', computed_status: 'completa' }),
      fila({ estimated_date: '2026-09-05', computed_status: 'proxima' }),
    ]
    const r = porEstudio(rows, RANGO)
    expect(r.totalPendientes).toBe(3)
  })

  it('agrupa por protocolo y ordena por más visitas primero', () => {
    const rows = [
      fila({ protocol_id: 'p1', protocol_code: 'SCH-1', real_date: '2026-09-05' }),
      fila({ protocol_id: 'p2', protocol_code: 'SCH-2', real_date: '2026-09-05' }),
      fila({ protocol_id: 'p2', protocol_code: 'SCH-2', real_date: '2026-09-06' }),
    ]
    const r = porEstudio(rows, RANGO)
    expect(r.filas.map((f) => f.protocolCode)).toEqual(['SCH-2', 'SCH-1'])
    expect(r.filas[0].visitas).toBe(2)
  })

  it('sin filas, devuelve resultado vacío sin dividir por cero', () => {
    const r = porEstudio([], RANGO)
    expect(r).toEqual({
      filas: [],
      totalVisitas: 0,
      totalPerdidas: 0,
      totalEnVentana: { si: 0, de: 0 },
      totalPendientes: 0,
    })
  })
})

describe('porVisita', () => {
  const atendida = (over: Partial<VisitaEstadistica>) =>
    fila({ real_date: '2026-09-10', attended_at: '2026-09-10T10:00:00Z', ready_at: '2026-09-10T10:30:00Z', ...over })

  it('sólo considera visitas ATENDIDAS del período (ignora agendadas a futuro)', () => {
    const rows = [
      fila({ real_date: '2026-09-10', arrived_at: '2026-09-10T10:00:00Z' }),
      fila({ real_date: null, estimated_date: '2026-09-20' }), // agendada, sin atender
    ]
    const r = porVisita(rows, RANGO)
    expect(r.visitas).toBe(1)
  })

  it('calcula espera/atención/estadía sólo cuando están los dos sellos que hacen falta', () => {
    const rows = [
      fila({
        real_date: '2026-09-10',
        arrived_at: '2026-09-10T10:00:00Z',
        attended_at: '2026-09-10T10:20:00Z',
        ready_at: '2026-09-10T11:00:00Z',
        left_at: '2026-09-10T11:10:00Z',
      }),
    ]
    const r = porVisita(rows, RANGO)
    expect(r.esperaProm).toBe(20)
    expect(r.atencionProm).toBe(40)
    expect(r.estadiaProm).toBe(70)
    expect(r.estadiaMax).toBe(70)
  })

  it('una visita sin arrived_at no aporta a espera ni estadía, y la cobertura lo cuenta', () => {
    const r = porVisita([atendida({ arrived_at: null, left_at: null })], RANGO)
    expect(r.esperaProm).toBeNull()
    expect(r.atencionProm).toBe(30)
    expect(r.filas[0].porVisita[0].cobertura).toEqual({ espera: 0, atencion: 1, estadia: 0 })
  })

  it('una atención de menos de 5 min no se promedia (horarios marcados juntos al cargar después)', () => {
    const rows = [
      atendida({ ready_at: '2026-09-10T10:00:00Z' }), // 0 min
      atendida({ ready_at: '2026-09-10T10:04:00Z' }), // 4 min
      atendida({ ready_at: '2026-09-10T10:05:00Z' }), // 5 min: entra
      atendida({ ready_at: '2026-09-10T11:27:00Z' }), // 87 min
    ]
    const v = porVisita(rows, RANGO).filas[0].porVisita[0]
    expect(v.visitas).toBe(4)
    expect(v.atencionProm).toBe(46) // (5 + 87) / 2
    expect(v.cobertura.atencion).toBe(2)
  })

  it('promedia la MISMA visita del cuadro dentro de un estudio, y no la mezcla con la de otro estudio', () => {
    const rows = [
      atendida({ protocol_id: 'p1', protocol_code: 'ACT', visit_name: 'V5', ready_at: '2026-09-10T10:20:00Z' }),
      atendida({ protocol_id: 'p1', protocol_code: 'ACT', visit_name: 'V5', ready_at: '2026-09-10T10:40:00Z' }),
      atendida({ protocol_id: 'p2', protocol_code: 'LTS', visit_name: 'V5', ready_at: '2026-09-10T11:30:00Z' }),
    ]
    const r = porVisita(rows, RANGO)
    const act = r.filas.find((f) => f.protocolCode === 'ACT')!
    expect(act.porVisita.map((v) => [v.label, v.visitas, v.atencionProm])).toEqual([['V5', 2, 30]])
    expect(r.filas.find((f) => f.protocolCode === 'LTS')!.porVisita[0].atencionProm).toBe(90)
  })

  it('un retest de la V5 no se promedia con la V5', () => {
    const rows = [
      atendida({ visit_name: 'V5' }),
      atendida({ kind: 'retest', role: null, visit_name: 'V5' }),
    ]
    const r = porVisita(rows, RANGO)
    expect(r.filas[0].porVisita.map((v) => v.label)).toEqual(['V5', 'Retest · V5'])
  })

  it('ordena por el recorrido: screening, randomización, el cuadro por número natural, las sueltas al final', () => {
    const rows = [
      atendida({ kind: 'vnp', role: null, visit_name: null }),
      atendida({ visit_name: 'V10 · Semana 40' }),
      atendida({ visit_name: 'V2 · Semana 4' }),
      atendida({ role: 'randomizacion', visit_name: 'V1 · Basal' }),
      atendida({ role: 'screening', visit_name: 'V0 · Selección' }),
    ]
    const r = porVisita(rows, RANGO)
    expect(r.filas[0].porVisita.map((v) => v.label)).toEqual([
      'V0 · Selección', 'V1 · Basal', 'V2 · Semana 4', 'V10 · Semana 40', 'VNP',
    ])
  })

  it('ordena los estudios por más visitas primero, con el resumen de cada uno', () => {
    const rows = [
      atendida({ protocol_id: 'p1', protocol_code: 'SCH-1' }),
      atendida({ protocol_id: 'p2', protocol_code: 'SCH-2', visit_name: 'V1' }),
      atendida({ protocol_id: 'p2', protocol_code: 'SCH-2', visit_name: 'V2' }),
    ]
    const r = porVisita(rows, RANGO)
    expect(r.filas.map((f) => [f.protocolCode, f.visitas])).toEqual([['SCH-2', 2], ['SCH-1', 1]])
  })

  it('sin filas, devuelve resultado vacío sin dividir por cero', () => {
    const r = porVisita([], RANGO)
    expect(r.filas).toEqual([])
    expect(r.visitas).toBe(0)
    expect(r.esperaProm).toBeNull()
  })
})

describe('formatMinutosLargo', () => {
  it('minutos solos por debajo de una hora', () => {
    expect(formatMinutosLargo(38)).toBe('38 min')
  })

  it('horas y minutos, con el minuto siempre a dos dígitos', () => {
    expect(formatMinutosLargo(72)).toBe('1 h 12 min')
    expect(formatMinutosLargo(65)).toBe('1 h 05 min')
  })

  it('exactamente una hora no imprime "00 min" como si fuera basura, lo dice tal cual', () => {
    expect(formatMinutosLargo(60)).toBe('1 h 00 min')
  })

  it('null es honesto: guion, no un cero inventado', () => {
    expect(formatMinutosLargo(null)).toBe('—')
  })
})
