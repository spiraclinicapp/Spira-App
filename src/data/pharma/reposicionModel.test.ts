import { describe, expect, it } from 'vitest'
import {
  armarReposicion, estanteAlComienzo, mesDe, pedidoOrdenado, pedidosAbiertos, plazo, presentacionesDuplicadas,
  renglonesDelPedido, sigueEnElMes, siguienteSinCargar, sumarDias, terminoCronograma,
  type EstudioInsumo, type InsumosReposicion, type LoteInsumo, type PacienteInsumo, type PedidoInsumo,
  type RecepcionInsumo, type RenglonInsumo,
} from './reposicionModel'

/**
 * Compras del mes que viene (docs/plan-reposicion-stock-minimo.md).
 *
 * Se testea porque un número mal contado se ve igual de prolijo: comprar de menos deja pacientes sin
 * medicación y de más se vence en el estante. Todas las fechas van fijas: CI corre en UTC.
 */

const HOY = '2026-09-14'

const estudio = (p: Partial<EstudioInsumo> = {}): EstudioInsumo => ({ id: 'asm', code: 'ASM-2301', name: 'Asma', status: 'activo', ...p })
const renglon = (p: Partial<RenglonInsumo> = {}): RenglonInsumo => ({
  protocol_medication_id: 'pm-seretide', protocol_id: 'asm', medication_id: 'seretide', medication_name: 'Seretide 250/50',
  presentacion: 'Aerosol (IDM)', drug_id: 'fluti', modo: 'mensual', envases_por_mes: 1, stock_fijo: null, salidas_90d: 18, ...p,
})
let n = 0
const paciente = (p: Partial<PacienteInsumo> = {}): PacienteInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'asm', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, retirado_mes: 1, ultimo_retiro: '2026-09-01', ...p,
  }
}
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({ protocol_id: 'asm', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p })
const pedido = (p: Partial<PedidoInsumo> = {}): PedidoInsumo => ({ id: 'ped-1', grupo: 'g1', protocol_id: 'asm', medication_id: 'seretide', cantidad: 6, pedido_el: '2026-09-12', ...p })
const recepcion = (p: Partial<RecepcionInsumo> = {}): RecepcionInsumo => ({ protocol_id: 'asm', medication_id: 'seretide', cantidad: 6, recibido_el: '2026-09-30', ...p })

const insumos = (p: Partial<InsumosReposicion> = {}): InsumosReposicion => ({
  demora_compra_dias: 20, estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], pedidos: [], recepciones: [],
  sin_medicacion: [], ...p,
})
// Por defecto el paciente ya retiró su mes (retirado_mes 1): así lo pendiente de septiembre (D31) no
// se mete en cada test. Los que lo prueban lo dicen explícito.

/** El ejemplo del plan: 10 pacientes a 1 por mes, 6 ya retiraron septiembre, 8 en el estante. */
const diezPacientes = () => Array.from({ length: 10 }, (_, i) => paciente({ retirado_mes: i < 6 ? 1 : 0 }))

