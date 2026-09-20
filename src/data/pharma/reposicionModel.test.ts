import { describe, expect, it } from 'vitest'
import {
  estanteAlComienzo, presentacionesDuplicadas, sigueEnElMes, sumarDias, terminoCronograma,
  type LoteInsumo, type PacienteInsumo,
} from './reposicionModel'

/**
 * Las reglas compartidas de la reposición (docs/plan-reposicion-stock-minimo.md): quién suma, qué
 * presentación cuenta y qué queda en el estante. La cuenta de corte a corte que las usa se testea en
 * reposicionPeriodoModel.test.ts. Fechas fijas: CI corre en UTC.
 */

const HOY = '2026-09-14'
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' }

let n = 0
const paciente = (p: Partial<PacienteInsumo> = {}): PacienteInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'asm', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, ultimo_retiro: '2026-09-01', ...p,
  }
}
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({ protocol_id: 'asm', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p })

describe('sumarDias', () => {
  it('suma y resta días cruzando meses', () => {
    expect(sumarDias('2026-10-01', -20)).toBe('2026-09-11')
    expect(sumarDias('2026-09-14', 20)).toBe('2026-10-04')
  })
})

describe('quién suma (D16, D23)', () => {
  it('screening o activo sin cronograma suma', () => {
    expect(sigueEnElMes(paciente({ enrollment_status: 'screening' }), '2026-10-01')).toBe(true)
  })
  it('completado o discontinuado no suma', () => {
    expect(sigueEnElMes(paciente({ enrollment_status: 'completado' }), '2026-10-01')).toBe(false)
    expect(sigueEnElMes(paciente({ enrollment_status: 'discontinuado' }), '2026-10-01')).toBe(false)
  })
  it('con cronograma terminado antes del período no suma y se marca', () => {
    const p = paciente({ tiene_cronograma: true, ultima_programada: '2026-09-03' })
    expect(sigueEnElMes(p, '2026-10-01')).toBe(false)
    expect(terminoCronograma(p, '2026-10-01')).toBe(true)
  })
  it('con la última visita dentro del período suma', () => {
    const p = paciente({ tiene_cronograma: true, ultima_programada: '2026-10-20' })
    expect(sigueEnElMes(p, '2026-10-01')).toBe(true)
    expect(terminoCronograma(p, '2026-10-01')).toBe(false)
  })
  it('sin cronograma nunca «terminó», aunque venga una fecha', () => {
    expect(terminoCronograma(paciente({ tiene_cronograma: false, ultima_programada: '2026-01-01' }), '2026-10-01')).toBe(false)
  })
})

describe('presentacionesDuplicadas (D21)', () => {
  it('con dos de la misma droga en un enrolamiento, queda la última retirada', () => {
    const vieja = paciente({ enrollment_id: 'e', ultimo_retiro: '2026-07-01' })
    const nueva = paciente({ enrollment_id: 'e', medication_id: 'seretide-125', ultimo_retiro: '2026-09-02' })
    expect([...presentacionesDuplicadas([vieja, nueva])]).toEqual([vieja.patient_medication_id])
  })
  it('si ninguna se retiró, queda la asignada más nueva', () => {
    const a = paciente({ enrollment_id: 'e', ultimo_retiro: null, asignado_el: '2026-01-01' })
    const b = paciente({ enrollment_id: 'e', ultimo_retiro: null, asignado_el: '2026-05-01' })
    expect([...presentacionesDuplicadas([a, b])]).toEqual([a.patient_medication_id])
  })
  it('no junta enrolamientos distintos ni la habilitación de una entrega', () => {
    const a = paciente({ enrollment_id: 'e1' })
    const b = paciente({ enrollment_id: 'e2' })
    const c = paciente({ enrollment_id: 'e1', habilitacion_id: 'hab' })
    expect(presentacionesDuplicadas([a, b, c]).size).toBe(0)
  })
})

describe('estanteAlComienzo (D15)', () => {
  it('lo vencido hoy no cuenta', () => {
    expect(estanteAlComienzo([lote({ expiry_date: '2026-09-13' })], 0, HOY, OCTUBRE)).toMatchObject({ alComienzo: 0, vigenteHoy: 0 })
  })
  it('lo pendiente sale primero del que vence antes', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'B', expiry_date: '2027-01-01', quantity: 3 }), lote({ lot_number: 'A', expiry_date: '2026-09-20', quantity: 5 })], 4, HOY, OCTUBRE)
    // A entrega 4 y le queda 1 que vence antes de octubre: al 1/10 sólo queda B.
    expect(e).toMatchObject({ alComienzo: 3, faltaEsteMes: 0 })
  })
  it('el lote sin vencimiento se usa último', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'S', expiry_date: null, quantity: 5 }), lote({ lot_number: 'V', expiry_date: '2027-01-01', quantity: 2 })], 2, HOY, OCTUBRE)
    expect(e.alComienzo).toBe(5)
  })
  it('lo que vence durante el período cuenta y se avisa', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 })], 0, HOY, OCTUBRE)
    expect(e.alComienzo).toBe(3)
    expect(e.vencenEnElMes).toEqual([{ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 }])
  })
  it('si lo pendiente supera lo vigente, queda en cero y dice cuánto falta', () => {
    expect(estanteAlComienzo([lote({ quantity: 3 })], 5, HOY, OCTUBRE)).toMatchObject({ alComienzo: 0, faltaEsteMes: 2 })
  })
})
