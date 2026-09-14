import { describe, expect, it } from 'vitest'
import type { ContextoDispensacionRow } from '../../data/pharma/dispensationModel'
import { avisoIp, avisoRojo, dentroDeLaVentana, listaY, mismaDroga } from './avisoReciente'
import { saldosDeLaVisita } from './saldoModel'

/**
 * El aviso de entrega reciente, por droga y entre protocolos (plan D14, D24, D25 y R7).
 *
 * Se testea porque un aviso que no salta se ve igual que uno que no tenía por qué saltar. Los
 * instantes van en `+00:00` (como los manda PostgREST) y `ahora` es fijo: el CI corre en UTC.
 */

const AHORA = new Date('2026-09-14T13:00:00+00:00') // 14/09 10:00 en Argentina

const vacia: ContextoDispensacionRow = {
  tipo: 'entrega', item_id: null, medication_id: null, medication_name: null, dosis: null, unit: null,
  drug_id: null, drug_name: null, instante: null, protocol_code: null, visit_code: null, es_esta_visita: false,
  indicado: null, entregado: null, en_camino: null, habilitado: null, ip_kits: null,
}
const fila = (p: Partial<ContextoDispensacionRow>): ContextoDispensacionRow => ({ ...vacia, ...p })

const omeprazol20 = { medication_id: 'ome20', drug_id: 'omeprazol', medication_name: 'Omeprazol 20 mg', drug_name: 'Omeprazol' }
const elegido40 = { medication_id: 'ome40', drug_id: 'omeprazol', esSaldo: false }

describe('dentroDeLaVentana', () => {
  it('30 días de calendario en hora argentina, con el borde incluido', () => {
    // 15/08 00:30 AR = 15/08 03:30 UTC: el primer día de la ventana.
    expect(dentroDeLaVentana('2026-08-15T03:30:00+00:00', AHORA)).toBe(true)
    // 14/08 22:00 AR = 15/08 01:00 UTC: en UTC parece el 15, pero en Argentina es el 14 → afuera.
    expect(dentroDeLaVentana('2026-08-15T01:00:00+00:00', AHORA)).toBe(false)
  })
})

describe('mismaDroga', () => {
  it('por droga si las dos la tienen; si no, por el medicamento', () => {
    expect(mismaDroga({ medication_id: 'a', drug_id: 'd' }, { medication_id: 'b', drug_id: 'd' })).toBe(true)
    expect(mismaDroga({ medication_id: 'a', drug_id: 'd' }, { medication_id: 'a', drug_id: 'e' })).toBe(false)
    expect(mismaDroga({ medication_id: 'a', drug_id: null }, { medication_id: 'a', drug_id: 'd' })).toBe(true)
    expect(mismaDroga({ medication_id: 'a', drug_id: null }, { medication_id: 'b', drug_id: 'd' })).toBe(false)
  })
})

