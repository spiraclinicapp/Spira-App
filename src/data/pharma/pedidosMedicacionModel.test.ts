import { describe, expect, it } from 'vitest'
import {
  armarPedidos, armarPorRecibir, comparacionConElPedido, encabezadoDeLoEsperado, faltaTxt, faltaVerificarTxt, faltanteDe,
  metaDelPedido, notaDeReimpresion, numerosDePedidos, pastillaDePedido, pedidoPara, pedidosParaRecibir, porRecibirDe,
  renglonesParaRecibir, sinVerificarDe, textoDePedidos, textoDeRecepciones, textoParaRecibir, ultimoPedidoPara, yaPedidoDe,
  type PedidoItemInsumo, type PedidoMedicacionInsumo, type RecepcionDePedidoInsumo,
} from './pedidosMedicacionModel'

/**
 * Pedidos de medicación (spec 2026-09-16, R8-R11 y la revisión de diseño RD2-RD4, RD8, RD17, RD18).
 *
 * Se testea porque el estado del pedido se DEDUCE de lo recibido y nadie lo marca a mano: un faltante mal
 * contado deja envases «en camino» para siempre y la compra sale corta, y una pastilla mal elegida dice
 * «Sin recibir» de algo que está en la casa sin verificar. Ninguna de las dos cosas se ve rara en pantalla.
 */

const cab = (p: Partial<PedidoMedicacionInsumo> = {}): PedidoMedicacionInsumo => ({
  id: 'ped-14', numero: 14, protocol_id: 'endura', periodo_desde: '2026-09-29', periodo_hasta: '2026-10-28',
  emitido_el: '2026-09-28', emitido_por_nombre: 'Lautaro Molina',
  anulado_at: null, anulado_por_nombre: null, anulado_motivo: null, ...p,
})
const item = (p: Partial<PedidoItemInsumo> = {}): PedidoItemInsumo => ({
  id: 'it-seretide', pedido_id: 'ped-14', medication_id: 'seretide', medication_name: 'Seretide 250/50', presentacion: 'Aerosol',
  calculado: 4, pedido: 6, cerrado_at: null, cerrado_por_nombre: null, cerrado_motivo: null, recibido: 0, sin_verificar: 0, ...p,
})
const salbutral = (p: Partial<PedidoItemInsumo> = {}) =>
  item({ id: 'it-salbu', medication_id: 'salbu', medication_name: 'Salbutral 100 mcg', calculado: 7, pedido: 7, ...p })
const recepcion = (p: Partial<RecepcionDePedidoInsumo> = {}): RecepcionDePedidoInsumo => ({
  id: 'rec-1051', pedido_id: 'ped-14', folio: 1051, reception_date: '2026-10-02', status: 'verificada',
  verified_by_name: 'Agustín Bazzani', envases: 12, ...p,
})
const CERRADO = { cerrado_at: '2026-10-05T14:00:00+00:00', cerrado_por_nombre: 'Lautaro Molina', cerrado_motivo: 'no_lo_tiene' as const }
const ANULADO = { anulado_at: '2026-09-28T15:00:00+00:00', anulado_por_nombre: 'Lautaro Molina', anulado_motivo: 'por_error' as const }
const PROXIMO = { desde: '2026-09-29', hasta: '2026-10-28' }

describe('faltanteDe', () => {
  it('es lo pedido menos lo recibido', () => {
    expect(faltanteDe(item())).toBe(6)
    expect(faltanteDe(item({ recibido: 4 }))).toBe(2)
  })
  it('recibir de más no da negativo', () => {
    expect(faltanteDe(item({ recibido: 8 }))).toBe(0)
  })
  it('un renglón cerrado con «No va a llegar» no tiene faltante (R11)', () => {
    expect(faltanteDe(item({ recibido: 5, ...CERRADO }))).toBe(0)
  })
})

