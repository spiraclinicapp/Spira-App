import { describe, expect, it } from 'vitest'
import { franjaDelCorte, pedidosAMostrar, resumenDelEstudio, subtituloDelPeriodo, tarjetaDe } from './reposicionTarjetaModel'
import { armarReposicionDelPeriodo, type InsumosDelPeriodo, type PacientePeriodoInsumo, type RenglonPeriodoInsumo } from './reposicionPeriodoModel'
import { periodoDe } from './periodoDeCorte'
import type { EstudioInsumo, LoteInsumo } from './reposicionModel'
import type { PedidoItemInsumo, PedidoMedicacionInsumo, RecepcionDePedidoInsumo } from './pedidosMedicacionModel'

/**
 * Lo que dicen la grilla y el estudio (revisión de diseño del 17/09: RD1, RD4-RD7, RD17).
 *
 * Se testea porque elegir mal no se ve: una tarjeta que dice «Cubierto» cuando falta pedir, o una franja
 * que cuenta un estudio que ya tiene su pedido, se dibujan igual de prolijas que las correctas.
 * Fechas fijas (CI corre en UTC). Corte el 28: el período en curso del 16/09 es 29/08 al 28/09.
 */

const CORTE = 28
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
const grupo = (cuantos: number, retiraron: number, protocolo = 'endura') =>
  Array.from({ length: cuantos }, (_, i) => paciente({ retirado_periodo: i < retiraron ? 1 : 0, protocol_id: protocolo }))
const lote = (p: Partial<LoteInsumo> = {}): LoteInsumo => ({
  protocol_id: 'endura', medication_id: 'seretide', lot_number: 'L1', expiry_date: '2027-06-30', quantity: 8, ...p,
})
const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina', anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-1', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 4, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const recepcion = (p: Partial<RecepcionDePedidoInsumo> = {}): RecepcionDePedidoInsumo => ({
  id: 'rec-1051', pedido_id: 'ped-14', folio: 1051, reception_date: '2026-10-02', status: 'pendiente', verified_by_name: null, envases: 4, ...p,
})
const insumos = (p: Partial<InsumosDelPeriodo> = {}): InsumosDelPeriodo => ({
  estudios: [estudio()], renglones: [renglon()], pacientes: [], lotes: [], movimientos: [], pedidos: [], pedido_items: [],
  recepciones: [], sin_medicacion: [], ...p,
})
/** La reposición del período en curso a `hoy`. */
const rep = (hoy: string, i: InsumosDelPeriodo) => armarReposicionDelPeriodo(i, hoy, periodoDe(hoy, CORTE), CORTE)
const tarjeta = (hoy: string, i: InsumosDelPeriodo) => { const r = rep(hoy, i); return tarjetaDe(r.estudios[0], r) }
/** 12 pacientes que ya retiraron y 8 en el estante: para el período que viene hay que comprar 4. */
const COMPRA_4 = (p: Partial<InsumosDelPeriodo> = {}) => insumos({ pacientes: grupo(12, 12), lotes: [lote()], ...p })
/** El 01/10: pasó el corte del 28/09, 12 pacientes sin retirar, 5 en el estante → tarde, 7 (RD1). */
const TARDE = () => insumos({ pacientes: grupo(12, 0), lotes: [lote({ quantity: 5 })] })
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }

