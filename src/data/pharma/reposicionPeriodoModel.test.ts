import { describe, expect, it } from 'vitest'
import {
  armarReposicionDelPeriodo, borradorDelPedido, cambiosDelBorrador, libroDe, renglonesAEmitir,
  type InsumosDelPeriodo, type MovimientoInsumo, type PacientePeriodoInsumo, type RenglonPeriodoInsumo,
} from './reposicionPeriodoModel'
import type { EstudioInsumo, LoteInsumo } from './reposicionModel'
import type { PedidoItemInsumo, PedidoMedicacionInsumo } from './pedidosMedicacionModel'
import type { Periodo } from './periodoDeCorte'

/**
 * La reposición de corte a corte (spec 2026-09-16, R3, R6, R7, R8).
 *
 * Se testea porque un número mal contado se dibuja igual de prolijo: comprar de menos deja pacientes sin
 * medicación y de más se vence en el estante. Los ejemplos son los que vio el Director en los bocetos.
 * Fechas fijas: CI corre en UTC.
 */

const HOY = '2026-09-16'
const CORTE = 28
const P0: Periodo = { desde: '2026-08-29', hasta: '2026-09-28' }

const estudio = (p: Partial<EstudioInsumo> = {}): EstudioInsumo => ({ id: 'endura', code: '222714', name: 'ENDURA', status: 'activo', ...p })
const renglon = (p: Partial<RenglonPeriodoInsumo> = {}): RenglonPeriodoInsumo => ({
  protocol_medication_id: 'pm-seretide', protocol_id: 'endura', medication_id: 'seretide', medication_name: 'Seretide 250/50',
  presentacion: 'Aerosol', drug_id: 'fluti', modo: 'mensual', envases_por_mes: 1, stock_fijo: null, ...p,
})
let n = 0
const paciente = (p: Partial<PacientePeriodoInsumo> = {}): PacientePeriodoInsumo => {
  n += 1
  return {
    patient_medication_id: `pmed-${n}`, enrollment_id: `enr-${n}`, protocol_id: 'endura', medication_id: 'seretide', drug_id: 'fluti',
    patient_name: `Paciente ${String(n).padStart(2, '0')}`, enrollment_status: 'activo', envases_por_mes: null, habilitacion_id: null,
    asignado_el: '2026-03-01', tiene_cronograma: false, ultima_programada: null, retirado_periodo: 1, ultimo_retiro: '2026-09-05', ...p,
  }
}
/** `cuantos` pacientes con 1 envase por mes, de los que `retiraron` ya retiraron este período. */
const grupo = (cuantos: number, retiraron: number) =>
  Array.from({ length: cuantos }, (_, i) => paciente({ retirado_periodo: i < retiraron ? 1 : 0 }))
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p,
})
const mov = (p: Partial<MovimientoInsumo> = {}): MovimientoInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', entro: 0, salio: 0, ajustes: 0, desde_inicio: 0, ...p,
})
const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-15', emitido_por_nombre: 'Lautaro Molina', anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-1', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 6, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const insumos = (p: Partial<InsumosDelPeriodo> = {}): InsumosDelPeriodo => ({
  estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], movimientos: [], pedidos: [], pedido_items: [],
  sin_medicacion: [], ...p,
})
const armar = (i: InsumosDelPeriodo, periodo: Periodo = P0) => armarReposicionDelPeriodo(i, HOY, periodo, CORTE)
const seretide = (i: InsumosDelPeriodo) => armar(i).estudios[0].renglones[0]
const resumenBoleta = (i: InsumosDelPeriodo) =>
  seretide(i).boleta?.lineas.map((l) => [l.tipo, l.signo, l.valor, l.aclaracion])

describe('libroDe', () => {
  it('había + entró − salió + ajustes = hay', () => {
    expect(libroDe(mov({ entro: 15, salio: 12, ajustes: -1, desde_inicio: 2 }), 8))
      .toEqual({ habia: 6, entro: 15, salio: 12, ajustes: -1, hay: 8 })
  })
  it('sin movimientos, lo que había es lo que hay', () => {
    expect(libroDe(undefined, 8)).toEqual({ habia: 8, entro: 0, salio: 0, ajustes: 0, hay: 8 })
  })
})