describe('estado y pastilla del pedido (RD3, RD8, RD17)', () => {
  const uno = (c: Partial<PedidoMedicacionInsumo>, items: PedidoItemInsumo[], recepciones: RecepcionDePedidoInsumo[] = []) =>
    armarPedidos([cab(c)], items, recepciones)[0]

  it('sin nada recibido: sin recibir', () => {
    const p = uno({}, [item(), salbutral()])
    expect(p).toMatchObject({ estado: 'sin_recibir', pedidoTotal: 13, faltanteTotal: 13, recibidoTotal: 0 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'sin_recibir', texto: 'Sin recibir' })
  })
  it('algo recibido y algo faltante: recibido en parte', () => {
    const p = uno({}, [item({ recibido: 6 }), salbutral({ recibido: 2 })])
    expect(p).toMatchObject({ estado: 'en_parte', faltanteTotal: 5, recibidoTotal: 8 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'en_parte', texto: 'Recibido en parte' })
  })
  it('todo recibido: recibido', () => {
    const p = uno({}, [item({ recibido: 6 })])
    expect(p.estado).toBe('recibido')
    expect(pastillaDePedido(p)).toEqual({ clave: 'recibido', texto: 'Recibido' })
  })
  it('lo que no va a llegar cierra el pedido y dice cuánto faltó', () => {
    const p = uno({}, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'recibido', faltanteTotal: 0, faltoCerrado: 1 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'recibido', texto: 'Recibido · faltó 1' })
  })
  it('si se cerró todo y no llegó nada: «Cerrado · no llegó», nunca «recibido» (RD3)', () => {
    const p = uno({}, [item({ ...CERRADO }), salbutral({ ...CERRADO })])
    expect(p).toMatchObject({ estado: 'no_llego', faltanteTotal: 0, faltoCerrado: 13 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'no_llego', texto: 'Cerrado · no llegó' })
  })
  it('una recepción sin verificar le gana a «sin recibir» y a «en parte» (RD17)', () => {
    expect(pastillaDePedido(uno({}, [item({ sin_verificar: 6 })]))).toEqual({ clave: 'llego', texto: 'Llegó, falta verificar' })
    expect(pastillaDePedido(uno({}, [item({ recibido: 2, sin_verificar: 4 })])).clave).toBe('llego')
  })
  it('recibido entero no dice «llegó» aunque haya otra recepción pendiente', () => {
    expect(pastillaDePedido(uno({}, [item({ recibido: 6, sin_verificar: 2 })])).clave).toBe('recibido')
  })
  it('un pedido anulado no tiene faltante ni «faltó», aunque tenga un renglón cerrado', () => {
    const p = uno(ANULADO, [item({ recibido: 5, ...CERRADO })])
    expect(p).toMatchObject({ estado: 'anulado', faltanteTotal: 0, faltoCerrado: 0 })
    expect(pastillaDePedido(p)).toEqual({ clave: 'anulado', texto: 'Anulado' })
  })
  it('avisa si tiene una recepción sin verificar', () => {
    expect(uno({}, [item({ sin_verificar: 6 })]).conRecepcionSinVerificar).toBe(true)
    expect(uno({}, [item()]).conRecepcionSinVerificar).toBe(false)
  })
  it('junta sus recepciones por número, y sólo las suyas', () => {
    const p = uno({}, [item()], [recepcion({ id: 'r2', folio: 1060 }), recepcion(), recepcion({ id: 'otra', pedido_id: 'ped-99', folio: 1 })])
    expect(p.recepciones.map((r) => r.folio)).toEqual([1051, 1060])
  })
  it('ordena los pedidos del más nuevo al más viejo y los renglones por nombre', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-13', numero: 13 }), cab()],
      [salbutral(), item(), item({ id: 'it-13', pedido_id: 'ped-13' })],
    )
    expect(ps.map((p) => p.numero)).toEqual([14, 13])
    expect(ps[0].renglones.map((r) => r.medication_name)).toEqual(['Salbutral 100 mcg', 'Seretide 250/50'])
  })
})

