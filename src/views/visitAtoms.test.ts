import { describe, expect, it } from 'vitest'
import { PROTO_TONES, protoTone } from './visitAtoms'

/**
 * El tono del protocolo.
 *
 * POR QUÉ TESTEAR ESTO: `protoTone` es un hash del id del protocolo contra una paleta de cinco.
 * Si alguien lo "mejora" —otra constante, otro shift, otro módulo— **todos** los protocolos
 * cambian de color al mismo tiempo. No falla nada, no se ve nada roto, no hay error en consola:
 * simplemente ATLAS-7 deja de ser el azul que la coordinadora reconoce de un vistazo desde hace
 * meses y pasa a ser dorado. Es el caso de manual de "falla en silencio".
 *
 * Fijar tres valores convierte el hash en un contrato: se puede romper, pero hay que quererlo.
 */

describe('protoTone', () => {
  it('T13 · el mismo id da siempre el mismo tono', () => {
    const id = 'b7c1e2d4-0000-4000-8000-000000000001'
    expect(protoTone(id)).toBe(protoTone(id))
  })

  it('T14 · el tono siempre sale de la paleta', () => {
    /* Ids variados, incluidos los bordes: vacío, un carácter, y uno largo con guiones. */
    const ids = ['', 'x', 'atlas-7', 'b7c1e2d4-0000-4000-8000-000000000001', 'ñ', '0'.repeat(200)]
    for (const id of ids) expect(PROTO_TONES).toContain(protoTone(id))
  })

  /**
   * T15 — el contrato. Estos tres valores NO son arbitrarios: son los que la app viene mostrando.
   * Si este test se pone rojo, alguien cambió el hash y todos los protocolos cambiaron de color.
   * No lo "arregles" actualizando los valores esperados sin decidirlo a propósito.
   */
  it('T15 · valores fijados: cambiar el hash reordena TODOS los colores', () => {
    expect(protoTone('atlas-7')).toBe('#A8842F')
    expect(protoTone('b7c1e2d4-0000-4000-8000-000000000001')).toBe('#5C8A5A')
    expect(protoTone('x')).toBe('#3A6B8C')
  })
})