describe('la tarjeta sin pedido (RD4, RD6)', () => {
  it('faltando 7 días o menos, lo que hay que comprar es la tarea', () => {
    expect(tarjeta('2026-09-22', COMPRA_4())).toEqual({
      principal: { tipo: 'comprar', envases: 4 },
      detalle: [{ texto: '1 medicamento', aviso: false }],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('a mitad de período lo dice tranquilo, con la fecha del corte', () => {
    expect(tarjeta('2026-09-16', COMPRA_4())).toEqual({
      principal: { tipo: 'cubierto' },
      detalle: [],
      renglones: [{ texto: 'Para el corte del 28/09: 4 envases · todavía sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('si al período en curso le falta algo, es tarea aunque falte mucho para el corte (decisión 3 del plan)', () => {
    expect(tarjeta('2026-09-16', insumos({ pacientes: grupo(8, 4), lotes: [lote({ quantity: 3 })] })).principal)
      .toEqual({ tipo: 'comprar', envases: 9 })
  })
  it('sin nada para comprar: cubierto y no hace falta pedir', () => {
    expect(tarjeta('2026-09-22', COMPRA_4({ lotes: [lote({ quantity: 20 })] }))).toEqual({
      principal: { tipo: 'cubierto' },
      detalle: [],
      renglones: [{ texto: 'Para el período que viene: no hace falta pedir', mudo: true }],
      clicable: true,
    })
  })
  it('lo sin cargar se dice aparte', () => {
    const t = tarjeta('2026-09-22', COMPRA_4({
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', modo: null, envases_por_mes: null })],
    }))
    expect(t.detalle).toEqual([{ texto: '1 medicamento', aviso: false }, { texto: '1 sin cargar', aviso: true }])
  })
  it('nada cargado: falta cargar cómo se repone', () => {
    expect(tarjeta('2026-09-22', insumos({ renglones: [renglon({ modo: null, envases_por_mes: null })] }))).toEqual({
      principal: { tipo: 'falta_cargar' },
      detalle: [{ texto: '0 de 1 cargados', aviso: false }],
      renglones: [{ texto: 'Para el período que viene: sin pedido', mudo: true }],
      clicable: true,
    })
  })
  it('dice cuántos pacientes quedan afuera de la cuenta (revisión de ingeniería, 13)', () => {
    expect(tarjeta('2026-09-22', COMPRA_4({ sin_medicacion: [{ protocol_id: 'endura', enrolamientos: 2 }] })).detalle).toEqual([
      { texto: '1 medicamento', aviso: false },
      { texto: '2 pacientes sin medicación habilitada', aviso: true },
    ])
  })
  it('en un período cerrado no hay cuenta, y lo dice (rama defensiva)', () => {
    const r = armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(tarjetaDe(r.estudios[0], r)).toEqual({ principal: { tipo: 'sin_cuenta' }, detalle: [], renglones: [], clicable: true })
  })
  it('sin medicación de base no se entra (RD16)', () => {
    expect(tarjeta('2026-09-22', insumos({ renglones: [renglon({ modo: 'no_se_compra', envases_por_mes: null })] }))).toEqual({
      principal: { tipo: 'sin_medicacion' }, detalle: [], renglones: [], clicable: false,
    })
  })
})

describe('la tarjeta con pedido (RD4, RD5, RD17, RD3)', () => {
  it('con el pedido emitido, el pedido es lo principal', () => {
    expect(tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] }))).toEqual({
      principal: { tipo: 'pedido', numero: 14, pastilla: { clave: 'sin_recibir', texto: 'Sin recibir' } },
      detalle: [{ texto: '4 envases para el 29/09 al 28/10', aviso: false }],
      renglones: [],
      clicable: true,
    })
  })
  it('si pidió menos de lo que hacía falta, lo dice', () => {
    expect(tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ pedido: 3 })] })).detalle).toEqual([
      { texto: '3 envases para el 29/09 al 28/10', aviso: false },
      { texto: 'falta 1 envase más', aviso: true },
    ])
  })
  it('llegó sin verificar: nombra la recepción', () => {
    const t = tarjeta('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ sin_verificar: 4 })], recepciones: [recepcion()] }))
    expect(t.principal).toMatchObject({ tipo: 'pedido', pastilla: { clave: 'llego' } })
    expect(t.detalle).toEqual([{ texto: 'Recepción Nº 1051 sin verificar', aviso: false }])
  })
  it('un pedido anterior que debe algo va en su propio renglón', () => {
    const t = tarjeta('2026-09-22', COMPRA_4({
      pedidos: [cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' })],
      pedido_items: [item({ id: 'i13', pedido_id: 'ped-13', pedido: 2, recibido: 1 })],
    }))
    expect(t.principal).toEqual({ tipo: 'comprar', envases: 3 })
    expect(t.renglones).toEqual([
      { texto: 'Para el período que viene: sin pedido', mudo: true },
      { texto: 'Pedido Nº 13 · falta 1 envase', mudo: false },
    ])
  })
})