describe('el pedido de un período', () => {
  it('el más nuevo que se le superpone, aunque ya esté recibido', () => {
    const ps = armarPedidos([cab({ id: 'ped-13', numero: 13 }), cab()], [item({ id: 'i13', pedido_id: 'ped-13', recibido: 6 }), item({ recibido: 6 })])
    expect(pedidoPara(ps, PROXIMO)?.numero).toBe(14)
  })
  it('por SUPERPOSICIÓN: lo sigue reconociendo si el corte se movió después de emitir (RD15)', () => {
    expect(pedidoPara(armarPedidos([cab({ periodo_desde: '2026-09-27', periodo_hasta: '2026-10-26' })], [item()]), PROXIMO)?.numero).toBe(14)
  })
  it('el del período en curso no es el del que viene', () => {
    expect(pedidoPara(armarPedidos([cab({ periodo_desde: '2026-08-29', periodo_hasta: '2026-09-28' })], [item()]), PROXIMO)).toBeNull()
  })
  it('un anulado no cuenta', () => {
    expect(pedidoPara(armarPedidos([cab(ANULADO)], [item()]), PROXIMO)).toBeNull()
  })
  it('con dos del mismo período, primero el que todavía debe: uno chico ya recibido no tapa al grande', () => {
    const ps = armarPedidos([cab(), cab({ id: 'ped-15', numero: 15 })], [item(), item({ id: 'i15', pedido_id: 'ped-15', pedido: 3, recibido: 3 })])
    expect(pedidoPara(ps, PROXIMO)?.numero).toBe(14)
  })
})

describe('el último pedido que vio la pantalla (concurrencia al emitir)', () => {
  it('el número más alto de los no anulados del período; 0 si no hay', () => {
    const cabs = [cab(), cab({ id: 'ped-15', numero: 15 }), cab({ id: 'ped-16', numero: 16, ...ANULADO }), cab({ id: 'ped-9', numero: 9, periodo_desde: '2026-07-29', periodo_hasta: '2026-08-28' })]
    expect(ultimoPedidoPara(cabs, PROXIMO)).toBe(15)
    expect(ultimoPedidoPara([], PROXIMO)).toBe(0)
  })
})

describe('lo ya pedido de un medicamento (R9)', () => {
  const pedidos = () => armarPedidos(
    [
      cab({ id: 'ped-13', numero: 13, emitido_el: '2026-08-28' }),
      cab(),
      cab({ id: 'ped-15', numero: 15, ...ANULADO }),
      cab({ id: 'ped-16', numero: 16, protocol_id: 'lts' }),
    ],
    [
      item({ id: 'i13', pedido_id: 'ped-13', pedido: 4, recibido: 3 }),
      item(),
      item({ id: 'i15', pedido_id: 'ped-15' }),
      item({ id: 'i16', pedido_id: 'ped-16' }),
    ],
  )
  it('suma el faltante de los pedidos abiertos del estudio, el más viejo primero', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'seretide')).toEqual({
      envases: 7,
      pedidos: [{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }],
    })
  })
  it('otro medicamento no tiene nada pedido', () => {
    expect(yaPedidoDe(pedidos(), 'endura', 'salbu')).toEqual({ envases: 0, pedidos: [] })
  })
})

