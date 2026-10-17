/**
 * El archivo de preguntas falla en silencio de dos maneras: un `id` repetido o cambiado rompe el enlace desde el
 * buscador global (abre el panel sin desplegar nada), y un `modulo` mal escrito esconde la pregunta para todos
 * (`preguntasVisibles` no la reconoce como general ni como de ningún módulo habilitado). Estos tests fijan la
 * forma; que cada respuesta sea CIERTA no lo puede chequear un test — eso se revisa en la PR (ver cabecera de
 * `preguntas.ts`).
 */
import { describe, expect, it } from 'vitest'
import { PREGUNTAS } from './preguntas'
import { preguntasVisibles } from './reglas'
import { TUTORIALES } from './tutoriales'
import type { Meta } from './catalogo'
import META from './tutoriales.meta.json'

describe('preguntas frecuentes', () => {
  it('hay preguntas de las tres clases', () => {
    const modulos = new Set(PREGUNTAS.map((p) => p.modulo))
    expect(modulos).toEqual(new Set(['general', 'track', 'pharma']))
  })

  it('los ids son únicos y en minúsculas con guiones (los usa el buscador para abrir la respuesta)', () => {
    const ids = PREGUNTAS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('cada pregunta es una pregunta y cada respuesta tiene texto', () => {
    for (const p of PREGUNTAS) {
      expect(p.pregunta, p.id).toMatch(/^¿.+\?$/)
      expect(p.respuesta.trim().length, p.id).toBeGreaterThan(40)
      expect(p.respuesta, p.id).not.toMatch(/ {2}/)
    }
  })

  it('ninguna respuesta es un muro: hasta ~700 caracteres', () => {
    for (const p of PREGUNTAS) expect(p.respuesta.length, p.id).toBeLessThanOrEqual(700)
  })

  it('con todos los módulos se ven todas; sin módulos, solo las generales', () => {
    expect(preguntasVisibles(PREGUNTAS, () => true)).toHaveLength(PREGUNTAS.length)
    expect(preguntasVisibles(PREGUNTAS, () => false).every((p) => p.modulo === 'general')).toBe(true)
  })

  it('el tutorial que enlaza una respuesta existe en el catálogo (si no, el «Ver cómo se hace» no sale nunca)', () => {
    for (const p of PREGUNTAS) if (p.tutorial) expect(TUTORIALES.some((t) => t.id === p.tutorial), p.id).toBe(true)
  })
  it('el capítulo de una respuesta existe en el video publicado de su tutorial (una regrabación puede renombrarlo)', () => {
    const meta = META as Meta
    for (const p of PREGUNTAS) {
      if (!p.capitulo) continue
      expect(p.tutorial, `${p.id}: «capitulo» sin «tutorial»`).toBeTruthy()
      const m = meta[p.tutorial!]
      if (m) expect(m.capitulos.map((c) => c.titulo), p.id).toContain(p.capitulo)
    }
  })
  it('los rótulos de botones van entre comillas latinas, no rectas', () => {
    for (const p of PREGUNTAS) expect(p.respuesta, p.id).not.toMatch(/"/)
  })
})