describe('avisoRojo', () => {
  it('la misma droga en otra presentación y en OTRO protocolo da rojo, con droga, fecha y protocolo', () => {
    const ctx = [fila({ ...omeprazol20, instante: '2026-09-05T15:00:00+00:00', protocol_code: 'PROT-B' })]
    expect(avisoRojo(ctx, [elegido40], [], AHORA)).toEqual({
      titulo: 'Este paciente recibió omeprazol en los últimos 30 días',
      lineas: ['Omeprazol 20 mg · 05/09/2026 · PROT-B'],
    })
  })

  it('entregado hoy en ESTA visita también da rojo (R7)', () => {
    const ctx = [fila({ ...omeprazol20, instante: '2026-09-14T12:00:00+00:00', es_esta_visita: true, protocol_code: 'PROT-A' })]
    expect(avisoRojo(ctx, [elegido40], [], AHORA)).not.toBeNull()
  })

  it('sin droga cargada compara por el medicamento', () => {
    const ctx = [fila({ medication_id: 'x', medication_name: 'Xolair', instante: '2026-09-10T12:00:00+00:00' })]
    expect(avisoRojo(ctx, [{ medication_id: 'x', drug_id: null, esSaldo: false }], [], AHORA)?.titulo)
      .toBe('Este paciente recibió Xolair en los últimos 30 días')
    expect(avisoRojo(ctx, [{ medication_id: 'y', drug_id: null, esSaldo: false }], [], AHORA)).toBeNull()
  })

  it('fuera de la ventana no avisa; nada elegido tampoco', () => {
    const ctx = [fila({ ...omeprazol20, instante: '2026-08-01T12:00:00+00:00' })]
    expect(avisoRojo(ctx, [elegido40], [], AHORA)).toBeNull()
    expect(avisoRojo([fila({ ...omeprazol20, instante: '2026-09-10T12:00:00+00:00' })], [], [], AHORA)).toBeNull()
  })

  it('un pedido abierto sin retirar da rojo, sin importar la fecha', () => {
    const ctx = [fila({ ...omeprazol20, tipo: 'abierto', instante: '2026-07-01T12:00:00+00:00', protocol_code: 'PROT-B' })]
    expect(avisoRojo(ctx, [elegido40], [], AHORA)).toEqual({
      titulo: 'Este paciente tiene pedido omeprazol sin retirar',
      lineas: ['Omeprazol 20 mg · pedido el 01/07/2026 en PROT-B, todavía sin retirar'],
    })
  })

  it('varias drogas: una caja, un título y una línea por droga con la entrega más nueva (D25)', () => {
    const ctx = [
      fila({ ...omeprazol20, instante: '2026-09-01T12:00:00+00:00', protocol_code: 'PROT-B' }),
      fila({ ...omeprazol20, instante: '2026-09-05T12:00:00+00:00', protocol_code: 'PROT-A' }),
      fila({ medication_id: 'bud', drug_id: 'budesonida', medication_name: 'Budesonida 200', drug_name: 'Budesonida', instante: '2026-09-02T12:00:00+00:00', protocol_code: 'PROT-A' }),
    ]
    const a = avisoRojo(ctx, [elegido40, { medication_id: 'bud', drug_id: 'budesonida', esSaldo: false }], [], AHORA)
    expect(a?.titulo).toBe('Este paciente recibió omeprazol y budesonida en los últimos 30 días')
    expect(a?.lineas).toEqual(['Omeprazol 20 mg · 05/09/2026 · PROT-A', 'Budesonida 200 · 02/09/2026 · PROT-A'])
  })

  it('el saldo mismo no es una entrega repetida: no avisa (D24)', () => {
    const ctx = [
      fila({ medication_id: 'fen', drug_id: 'fluti', medication_name: 'Fenisona', drug_name: 'Fluticasona', instante: '2026-09-13T12:00:00+00:00' }),
      fila({ tipo: 'indicacion', item_id: 'orig', medication_id: 'fen', drug_id: 'fluti', medication_name: 'Fenisona', indicado: 2, entregado: 1, en_camino: 0, habilitado: true, instante: '2026-09-13T12:00:00+00:00' }),
    ]
    const locales = [{ medication_id: 'fen', quantity: 1, saldo_de_item_id: 'orig' }]
    const saldos = saldosDeLaVisita(ctx, locales)
    expect(avisoRojo(ctx, [{ medication_id: 'fen', drug_id: 'fluti', esSaldo: true }], saldos, AHORA)).toBeNull()
  })

  it('la misma droga como renglón NORMAL con saldo abierto: rojo, con la pista (D24)', () => {
    const ctx = [
      fila({ tipo: 'indicacion', item_id: 'orig', medication_id: 'fen', drug_id: 'fluti', medication_name: 'Fenisona', drug_name: 'Fluticasona', indicado: 2, entregado: 1, en_camino: 0, habilitado: true, instante: '2026-07-01T12:00:00+00:00' }),
    ]
    const saldos = saldosDeLaVisita(ctx, [])
    expect(avisoRojo(ctx, [{ medication_id: 'fen', drug_id: 'fluti', esSaldo: false }], saldos, AHORA)).toEqual({
      titulo: 'Este paciente tiene saldo de fluticasona sin pedir',
      lineas: ['Tiene saldo de 1 envase de Fenisona: pedilo con «Pedir el saldo».'],
    })
  })
})

describe('avisoIp', () => {
  it('la última entrega de IP en 30 días, con kits y visita', () => {
    const ctx = [
      fila({ tipo: 'ip', instante: '2026-09-02T15:00:00+00:00', ip_kits: 1, visit_code: 'V5' }),
      fila({ tipo: 'ip', instante: '2026-09-12T15:00:00+00:00', ip_kits: 2, visit_code: 'V6' }),
    ]
    expect(avisoIp(ctx, AHORA)).toEqual({
      titulo: 'Ya se entregó producto en investigación hace 2 días',
      lineas: ['12/09/2026 · 2 kits · en la visita V6. Revisá que no sea una entrega repetida.'],
    })
  })

  it('fuera de la ventana, nada', () => {
    expect(avisoIp([fila({ tipo: 'ip', instante: '2026-07-01T15:00:00+00:00', ip_kits: 1 })], AHORA)).toBeNull()
  })
})

describe('listaY', () => {
  it('une en castellano', () => {
    expect(listaY(['a'])).toBe('a')
    expect(listaY(['a', 'b'])).toBe('a y b')
    expect(listaY(['a', 'b', 'c'])).toBe('a, b y c')
  })
})