describe('textos', () => {
  it('lo en camino de la boleta va en minúscula: está en medio de un renglón (RD12)', () => {
    expect(textoDePedidos([{ numero: 14, emitido_el: '2026-09-28' }])).toBe('pedido Nº 14 del 28/09')
    expect(textoDePedidos([{ numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' }])).toBe('pedidos Nº 13 y Nº 14')
    expect(textoDePedidos([
      { numero: 12, emitido_el: '2026-07-28' }, { numero: 13, emitido_el: '2026-08-28' }, { numero: 14, emitido_el: '2026-09-28' },
    ])).toBe('pedidos Nº 12, Nº 13 y Nº 14')
  })
  it('el renglón de la tarjeta encabeza, sin fecha (RD4)', () => {
    expect(numerosDePedidos([{ numero: 13 }])).toBe('Pedido Nº 13')
    expect(numerosDePedidos([{ numero: 12 }, { numero: 13 }])).toBe('Pedidos Nº 12 y Nº 13')
  })
  it('lo que falta y las recepciones, en singular y en plural', () => {
    expect(faltaTxt(1)).toBe('falta 1 envase')
    expect(faltaTxt(13)).toBe('faltan 13 envases')
    expect(textoDeRecepciones([1051])).toBe('Recepción Nº 1051')
    expect(textoDeRecepciones([1051, 1052])).toBe('Recepciones Nº 1051 y Nº 1052')
    expect(textoDeRecepciones([])).toBe('Una recepción')
  })
  it('lo en camino que ya llegó y falta verificar (RD17)', () => {
    expect(faltaVerificarTxt([1051])).toBe('llegó, falta verificar la recepción Nº 1051')
    expect(faltaVerificarTxt([1051, 1052])).toBe('llegaron, falta verificar las recepciones Nº 1051 y Nº 1052')
    const ps = armarPedidos([cab()], [item({ sin_verificar: 6 })], [recepcion({ status: 'pendiente', verified_by_name: null })])
    expect(sinVerificarDe(ps, 'endura', 'seretide')).toEqual([1051])
    expect(sinVerificarDe(ps, 'endura', 'salbu')).toBeNull()
    expect(sinVerificarDe(armarPedidos([cab()], [item()]), 'endura', 'seretide')).toBeNull()
  })
})

describe('Recepción: qué se puede recibir (R10)', () => {
  it('sólo los pedidos no anulados con faltante, del más viejo al más nuevo', () => {
    const ps = armarPedidos(
      [cab({ id: 'ped-11', numero: 11 }), cab({ id: 'ped-12', numero: 12 }), cab({ id: 'ped-13', numero: 13, ...ANULADO }), cab()],
      [
        item({ id: 'i11', pedido_id: 'ped-11' }),
        item({ id: 'i12', pedido_id: 'ped-12', recibido: 6 }),
        item({ id: 'i13', pedido_id: 'ped-13' }),
        item(),
      ],
    )
    expect(pedidosParaRecibir(ps).map((p) => p.numero)).toEqual([11, 14])
  })
  it('precarga sólo los renglones con faltante, con lo que falta', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 2 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 4 }])
  })
  it('no vuelve a precargar lo que ya está en una recepción sin verificar (revisión de ingeniería, 8)', () => {
    const p = armarPedidos([cab()], [item({ sin_verificar: 4 }), salbutral({ sin_verificar: 7 })])[0]
    expect(renglonesParaRecibir(p)).toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', cantidad: 2 }])
    expect(porRecibirDe(p)).toBe(2)
    expect(porRecibirDe(armarPedidos([cab()], [item({ sin_verificar: 6 })])[0])).toBe(0)
  })
  it('la lista dice cuándo se emitió y cuánto falta de cuántos medicamentos', () => {
    expect(textoParaRecibir(armarPedidos([cab()], [item(), salbutral()])[0])).toBe('Emitido el 28/09 · faltan 13 envases de 2 medicamentos')
    expect(textoParaRecibir(armarPedidos([cab()], [item({ recibido: 5 }), salbutral({ recibido: 7 })])[0]))
      .toBe('Emitido el 28/09 · falta 1 envase de 1 medicamento')
  })
  it('arma la lista con el estudio de cada pedido y sus recepciones', () => {
    const lista = armarPorRecibir({
      estudios: [{ id: 'endura', code: '222714', name: 'ENDURA' }],
      pedidos: [cab(), cab({ id: 'ped-13', numero: 13 })],
      pedido_items: [item(), item({ id: 'i13', pedido_id: 'ped-13' })],
      recepciones: [recepcion({ status: 'pendiente', verified_by_name: null })],
    })
    expect(lista.map((x) => [x.pedido.numero, x.estudio.code])).toEqual([[13, '222714'], [14, '222714']])
    expect(lista[1].pedido.recepciones.map((r) => r.folio)).toEqual([1051])
    expect(lista[0].otrosDelEstudio.map((o) => o.numero)).toEqual([14])
  })
})

