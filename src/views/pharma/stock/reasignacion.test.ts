import { describe, expect, it } from 'vitest'
import type { ProtocolRow } from '../../../data/protocols'
import { AMBULATORIA_VALUE, destinosPara, validarCantidad } from './reasignacion'

/**
 * Las reglas de "Reasignar stock".
 *
 * POR QUÉ ESTAS DOS Y NO OTRAS: son las que fallan EN SILENCIO. Un desplegable que ofrece el
 * ámbito donde el lote YA está se ve perfecto — el error aparece recién cuando la base rechaza
 * algo que la pantalla ofreció, y parece una falla del sistema. Uno que ofrece un estudio cerrado
 * ni siquiera falla: la operación entra, y el hallazgo lo encuentra una auditoría. El aviso de
 * lote vencido, el layout y el desplegable de motivo fallan de manera VISIBLE y se verifican
 * mirando.
 *
 * Sin base y sin navegador: funciones puras sobre `ProtocolRow` y texto de un input.
 */

/** Protocolo mínimo. Sólo importan `id`, `code`, `name` y `status`; el resto va en null porque
 *  ninguna regla de este módulo los mira. */
function proto(over: { id?: string; code?: string; name?: string; status?: ProtocolRow['status'] } = {}): ProtocolRow {
  return {
    id: over.id ?? 'p1',
    code: over.code ?? 'ONC-014',
    name: over.name ?? 'Estudio Vega',
    sponsor: null,
    status: over.status ?? 'activo',
    description: null,
    principal_investigator: null,
    specialty: null,
    internal_code: null,
  }
}

describe('destinosPara — a dónde puede ir un lote', () => {
  const tres = [
    proto({ id: 'p1', code: 'CAR-007', name: 'Cardio Fase II' }),
    proto({ id: 'p2', code: 'ONC-014', name: 'Estudio Vega' }),
    proto({ id: 'p3', code: 'RES-003', name: 'Respiratorio' }),
  ]

  /* Es el no-op invisible: la base lo rechaza, así que ofrecerlo garantiza un error que el
     usuario no provocó. */
  it('nunca ofrece el protocolo donde el lote ya está', () => {
    const d = destinosPara('p2', tres)
    expect(d.map((o) => o.value)).not.toContain('p2')
  })

  it('ofrece los demás protocolos y Ambulatoria', () => {
    const d = destinosPara('p2', tres)
    expect(d.map((o) => o.value)).toEqual(['p1', 'p3', AMBULATORIA_VALUE])
  })

  it('un lote ambulatorio no puede ir a Ambulatoria', () => {
    const d = destinosPara(null, tres)
    expect(d.map((o) => o.value)).not.toContain(AMBULATORIA_VALUE)
  })

  it('un lote ambulatorio puede ir a cualquier protocolo abierto', () => {
    const d = destinosPara(null, tres)
    expect(d.map((o) => o.value)).toEqual(['p1', 'p2', 'p3'])
  })

  /* Meter medicación en un estudio terminado es un hallazgo de auditoría, y la pantalla es el
     único lugar donde se puede evitar antes de que ocurra. */
  it('deja afuera los protocolos cerrados', () => {
    const d = destinosPara('p1', [...tres, proto({ id: 'p9', code: 'DER-002', status: 'cerrado' })])
    expect(d.map((o) => o.value)).not.toContain('p9')
  })

  /* Pausado NO es cerrado: es un estudio vivo detenido, y reponerle stock es lo que se hace al
     reanudarlo. Confundirlos dejaría sin destino a media farmacia. */
  it('un protocolo pausado SÍ es un destino válido', () => {
    const d = destinosPara('p1', [proto({ id: 'p8', code: 'PAU-001', status: 'pausado' })])
    expect(d.map((o) => o.value)).toEqual(['p8', AMBULATORIA_VALUE])
  })

  it('la etiqueta de un protocolo es "CÓDIGO — Nombre", como el filtro del toolbar', () => {
    const [primero] = destinosPara(null, [proto({ id: 'p1', code: 'CAR-007', name: 'Cardio Fase II' })])
    expect(primero.label).toBe('CAR-007 — Cardio Fase II')
  })

  it('cada opción lleva el destino que el RPC espera', () => {
    const d = destinosPara('p1', tres)
    expect(d[0].destino).toEqual({ tipo: 'protocolo', protocolId: 'p2' })
    expect(d[d.length - 1].destino).toEqual({ tipo: 'ambulatoria' })
  })

  /* Sin otro estudio abierto queda Ambulatoria sola; y un lote ambulatorio sin protocolos no
     tiene a dónde ir. El modal necesita distinguir esos dos casos para no mostrar un
     desplegable vacío sin explicación. */
  it('sin otros protocolos abiertos queda sólo Ambulatoria', () => {
    const d = destinosPara('p1', [proto({ id: 'p1' }), proto({ id: 'p9', status: 'cerrado' })])
    expect(d.map((o) => o.value)).toEqual([AMBULATORIA_VALUE])
  })

  it('un lote ambulatorio sin protocolos abiertos no tiene destino', () => {
    expect(destinosPara(null, [proto({ id: 'p9', status: 'cerrado' })])).toEqual([])
  })
})

describe('validarCantidad — cuánto se puede mover', () => {
  it('vacío pide una cantidad', () => {
    expect(validarCantidad('', 40)).toEqual({ ok: false, error: 'Ingresá cuántas unidades querés mover.' })
    expect(validarCantidad('   ', 40).ok).toBe(false)
  })

  it('lo que no es número lo dice como tal', () => {
    const r = validarCantidad('abc', 40)
    expect(r).toEqual({ ok: false, error: 'La cantidad tiene que ser un número.' })
  })

  /* Las unidades son enteras: media caja no existe, y `Number('2.5')` es finito, así que sin este
     control pasaría derecho hasta la base. */
  it('rechaza los decimales con su propio mensaje', () => {
    expect(validarCantidad('2.5', 40)).toEqual({
      ok: false,
      error: 'La cantidad tiene que ser un número entero.',
    })
  })

  it('cero y negativos no son un traslado', () => {
    expect(validarCantidad('0', 40).ok).toBe(false)
    expect(validarCantidad('-3', 40).ok).toBe(false)
    expect(validarCantidad('0', 40)).toEqual({
      ok: false,
      error: 'La cantidad tiene que ser mayor que cero.',
    })
  })

  /* El mensaje nombra el disponible: "no podés mover 41" sin decir cuántas hay obliga a cerrar el
     modal para averiguarlo. */
  it('pasarse del stock lo dice nombrando cuánto hay', () => {
    expect(validarCantidad('41', 40)).toEqual({
      ok: false,
      error: 'En el lote hay 40 unidades: no podés mover 41.',
    })
    expect(validarCantidad('2', 1)).toEqual({
      ok: false,
      error: 'En el lote hay 1 unidad: no podés mover 2.',
    })
  })

  /* El borde que la gente rompe: mover el lote ENTERO es válido y deja el origen en cero, que es
     lo que pasa cuando se llevan todas las cajas. */
  it('mover todo el lote es válido', () => {
    expect(validarCantidad('40', 40)).toEqual({ ok: true, cantidad: 40 })
  })

  it('mover una unidad es válido', () => {
    expect(validarCantidad('1', 40)).toEqual({ ok: true, cantidad: 1 })
  })

  it('no se puede mover nada de un lote agotado', () => {
    expect(validarCantidad('1', 0).ok).toBe(false)
  })
})
