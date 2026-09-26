import { describe, expect, it } from 'vitest'
import { agruparDiferidos, diferibles, faltanProcedimientos } from './continuacion'

/**
 * Las reglas de «pasar pendientes a otro día» que fallan en silencio:
 *  · ofrecer para diferir algo ya tildado (el servidor lo rechaza, pero con el tilde optimista puesto
 *    la pantalla lo ofrecería un instante y el error se leería como un bug);
 *  · agrupar mal los destinos: dos pases al mismo día se leerían como dos visitas, y uno sin fecha
 *    quedaría primero, antes que los que sí la tienen;
 *  · dejar agendar un retest vacío, que el servidor rechaza sin que la pantalla haya avisado.
 */
describe('diferibles', () => {
  const items = [{ procedure_id: 'lab' }, { procedure_id: 'vit' }, { procedure_id: 'hem' }]

  it('ofrece sólo lo que todavía no se hizo, contando el tilde optimista', () => {
    const hecho = (id: string) => id === 'vit'
    expect(diferibles(items, hecho).map((p) => p.procedure_id)).toEqual(['lab', 'hem'])
  })

  it('con todo hecho no ofrece nada', () => {
    expect(diferibles(items, () => true)).toEqual([])
  })
})

describe('agruparDiferidos', () => {
  const fila = (visit_id: string, procedure_name: string, estimated_date: string | null, real_date: string | null = null) =>
    ({ procedure_id: procedure_name, procedure_name, visit_id, estimated_date, real_date })

  it('junta por visita destino y ordena los nombres', () => {
    const out = agruparDiferidos([fila('c1', 'Laboratorio', '2026-09-25'), fila('c1', 'Hemograma', '2026-09-25')])
    expect(out).toEqual([{ visit_id: 'c1', fecha: '2026-09-25', procedimientos: ['Hemograma', 'Laboratorio'] }])
  })

  it('la fecha real le gana a la estimada: la continuación ya se hizo', () => {
    expect(agruparDiferidos([fila('c1', 'Laboratorio', '2026-09-25', '2026-09-26')])[0].fecha).toBe('2026-09-26')
  })

  it('ordena por fecha, y lo que no tiene fecha va al final', () => {
    const out = agruparDiferidos([
      fila('c3', 'ECG', null), fila('c2', 'Hemograma', '2026-10-02'), fila('c1', 'Laboratorio', '2026-09-25'),
    ])
    expect(out.map((d) => d.visit_id)).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('faltanProcedimientos', () => {
  it('un retest necesita al menos uno', () => {
    expect(faltanProcedimientos('retest', [])).toBe('Elegí al menos un procedimiento para el retest.')
    expect(faltanProcedimientos('retest', ['hem'])).toBeNull()
  })

  it('una VNP puede ir vacía: una consulta es una visita válida', () => {
    expect(faltanProcedimientos('vnp', [])).toBeNull()
  })
})