describe('el asistente recibiendo un pedido (R10, RD18)', () => {
  const p = () => armarPedidos([cab()], [item({ recibido: 5 }), salbutral()])[0]
  it('al lado de cada medicamento dice qué se pidió', () => {
    expect(metaDelPedido(p(), 'salbu')).toEqual({ texto: 'se pidieron 7', aviso: false })
    expect(metaDelPedido(p(), 'seretide')).toEqual({ texto: 'falta 1 de 6', aviso: false })
    expect(metaDelPedido(p(), 'budeso')).toEqual({ texto: 'No estaba en el pedido', aviso: true })
  })
  it('lo que ya no faltaba se recibe igual, avisado', () => {
    expect(metaDelPedido(armarPedidos([cab()], [item({ recibido: 6 })])[0], 'seretide')).toEqual({ texto: 'No faltaba', aviso: true })
  })
  it('el resumen compara lo que faltaba con lo que llega', () => {
    expect(comparacionConElPedido(p(), [
      { medicationId: 'salbu', name: 'Salbutral 100 mcg', quantity: 7 },
      { medicationId: 'budeso', name: 'Budesonida 200 mcg', quantity: 2 },
    ])).toEqual([
      { medicationId: 'salbu', nombre: 'Salbutral 100 mcg', esperado: 7, llega: 7, nota: 'Completo', aviso: false },
      { medicationId: 'seretide', nombre: 'Seretide 250/50', esperado: 1, llega: 0, nota: 'Queda 1 en camino', aviso: true },
      { medicationId: 'budeso', nombre: 'Budesonida 200 mcg', esperado: null, llega: 2, nota: 'No estaba en el pedido: se recibe igual', aviso: true },
    ])
  })
  it('de más también se dice, y el plural se respeta', () => {
    const filas = comparacionConElPedido(armarPedidos([cab()], [item(), salbutral()])[0], [
      { medicationId: 'seretide', name: 'Seretide 250/50', quantity: 3 },
      { medicationId: 'salbu', name: 'Salbutral 100 mcg', quantity: 9 },
    ])
    expect(filas.map((f) => f.nota)).toEqual(['Completo, con 2 de más', 'Quedan 3 en camino'])
  })
  it('la columna dice «Pedido» la primera vez y «Faltaba» si ya llegó algo', () => {
    expect(encabezadoDeLoEsperado(armarPedidos([cab()], [item()])[0])).toBe('Pedido')
    expect(encabezadoDeLoEsperado(p())).toBe('Faltaba')
  })
  it('si lo espera otro pedido del estudio, lo nombra (revisión de ingeniería, 9)', () => {
    const trece = armarPedidos([cab({ id: 'ped-13', numero: 13 })], [
      item({ id: 'i13', pedido_id: 'ped-13', medication_id: 'budeso', medication_name: 'Budesonida 200 mcg', pedido: 2 }),
    ])
    expect(metaDelPedido(p(), 'budeso', trece)).toEqual({ texto: 'Se debe en el Pedido Nº 13: recibilo con ese', aviso: true })
    expect(comparacionConElPedido(p(), [{ medicationId: 'budeso', name: 'Budesonida 200 mcg', quantity: 2 }], trece).at(-1)?.nota)
      .toBe('Se debe en el Pedido Nº 13: recibilo con ese')
    const treceSeretide = armarPedidos([cab({ id: 'ped-13', numero: 13 })], [item({ id: 'i13', pedido_id: 'ped-13', pedido: 2 })])
    expect(comparacionConElPedido(p(), [{ medicationId: 'seretide', name: 'Seretide 250/50', quantity: 3 }], treceSeretide)[1])
      .toMatchObject({ nota: 'Completo, con 2 de más: se deben en el Pedido Nº 13', aviso: true })
  })
  it('lo que llega de un renglón que ya no faltaba se dice así, no «de más»', () => {
    const lleno = armarPedidos([cab()], [item({ recibido: 6 })])[0]
    expect(comparacionConElPedido(lleno, [{ medicationId: 'seretide', name: 'Seretide 250/50', quantity: 2 }]))
      .toEqual([{ medicationId: 'seretide', nombre: 'Seretide 250/50', esperado: 0, llega: 2, nota: 'No faltaba: se recibe igual', aviso: true }])
  })
})

describe('la hoja reimpresa (revisión de ingeniería, 10)', () => {
  it('cada renglón dice lo que ya llegó, lo que falta y lo que no va a llegar', () => {
    const p = armarPedidos([cab()], [
      item({ recibido: 5 }),
      salbutral({ recibido: 7 }),
      item({ id: 'it-monte', medication_id: 'monte', medication_name: 'Montelukast 10 mg', pedido: 3, ...CERRADO }),
    ])[0]
    expect(p.renglones.map((r) => [r.medication_name, notaDeReimpresion(r)])).toEqual([
      ['Montelukast 10 mg', 'no va a llegar'],
      ['Salbutral 100 mcg', 'recibido 7'],
      ['Seretide 250/50', 'recibido 5 · falta 1'],
    ])
  })
  it('sin nada recibido, el renglón queda como en la hoja original', () => {
    expect(notaDeReimpresion(armarPedidos([cab()], [item()])[0].renglones[0])).toBeNull()
  })
})