describe('mesDe y sumarDias', () => {
  it('el mes siguiente a mitad de septiembre es octubre entero', () => {
    expect(mesDe(HOY, 1)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', nombre: 'octubre' })
  })
  it('cruza el año y respeta febrero, también el bisiesto', () => {
    expect(mesDe('2026-12-31', 1)).toMatchObject({ desde: '2027-01-01', nombre: 'enero' })
    expect(mesDe('2027-01-31', 1)).toMatchObject({ hasta: '2027-02-28' })
    expect(mesDe('2028-01-15', 1)).toMatchObject({ hasta: '2028-02-29' })
  })
  it('suma y resta días cruzando meses', () => {
    expect(sumarDias('2026-10-01', -20)).toBe('2026-09-11')
    expect(sumarDias('2026-09-14', 20)).toBe('2026-10-04')
  })
})

describe('plazo (D17, D24)', () => {
  it('a tiempo: el límite es el 1° del mes siguiente menos la demora', () => {
    expect(plazo('2026-09-05', 20)).toMatchObject({ limite: '2026-09-11', aTiempo: true, siguienteAlcanzable: null })
  })
  it('justo el día límite todavía está a tiempo', () => {
    expect(plazo('2026-09-11', 20).aTiempo).toBe(true)
  })
  it('tarde: dice cuándo llega y cuál es el primer mes al que se llega', () => {
    const p = plazo(HOY, 20)
    expect(p).toMatchObject({ aTiempo: false, llega: '2026-10-04' })
    expect(p.siguienteAlcanzable).toMatchObject({ limite: '2026-10-12', mes: { nombre: 'noviembre' } })
  })
  it('con una demora larga, el mes alcanzable puede estar a días', () => {
    expect(plazo(HOY, 45).siguienteAlcanzable).toMatchObject({ limite: '2026-09-17', mes: { nombre: 'noviembre' } })
  })
  it('sin demora cargada no inventa una fecha', () => {
    expect(plazo(HOY, null)).toMatchObject({ limite: null, llega: null })
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
  it('con cronograma terminado antes del mes no suma y se marca', () => {
    const p = paciente({ tiene_cronograma: true, ultima_programada: '2026-09-03' })
    expect(sigueEnElMes(p, '2026-10-01')).toBe(false)
    expect(terminoCronograma(p, '2026-10-01')).toBe(true)
  })
  it('con la última visita dentro del mes suma', () => {
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
  const oct = mesDe(HOY, 1)
  it('lo vencido hoy no cuenta', () => {
    expect(estanteAlComienzo([lote({ expiry_date: '2026-09-13' })], 0, HOY, oct)).toMatchObject({ alComienzo: 0, vigenteHoy: 0 })
  })
  it('lo pendiente sale primero del que vence antes', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'B', expiry_date: '2027-01-01', quantity: 3 }), lote({ lot_number: 'A', expiry_date: '2026-09-20', quantity: 5 })], 4, HOY, oct)
    // A entrega 4 y le queda 1 que vence antes de octubre: al 1/10 sólo queda B.
    expect(e).toMatchObject({ alComienzo: 3, faltaEsteMes: 0 })
  })
  it('el lote sin vencimiento se usa último', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'S', expiry_date: null, quantity: 5 }), lote({ lot_number: 'V', expiry_date: '2027-01-01', quantity: 2 })], 2, HOY, oct)
    expect(e.alComienzo).toBe(5)
  })
  it('lo que vence durante el mes cuenta y se avisa', () => {
    const e = estanteAlComienzo([lote({ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 })], 0, HOY, oct)
    expect(e.alComienzo).toBe(3)
    expect(e.vencenEnElMes).toEqual([{ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 }])
  })
  it('si lo pendiente supera lo vigente, queda en cero y dice cuánto falta', () => {
    expect(estanteAlComienzo([lote({ quantity: 3 })], 5, HOY, oct)).toMatchObject({ alComienzo: 0, faltaEsteMes: 2 })
  })
})

describe('pedidosAbiertos (D20)', () => {
  it('lo recibido después del pedido lo descuenta, en parte o entero', () => {
    expect(pedidosAbiertos([pedido()], [recepcion({ cantidad: 2 })], HOY, 20)[0].pendiente).toBe(4)
    expect(pedidosAbiertos([pedido()], [recepcion({ cantidad: 6 })], HOY, 20)).toEqual([])
  })
  it('una recepción anterior al pedido no lo descuenta', () => {
    expect(pedidosAbiertos([pedido()], [recepcion({ recibido_el: '2026-09-10' })], HOY, 20)[0].pendiente).toBe(6)
  })
  it('con dos pedidos, lo recibido completa primero el más viejo', () => {
    const abiertos = pedidosAbiertos(
      [pedido({ id: 'nuevo', pedido_el: '2026-09-12', cantidad: 3 }), pedido({ id: 'viejo', pedido_el: '2026-09-01', cantidad: 4 })],
      [recepcion({ cantidad: 5, recibido_el: '2026-09-13' })], HOY, 20)
    expect(abiertos.map((p) => [p.id, p.pendiente])).toEqual([['nuevo', 2]])
  })
  it('no cruza medicamentos ni estudios', () => {
    expect(pedidosAbiertos([pedido()], [recepcion({ medication_id: 'otro' }), recepcion({ protocol_id: 'otro' })], HOY, 20)[0].pendiente).toBe(6)
  })
  it('marca atrasado el que ya debía haber llegado', () => {
    expect(pedidosAbiertos([pedido({ pedido_el: '2026-08-10' })], [], HOY, 20)[0].atrasado).toBe(true)
    expect(pedidosAbiertos([pedido({ pedido_el: '2026-09-12' })], [], HOY, 20)[0].atrasado).toBe(false)
  })
})

