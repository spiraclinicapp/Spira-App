import { describe, expect, it } from 'vitest'
import { lineaDeReposicion } from './excepcionReposicionModel'
import type { AsignacionParaLinea, ReposicionDelEstudio } from './excepcionReposicionModel'

/**
 * La excepción por paciente (plan de reposición, D2 y D27).
 *
 * Se testea porque ofrecer el control donde no corresponde falla en silencio: en un «Otro
 * medicamento» el trigger de la 0124 borra la marca de «una entrega» sin avisar.
 */

const asig = (p: Partial<AsignacionParaLinea> = {}): AsignacionParaLinea => ({ medication_id: 'ser', active: true, habilitacion_id: null, envases_por_mes: null, ...p })
const estudio = (p: Partial<ReposicionDelEstudio> = {}): ReposicionDelEstudio[] => [{ medication_id: 'ser', reposicion_modo: 'mensual', envases_por_mes: 1, ...p }]

describe('lineaDeReposicion', () => {
  it('por mes sin excepción: la del estudio, y se puede cambiar', () => {
    expect(lineaDeReposicion(asig(), estudio())).toEqual({ texto: '1 por mes, la del estudio', accion: 'cambiar', delEstudio: 1 })
  })
  it('con excepción: la del paciente, y se puede volver a la del estudio', () => {
    expect(lineaDeReposicion(asig({ envases_por_mes: 2 }), estudio())).toEqual({ texto: '2 por mes, sólo este paciente', accion: 'volver', delEstudio: 1 })
  })
  it('habilitada para una sola entrega: sin control, aunque el estudio sea por mes (D27)', () => {
    expect(lineaDeReposicion(asig({ habilitacion_id: 'hab', envases_por_mes: 2 }), estudio())).toMatchObject({ accion: null, texto: 'Para una sola entrega: no suma en las compras' })
  })
  it('a demanda, no se compra o sin cargar en el estudio: sin control', () => {
    expect(lineaDeReposicion(asig(), estudio({ reposicion_modo: 'a_demanda', envases_por_mes: null }))?.accion).toBeNull()
    expect(lineaDeReposicion(asig(), estudio({ reposicion_modo: 'no_se_compra', envases_por_mes: null }))?.accion).toBeNull()
    expect(lineaDeReposicion(asig(), estudio({ reposicion_modo: null, envases_por_mes: null }))?.texto).toBe('Todavía no se cargó cómo se repone en el estudio')
    expect(lineaDeReposicion(asig(), [])?.accion).toBeNull()
  })
  it('una inactiva no dice nada: no suma', () => {
    expect(lineaDeReposicion(asig({ active: false }), estudio())).toBeNull()
  })
})