describe('un pedido que no llegó no es el del período (Director, 2026-09-19)', () => {
  /** El Nº 14 pidió 6 y se cerró entero sin que llegara nada: no va a cubrir el período que viene. */
  const NO_LLEGO = { pedidos: [cab()], pedido_items: [item({ pedido: 6, calculado: 6, ...CERRADO })] }
  it('la tarjeta dice lo que hay que comprar de verdad, no lo que faltó, y el renglón fijo lo nombra', () => {
    expect(tarjeta('2026-09-28', COMPRA_4(NO_LLEGO))).toEqual({
      principal: { tipo: 'comprar', envases: 4 },
      detalle: [{ texto: '1 medicamento', aviso: false }],
      renglones: [{ texto: 'Para el período que viene: el Pedido Nº 14 no llegó', mudo: false }],
      clicable: true,
    })
  })
  it('la franja lo cuenta como un estudio sin pedido', () => {
    expect(franjaDelCorte(rep('2026-09-28', COMPRA_4(NO_LLEGO)))?.sub).toBe('1 estudio sin pedido para el período que viene.')
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4(NO_LLEGO)))?.sub)
      .toBe('Período 29/08 al 28/09 · 1 estudio tiene compras y todavía no tiene pedido.')
  })
  it('tarde: el período que empezó sigue sin pedido y el renglón lo nombra', () => {
    const t = tarjeta('2026-10-01', insumos({ ...TARDE(), pedidos: [cab()], pedido_items: [item({ ...CERRADO })] }))
    expect(t.principal).toEqual({ tipo: 'comprar', envases: 7 })
    expect(t.renglones).toEqual([{ texto: 'Para el período 29/09 al 28/10: el Pedido Nº 14 no llegó', mudo: false }])
  })
  it('en el modo tranquilo también', () => {
    // 29/09: el Nº 13 (del período en curso) todavía viaja; el Nº 14, para el que viene, se cerró sin llegar.
    const t = tarjeta('2026-09-29', insumos({
      pacientes: grupo(12, 0), lotes: [lote({ quantity: 2 })],
      pedidos: [cab({ id: 'ped-13', numero: 13 }), cab({ periodo_desde: '2026-10-29', periodo_hasta: '2026-11-28' })],
      pedido_items: [item({ id: 'i13', pedido_id: 'ped-13', pedido: 10, calculado: 10 }), item({ ...CERRADO })],
    }))
    expect(t.principal).toEqual({ tipo: 'cubierto' })
    expect(t.renglones[0]).toEqual({ texto: 'Para el corte del 28/10: 12 envases · el Pedido Nº 14 no llegó', mudo: false })
  })
  it('con todo sin cargar, el renglón fijo también lo nombra', () => {
    const t = tarjeta('2026-09-22', insumos({ ...NO_LLEGO, renglones: [renglon({ modo: null, envases_por_mes: null })] }))
    expect(t.renglones).toEqual([{ texto: 'Para el período que viene: el Pedido Nº 14 no llegó', mudo: false }])
  })
  it('si no hace falta pedir, eso sigue siendo lo que dice', () => {
    expect(tarjeta('2026-09-22', COMPRA_4({ ...NO_LLEGO, lotes: [lote({ quantity: 20 })] })).renglones)
      .toEqual([{ texto: 'Para el período que viene: no hace falta pedir', mudo: true }])
  })
  it('si después se emitió otro, ése es el pedido de la tarjeta', () => {
    const t = tarjeta('2026-09-28', COMPRA_4({
      pedidos: [cab(), cab({ id: 'ped-15', numero: 15 })],
      pedido_items: [item({ pedido: 6, calculado: 6, ...CERRADO }), item({ id: 'i15', pedido_id: 'ped-15' })],
    }))
    expect(t.principal).toMatchObject({ tipo: 'pedido', numero: 15, pastilla: { clave: 'sin_recibir' } })
  })
})

describe('la tarjeta el día después del corte (revisión de ingeniería, 5)', () => {
  it('con el pedido del período en camino, lo que falta ya está pedido: la tarjeta está tranquila', () => {
    // 29/09: el Nº 14 (para el 29/09 al 28/10) se emitió el 28/09 y todavía no llegó; nadie retiró.
    const t = tarjeta('2026-09-29', insumos({
      pacientes: grupo(12, 0), lotes: [lote({ quantity: 2 })], pedidos: [cab()], pedido_items: [item({ pedido: 10, calculado: 10 })],
    }))
    expect(t.principal).toEqual({ tipo: 'cubierto' })
    expect(t.renglones[0]).toEqual({ texto: 'Para el corte del 28/10: 12 envases · todavía sin pedido', mudo: true })
  })
})