describe('armarReposicion: la cuenta (D10, D31)', () => {
  it('el ejemplo del plan: 10 para octubre − 4 que quedan = 6', () => {
    const [r] = armarReposicion(insumos({ pacientes: diezPacientes(), lotes: [lote()] }), HOY).renglones
    expect(r).toMatchObject({ estado: 'comprar', comprar: 6 })
    expect(r.cuenta).toMatchObject({ pacientesMes: 10, necesidad: 10, alComienzo: 4, faltaEsteMes: 0, enCamino: 0 })
  })
  it('lo que falta este mes entra en la compra: 10 + 2 = 12', () => {
    const [r] = armarReposicion(insumos({ pacientes: Array.from({ length: 10 }, (_, i) => paciente({ retirado_mes: i < 5 ? 1 : 0 })), lotes: [lote({ quantity: 3 })] }), HOY).renglones
    expect(r).toMatchObject({ comprar: 12 })
    expect(r.cuenta.faltaEsteMes).toBe(2)
    expect(r.avisos[0]).toMatchObject({ tipo: 'falta_este_mes', ambar: true })
  })
  it('con el pedido en camino ya no pide comprar y queda «en camino» (D40)', () => {
    const rep = armarReposicion(insumos({ pacientes: diezPacientes(), lotes: [lote()], pedidos: [pedido()] }), HOY)
    expect(rep.renglones[0]).toMatchObject({ estado: 'en_camino', comprar: 0 })
    expect(rep.resumen).toMatchObject({ envases: 0, enCamino: 6, ultimoGrupo: { grupo: 'g1', envases: 6 } })
  })
  it('si sobra, alcanza: nunca un número negativo', () => {
    const [r] = armarReposicion(insumos({ pacientes: [paciente()], lotes: [lote({ quantity: 40 })] }), HOY).renglones
    expect(r).toMatchObject({ estado: 'alcanza', comprar: 0 })
  })
  it('a demanda: tener siempre N − lo que queda − lo que viene', () => {
    const r = renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 3 })
    expect(armarReposicion(insumos({ renglones: [r], lotes: [lote({ quantity: 1 })] }), HOY).renglones[0]).toMatchObject({ comprar: 2 })
    expect(armarReposicion(insumos({ renglones: [r], lotes: [lote({ quantity: 1 })], pedidos: [pedido({ cantidad: 2 })] }), HOY).renglones[0]).toMatchObject({ estado: 'en_camino' })
  })
  it('a demanda ignora pacientes y excepciones', () => {
    const r = renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 3 })
    expect(armarReposicion(insumos({ renglones: [r], pacientes: diezPacientes() }), HOY).renglones[0].comprar).toBe(3)
  })
  it('sin cargar no calcula ni suma como cero; «no se compra» queda afuera', () => {
    const rep = armarReposicion(insumos({
      renglones: [renglon({ modo: null, envases_por_mes: null }), renglon({ protocol_medication_id: 'pm-2', medication_id: 'placebo', medication_name: 'Placebo', modo: 'no_se_compra', envases_por_mes: null })],
      pacientes: diezPacientes(),
    }), HOY)
    expect(rep.renglones.map((r) => [r.nombre, r.estado, r.comprar])).toEqual([['Placebo', 'no_se_compra', 0], ['Seretide 250/50', 'sin_cargar', 0]])
    expect(rep.resumen).toMatchObject({ envases: 0, sinCargar: 1 })
  })
  it('un renglón sin cargar igual cuenta quiénes siguen en el mes (lo usa el formulario de carga)', () => {
    const [r] = armarReposicion(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })], pacientes: diezPacientes() }), HOY).renglones
    expect(r.cuenta).toMatchObject({ pacientesMes: 10, necesidad: 0 })
  })
  it('la excepción del paciente gana sobre la del estudio', () => {
    const [r] = armarReposicion(insumos({ pacientes: [paciente({ envases_por_mes: 3 }), paciente()] }), HOY).renglones
    expect(r.cuenta.necesidad).toBe(4)
  })
  it('la habilitación de una sola entrega no suma', () => {
    const [r] = armarReposicion(insumos({ pacientes: [paciente({ habilitacion_id: 'hab' })] }), HOY).renglones
    expect(r.cuenta.pacientesMes).toBe(0)
  })
  it('dos presentaciones de la misma droga: suma una y avisa', () => {
    const renglones = [renglon(), renglon({ protocol_medication_id: 'pm-125', medication_id: 'seretide-125', medication_name: 'Seretide 125/50' })]
    const pacientes = [
      paciente({ enrollment_id: 'e', ultimo_retiro: '2026-06-01', patient_name: 'Marta Giménez' }),
      paciente({ enrollment_id: 'e', medication_id: 'seretide-125', ultimo_retiro: '2026-09-10', patient_name: 'Marta Giménez' }),
    ]
    const rep = armarReposicion(insumos({ renglones, pacientes }), HOY)
    const necesidad = rep.renglones.reduce((s, r) => s + r.cuenta.necesidad, 0)
    expect(necesidad).toBe(1)
    expect(rep.renglones.find((r) => r.medicationId === 'seretide')!.avisos.map((a) => a.tipo)).toContain('dos_presentaciones')
  })
  it('un paciente en dos estudios suma en cada uno, por enrolamiento', () => {
    const rep = armarReposicion(insumos({
      estudios: [estudio(), estudio({ id: 'asm2', code: 'ASM-2410' })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-2', protocol_id: 'asm2' })],
      pacientes: [paciente({ enrollment_id: 'e1', patient_name: 'Julio' }), paciente({ enrollment_id: 'e2', protocol_id: 'asm2', patient_name: 'Julio' })],
    }), HOY)
    expect(rep.renglones.map((r) => r.cuenta.necesidad)).toEqual([1, 1])
  })
  it('estudio cerrado no aparece; pausado sí, con su estado (D26)', () => {
    const rep = armarReposicion(insumos({
      estudios: [estudio({ status: 'cerrado' }), estudio({ id: 'epoc', code: 'EPOC-118', status: 'pausado' })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-epoc', protocol_id: 'epoc' })],
    }), HOY)
    expect(rep.renglones.map((r) => [r.estudio.code, r.estudio.status])).toEqual([['EPOC-118', 'pausado']])
  })
  it('avisa quién terminó su cronograma (no suma), quién no retira (suma) y quién se llevó de más', () => {
    const [r] = armarReposicion(insumos({
      pacientes: [
        paciente({ patient_name: 'Julio Ferreyra', tiene_cronograma: true, ultima_programada: '2026-09-03' }),
        paciente({ patient_name: 'Marta Giménez', ultimo_retiro: '2026-05-01' }),
        paciente({ patient_name: 'Susana Rodríguez', retirado_mes: 3 }),
      ],
    }), HOY).renglones
    expect(r.cuenta.pacientesMes).toBe(2)
    const porTipo = Object.fromEntries(r.avisos.map((a) => [a.tipo, a.texto]))
    expect(porTipo.termino_cronograma).toContain('Julio Ferreyra')
    expect(porTipo.sin_retiros).toContain('Marta Giménez')
    expect(porTipo.varios_meses).toContain('Susana Rodríguez')
  })
  it('avisa el lote que vence en octubre y el pedido atrasado', () => {
    const [r] = armarReposicion(insumos({
      pacientes: [paciente()], lotes: [lote({ lot_number: 'L2231', expiry_date: '2026-10-20', quantity: 3 })],
      pedidos: [pedido({ pedido_el: '2026-08-10', cantidad: 1 })],
    }), HOY).renglones
    expect(r.avisos.map((a) => a.texto)).toEqual([
      'Un lote (L2231, 3 envases) vence el 20/10',
      '¿Llegó? El pedido del 10/08 debía llegar el 30/08',
    ])
  })
  it('el resumen cuenta envases, medicamentos, estudios y pendientes; y los pacientes sin medicación', () => {
    const rep = armarReposicion(insumos({
      estudios: [estudio(), estudio({ id: 'asm2', code: 'ASM-2410' })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-2', protocol_id: 'asm2' }), renglon({ protocol_medication_id: 'pm-3', protocol_id: 'asm2', medication_id: 'monte', medication_name: 'Montelukast', modo: null })],
      pacientes: [...diezPacientes(), paciente({ protocol_id: 'asm2' }), paciente({ protocol_id: 'asm2' })],
      lotes: [lote()],
      sin_medicacion: [{ protocol_id: 'asm2', enrolamientos: 2 }, { protocol_id: 'asm', enrolamientos: 0 }],
    }), HOY)
    expect(rep.resumen).toMatchObject({ envases: 8, medicamentos: 2, estudios: 2, sinCargar: 1 })
    expect(rep.sinMedicacion).toEqual([{ estudio: expect.objectContaining({ code: 'ASM-2410' }), enrolamientos: 2 }])
    expect(siguienteSinCargar(rep)?.nombre).toBe('Montelukast')
  })
})

describe('«Ver pedido» (D46, D47)', () => {
  const rep = armarReposicion(insumos({
    estudios: [estudio(), estudio({ id: 'asm2', code: 'ASM-2410' })],
    renglones: [
      renglon({ protocol_medication_id: 'a-ser', envases_por_mes: 1 }),
      renglon({ protocol_medication_id: 'a-sal', medication_id: 'salbu', medication_name: 'Salbutamol 100 mcg', modo: 'a_demanda', envases_por_mes: null, stock_fijo: 2 }),
      renglon({ protocol_medication_id: 'b-bud', protocol_id: 'asm2', medication_id: 'bude', medication_name: 'Budesonida 200 mcg', envases_por_mes: 2 }),
      renglon({ protocol_medication_id: 'b-ser', protocol_id: 'asm2' }),
    ],
    pacientes: [
      ...Array.from({ length: 6 }, () => paciente()),
      ...Array.from({ length: 4 }, () => paciente({ protocol_id: 'asm2', medication_id: 'bude', retirado_mes: 2 })),
      ...Array.from({ length: 2 }, () => paciente({ protocol_id: 'asm2' })),
    ],
  }), HOY)

  it('por estudio: agrupado, con total por estudio', () => {
    expect(pedidoOrdenado(rep, 'estudio').map((g) => [g.titulo, g.envases, g.lineas.map((l) => [l.nombre, l.envases])])).toEqual([
      ['ASM-2301', 8, [['Salbutamol 100 mcg', 2], ['Seretide 250/50', 6]]],
      ['ASM-2410', 10, [['Budesonida 200 mcg', 8], ['Seretide 250/50', 2]]],
    ])
  })
  it('por medicamento: suma entre estudios y deja el reparto', () => {
    const [g] = pedidoOrdenado(rep, 'medicamento')
    expect(g.envases).toBe(18)
    expect(g.lineas.map((l) => [l.nombre, l.envases, l.estudios])).toEqual([
      ['Budesonida 200 mcg', 8, [{ code: 'ASM-2410', envases: 8 }]],
      ['Salbutamol 100 mcg', 2, [{ code: 'ASM-2301', envases: 2 }]],
      ['Seretide 250/50', 8, [{ code: 'ASM-2301', envases: 6 }, { code: 'ASM-2410', envases: 2 }]],
    ])
  })
  it('por cantidad: de mayor a menor, empates por nombre y estudio', () => {
    const [g] = pedidoOrdenado(rep, 'cantidad')
    expect(g.lineas.map((l) => [l.nombre, l.estudios[0].code, l.envases])).toEqual([
      ['Budesonida 200 mcg', 'ASM-2410', 8],
      ['Seretide 250/50', 'ASM-2301', 6],
      ['Salbutamol 100 mcg', 'ASM-2301', 2],
      ['Seretide 250/50', 'ASM-2410', 2],
    ])
  })
  it('«Ya lo pedí» manda una fila por renglón a comprar', () => {
    expect(renglonesDelPedido(rep)).toHaveLength(4)
    expect(renglonesDelPedido(rep).reduce((s, r) => s + r.cantidad, 0)).toBe(18)
  })
})