describe('la cuenta del período (R3, R7)', () => {
  it('el ejemplo del Director: había 5, entraron 15, salieron 12, quedan 8 → comprar 4', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote()], movimientos: [mov({ entro: 15, salio: 12, desde_inicio: 3 })] }))
    expect(r.libro).toEqual({ habia: 5, entro: 15, salio: 12, ajustes: 0, hay: 8 })
    expect(r).toMatchObject({ estado: 'comprar', comprar: 4 })
    expect(r.boleta).toEqual({
      aComprar: 4,
      lineas: [
        { tipo: 'hacen_falta', titulo: 'Hacen falta para el próximo período', signo: '', valor: 12, aclaracion: '12 pacientes, 1 envase por mes' },
        { tipo: 'quedan_al_corte', titulo: 'Van a quedar en el estante al corte', signo: '−', valor: 8, aclaracion: 'hay 8 y ya retiraron todos' },
      ],
    })
  })
  it('la boleta A: 8 pacientes, hay 5 y 4 todavía no retiraron → comprar 7', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 5 })] })
    expect(seretide(i).comprar).toBe(7)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['quedan_al_corte', '−', 1, 'hay 5, y 4 pacientes todavía no retiraron'],
    ])
  })
  it('si el estante no alcanza para terminar el período, lo que falta se suma (D31)', () => {
    const i = insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })] })
    expect(seretide(i).comprar).toBe(9)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 8, '8 pacientes, 1 envase por mes'],
      ['faltan_este_periodo', '+', 1, '4 pacientes todavía no retiraron y en el estante no alcanza'],
    ])
  })
  it('con cantidad propia lo dice, y el singular se respeta', () => {
    const i = insumos({ pacientes: [paciente({ envases_por_mes: 2 }), paciente(), paciente()] })
    expect(seretide(i).comprar).toBe(5)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 4, '3 pacientes (1 con cantidad propia)'],
      ['faltan_este_periodo', '+', 1, '1 paciente todavía no retiró y en el estante no alcanza'],
    ])
  })
})

describe('lo ya pedido (R9, R11)', () => {
  const base = { pacientes: grupo(12, 12), lotes: [lote()] }
  it('se resta y, si cubre todo, el renglón queda en camino', () => {
    const r = seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item()] }))
    expect(r).toMatchObject({ estado: 'en_camino', comprar: 0 })
    expect(r.boleta?.lineas.at(-1)).toEqual({
      tipo: 'ya_pedido', titulo: 'Ya pedido, sin recibir', signo: '−', valor: 6, aclaracion: 'Pedido Nº 14 del 15/09',
    })
  })
  it('lo recibido de un pedido ya no se resta como pedido', () => {
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [item({ recibido: 4 })] })).comprar).toBe(2)
  })
  it('ni un renglón cerrado ni un pedido anulado descuentan', () => {
    const cerrado = item({ cerrado_at: '2026-09-16T12:00:00+00:00', cerrado_motivo: 'no_lo_tiene' })
    expect(seretide(insumos({ ...base, pedidos: [cab()], pedido_items: [cerrado] })).comprar).toBe(4)
    const anulado = cab({ anulado_at: '2026-09-16T12:00:00+00:00', anulado_motivo: 'por_error' })
    expect(seretide(insumos({ ...base, pedidos: [anulado], pedido_items: [item()] })).comprar).toBe(4)
  })
})

describe('a demanda y renglones sin cuenta', () => {
  it('a demanda: tener siempre N menos lo que queda', () => {
    const i = insumos({ renglones: [renglon({ modo: 'a_demanda', envases_por_mes: null, stock_fijo: 5 })], lotes: [lote({ quantity: 2 })] })
    expect(seretide(i).comprar).toBe(3)
    expect(resumenBoleta(i)).toEqual([['tener_siempre', '', 5, 'a demanda'], ['quedan_al_corte', '−', 2, 'hay 2']])
  })
  it('sin cargar y no se compra no tienen boleta ni número', () => {
    expect(seretide(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] })))
      .toMatchObject({ estado: 'sin_cargar', comprar: 0, boleta: null })
    expect(seretide(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })))
      .toMatchObject({ estado: 'no_se_compra', comprar: 0, boleta: null })
  })
  it('en un período anterior hay libro pero no cuenta (R6)', () => {
    const rep = armar(
      insumos({ pacientes: grupo(12, 0), lotes: [lote()], movimientos: [mov({ entro: 10, salio: 4, ajustes: -1, desde_inicio: 8 })] }),
      { desde: '2026-07-29', hasta: '2026-08-28' },
    )
    expect(rep.enCurso).toBe(false)
    expect(rep.estudios[0].renglones[0]).toMatchObject({
      estado: 'sin_cuenta', comprar: 0, boleta: null, libro: { habia: 0, entro: 10, salio: 4, ajustes: -1, hay: 5 },
    })
    expect(rep.estudios[0].estadoTarjeta).toBe('sin_cuenta')
  })
})