describe('la tarjeta con el pedido tarde (RD1)', () => {
  it('pasó el corte, sin pedido: la tarea es el período que empezó', () => {
    expect(tarjeta('2026-10-01', TARDE())).toEqual({
      principal: { tipo: 'comprar', envases: 7 },
      detalle: [{ texto: 'Para el período que empezó · quedan 3 días', aviso: true }],
      renglones: [{ texto: 'Para el período 29/09 al 28/10: sin pedido', mudo: true }],
      clicable: true,
    })
  })
})

describe('la franja del corte (RD7)', () => {
  it('a mitad de mes cuenta los estudios con compras y sin pedido', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4()))).toEqual({
      texto: 'Corte el 28/09 · faltan 12 días',
      sub: 'Período 29/08 al 28/09 · 1 estudio tiene compras y todavía no tiene pedido.',
      aviso: false,
    })
  })
  it('en plural', () => {
    const dos = COMPRA_4({
      estudios: [estudio(), estudio({ id: 'lts', code: 'LTS17231', name: 'LTS' })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-lts', protocol_id: 'lts' })],
      pacientes: [...grupo(12, 12), ...grupo(12, 12, 'lts')],
      lotes: [lote(), lote({ protocol_id: 'lts' })],
    })
    expect(franjaDelCorte(rep('2026-09-16', dos))?.sub).toBe('Período 29/08 al 28/09 · 2 estudios tienen compras y todavía no tienen pedido.')
  })
  it('un estudio que ya tiene su pedido no cuenta', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))?.sub)
      .toBe('Período 29/08 al 28/09 · todos los estudios con compras tienen su pedido.')
  })
  it('con medicamentos sin cargar no dice «no hay nada para pedir» (revisión de ingeniería, 13)', () => {
    const conSinCargar = COMPRA_4({
      lotes: [lote({ quantity: 20 })],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', modo: null, envases_por_mes: null })],
    })
    expect(franjaDelCorte(rep('2026-09-16', conSinCargar))?.sub).toBe('Período 29/08 al 28/09 · falta cargar cómo se repone en 1 estudio.')
  })
  it('con pedido Y renglones sin cargar dice las dos cosas: una sola taparía la otra (revisión final, T4a)', () => {
    const ambos = COMPRA_4({
      pedidos: [cab()], pedido_items: [item()],
      renglones: [renglon(), renglon({ protocol_medication_id: 'pm-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', modo: null, envases_por_mes: null })],
    })
    expect(franjaDelCorte(rep('2026-09-16', ambos))?.sub)
      .toBe('Período 29/08 al 28/09 · todos los estudios con compras tienen su pedido; falta cargar cómo se repone en 1 estudio.')
    expect(franjaDelCorte(rep('2026-09-28', ambos))?.sub)
      .toBe('Todos los estudios con compras tienen su pedido; falta cargar cómo se repone en 1 estudio.')
  })
  it('sin compras, lo dice', () => {
    expect(franjaDelCorte(rep('2026-09-16', COMPRA_4({ lotes: [lote({ quantity: 20 })] })))?.sub)
      .toBe('Período 29/08 al 28/09 · no hay nada para pedir.')
  })
  it('mañana y hoy', () => {
    expect(franjaDelCorte(rep('2026-09-27', COMPRA_4()))).toEqual({
      texto: 'Corte mañana (28/09)', sub: '1 estudio sin pedido para el período que viene.', aviso: false,
    })
    expect(franjaDelCorte(rep('2026-09-28', COMPRA_4()))).toEqual({
      texto: 'El corte es hoy', sub: '1 estudio sin pedido para el período que viene.', aviso: true,
    })
    expect(franjaDelCorte(rep('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))?.sub)
      .toBe('Todos los estudios con compras tienen su pedido.')
  })
  it('dentro de los 5 días, lo que falta pedir del período que empezó (RD1)', () => {
    expect(franjaDelCorte(rep('2026-10-01', TARDE()))).toEqual({
      texto: 'El corte fue el 28/09 · quedan 3 días para pedir el período que empezó',
      sub: '1 estudio sin pedido para el 29/09 al 28/10.',
      aviso: true,
    })
  })
  it('un período cerrado no tiene franja', () => {
    expect(franjaDelCorte(armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE))).toBeNull()
  })
})