describe('vencimientos', () => {
  it('lo vencido está en el «hay» del libro pero no en la boleta', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote(), lote({ lot_number: 'L0', expiry_date: '2026-09-01', quantity: 2 })] }))
    expect(r.libro.hay).toBe(10)
    expect(r.comprar).toBe(4)
    expect(r.boleta?.lineas[1].aclaracion).toBe('hay 8 y ya retiraron todos, sin contar 2 vencidos')
  })
  it('lo que vence antes del próximo período no queda al corte', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ quantity: 5 }), lote({ lot_number: 'L2', expiry_date: '2026-09-25', quantity: 3 })] }))
    expect(r.comprar).toBe(7)
    expect(r.boleta?.lineas[1]).toMatchObject({ valor: 5, aclaracion: 'hay 8 y ya retiraron todos, 3 vencen antes del próximo período' })
  })
  it('un lote que vence durante el próximo período cuenta y avisa', () => {
    const r = seretide(insumos({ pacientes: grupo(12, 12), lotes: [lote({ expiry_date: '2026-10-10' })] }))
    expect(r.comprar).toBe(4)
    expect(r.avisos).toContainEqual({ tipo: 'vence', ambar: true, texto: 'Vence el 10/10: lote L1, 8 envases' })
  })
  it('la boleta no calla con todo vencido: «quedan al corte» aparece con valor 0', () => {
    const i = insumos({ pacientes: grupo(12, 12), lotes: [lote({ lot_number: 'L0', expiry_date: '2026-09-01', quantity: 10 })] })
    expect(seretide(i).comprar).toBe(12)
    expect(seretide(i).libro.hay).toBe(10)
    expect(resumenBoleta(i)).toEqual([
      ['hacen_falta', '', 12, '12 pacientes, 1 envase por mes'],
      ['quedan_al_corte', '−', 0, 'hay 0 y ya retiraron todos, sin contar 10 vencidos'],
    ])
  })
})

describe('la grilla (R2)', () => {
  it('ordena por código, saca los cerrados y dice el estado de cada tarjeta', () => {
    const rep = armar(insumos({
      estudios: [
        estudio({ id: 'lts', code: 'LTS17231', name: 'LTS17231' }),
        estudio(),
        estudio({ id: 'vic', code: 'CKJX839D12302', name: 'Victorion' }),
        estudio({ id: 'viejo', code: 'AAA-1', status: 'cerrado' }),
      ],
      renglones: [
        renglon(),
        renglon({ protocol_medication_id: 'pm-lts', protocol_id: 'lts' }),
        renglon({ protocol_medication_id: 'pm-lts-monte', protocol_id: 'lts', medication_id: 'monte', medication_name: 'Montelukast 10 mg', drug_id: 'monte', modo: null, envases_por_mes: null }),
      ],
      pacientes: grupo(12, 12),
      lotes: [lote(), lote({ protocol_id: 'lts', quantity: 20 })],
      sin_medicacion: [{ protocol_id: 'endura', enrolamientos: 3 }],
    }))
    expect(rep.estudios.map((e) => [e.estudio.code, e.estadoTarjeta])).toEqual([
      ['222714', 'comprar'], ['CKJX839D12302', 'sin_medicacion'], ['LTS17231', 'cubierto'],
    ])
    expect(rep.estudios[0]).toMatchObject({ resumen: { envases: 4, medicamentos: 1, sinCargar: 0, reponibles: 1 }, sinMedicacionHabilitada: 3 })
    expect(rep.estudios[2].resumen).toMatchObject({ envases: 0, sinCargar: 1, reponibles: 2 })
  })
  it('todo sin cargar se dice aparte', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('todo_sin_cargar')
  })
  it('sólo «no se compra» es no tener medicación para reponer', () => {
    expect(armar(insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] })).estudios[0].estadoTarjeta).toBe('sin_medicacion')
  })
  it('destaca el pedido con faltante', () => {
    expect(armar(insumos({ pedidos: [cab()], pedido_items: [item()] })).estudios[0].destacado?.numero).toBe(14)
  })
})

describe('armar el pedido (R8)', () => {
  const conTodo = () => armar(insumos({
    renglones: [
      renglon(),
      renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', presentacion: 'Comprimidos', drug_id: 'monte', modo: null, envases_por_mes: null }),
      renglon({ protocol_medication_id: 'pm-tio', medication_id: 'tio', medication_name: 'Tiotropio 18 mcg', presentacion: 'Cápsulas', drug_id: 'tio', modo: 'no_se_compra', envases_por_mes: null }),
    ],
    pacientes: grupo(12, 12),
    lotes: [lote()],
  })).estudios[0]

  it('arranca en lo calculado, lo sin cargar en cero y sin lo que no se compra', () => {
    expect(borradorDelPedido(conTodo())).toEqual([
      { medicationId: 'monte', nombre: 'Montelukast 10 mg', presentacion: 'Comprimidos', calculado: null, pedir: 0 },
      { medicationId: 'seretide', nombre: 'Seretide 250/50', presentacion: 'Aerosol', calculado: 4, pedir: 4 },
    ])
  })
  it('emite sólo los renglones con cantidad entera mayor a cero', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 1.5 }))
    expect(renglonesAEmitir(b)).toEqual([{ medication_id: 'seretide', calculado: 4, pedido: 6 }])
  })
  it('dice qué se cambió respecto de lo calculado; lo sin cargar se pide a mano', () => {
    const b = borradorDelPedido(conTodo()).map((r) => (r.medicationId === 'seretide' ? { ...r, pedir: 6 } : { ...r, pedir: 2 }))
    expect(cambiosDelBorrador(b)).toEqual(['Seretide 250/50: pedís 6, Spira calculó 4.'])
    expect(renglonesAEmitir(b)).toEqual([
      { medication_id: 'monte', calculado: null, pedido: 2 },
      { medication_id: 'seretide', calculado: 4, pedido: 6 },
    ])
  })
})