describe('el subtítulo del período en el estudio', () => {
  const sub = (hoy: string, i = COMPRA_4()) => { const r = rep(hoy, i); return subtituloDelPeriodo(r, r.estudios[0]) }
  it('en curso, mañana, hoy', () => {
    expect(sub('2026-09-16')).toEqual({ texto: 'Período en curso · el corte es en 12 días', aviso: false })
    expect(sub('2026-09-27')).toEqual({ texto: 'Período en curso · el corte es mañana', aviso: false })
    expect(sub('2026-09-28')).toEqual({ texto: 'El corte es hoy', aviso: true })
  })
  it('tarde y cerrado', () => {
    expect(sub('2026-10-01', TARDE())).toEqual({ texto: 'Período en curso · quedan 3 días para pedirlo', aviso: true })
    const cerrado = armarReposicionDelPeriodo(COMPRA_4(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(subtituloDelPeriodo(cerrado, cerrado.estudios[0])).toEqual({ texto: 'Período cerrado', aviso: false })
  })
})

describe('el resumen del estudio (RD5)', () => {
  const resumen = (hoy: string, i: InsumosDelPeriodo) => { const r = rep(hoy, i); return resumenDelEstudio(r.estudios[0], r) }
  it('sin pedido: cuánto comprar', () => {
    expect(resumen('2026-09-16', COMPRA_4())).toEqual({
      tipo: 'compra', titulo: 'Para el período que viene (29/09 al 28/10)', envases: 4, sinCargar: 0,
      detalle: '1 medicamento para comprar · todavía sin pedido',
    })
  })
  it('con el pedido de hoy: el pedido y si alcanza', () => {
    expect(resumen('2026-09-28', COMPRA_4({ pedidos: [cab()], pedido_items: [item()] })))
      .toMatchObject({ tipo: 'pedido', pastilla: { clave: 'sin_recibir' }, detalle: 'Emitido hoy · 4 envases · con esto alcanza' })
  })
  it('tarde: para el período que empezó', () => {
    expect(resumen('2026-10-01', TARDE())?.titulo).toBe('Para el período que empezó (29/09 al 28/10)')
  })
  it('con el pedido llegado y sin verificar: la pastilla lo dice y lo en camino ya cubre (revisión final, T4c)', () => {
    const i = COMPRA_4({ pedidos: [cab({ emitido_el: '2026-09-20' })], pedido_items: [item({ sin_verificar: 4 })], recepciones: [recepcion()] })
    expect(resumen('2026-09-22', i)).toMatchObject({
      tipo: 'pedido', pastilla: { clave: 'llego', texto: 'Llegó, falta verificar' },
      detalle: 'Emitido el 20/09 · 4 envases · con esto alcanza',
    })
  })
  it('con un pedido que no llegó: cuánto comprar, y lo nombra en vez de «todavía sin pedido» (Director, 2026-09-19)', () => {
    expect(resumen('2026-09-16', COMPRA_4({ pedidos: [cab()], pedido_items: [item({ pedido: 6, calculado: 6, ...CERRADO })] }))).toEqual({
      tipo: 'compra', titulo: 'Para el período que viene (29/09 al 28/10)', envases: 4, sinCargar: 0,
      detalle: '1 medicamento para comprar · el Pedido Nº 14 no llegó',
    })
  })
})

describe('qué pedidos lista el estudio', () => {
  const tres = () => COMPRA_4({
    pedidos: [
      cab(),
      cab({ id: 'ped-13', numero: 13, periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' }),
      cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' }),
    ],
    pedido_items: [item(), item({ id: 'i13', pedido_id: 'ped-13', recibido: 4 }), item({ id: 'i12', pedido_id: 'ped-12', recibido: 4 })],
  })
  it('en curso: el del período, el del que viene y los que deben; no los viejos ya recibidos', () => {
    const r = rep('2026-09-16', tres())
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([14, 13])
  })
  it('en curso, también uno viejo con una recepción sin verificar', () => {
    const r = rep('2026-09-16', COMPRA_4({
      pedidos: [cab({ id: 'ped-12', numero: 12, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })],
      pedido_items: [item({ id: 'i12', pedido_id: 'ped-12', recibido: 4, sin_verificar: 2 })],
    }))
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([12])
  })
  it('en un período cerrado: los que eran para él', () => {
    const r = armarReposicionDelPeriodo(tres(), '2026-09-16', { desde: '2026-07-29', hasta: '2026-08-28' }, CORTE)
    expect(pedidosAMostrar(r.estudios[0], r).map((p) => p.numero)).toEqual([12])
  })
})
