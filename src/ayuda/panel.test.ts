/**
 * Las reglas del panel de Ayuda v2 (`panel.ts`). Fallan escondiendo: una pestaña que no sale, un tutorial que no
 * se carga, una pregunta que no aparece en ningún lado. Ninguna de esas cosas se ve «rota». La pantalla en sí se
 * verifica mirando.
 */
import { describe, expect, it } from 'vitest'
import type { MetaTutorial, Publicado } from './catalogo'
import { DESTACADOS } from './destacados'
import { buscarEnAyuda, destacadosVisibles, pestañasVisibles, preguntasDeLaPestaña, tutorialInicial } from './panel'
import { PREGUNTAS } from './preguntas'
import { preguntasVisibles } from './reglas'
import type { Pregunta } from './reglas'
import { TUTORIALES } from './tutoriales'

const meta = (over: Partial<MetaTutorial> = {}): MetaTutorial =>
  ({ version: 'a1b2c3d4', duracionMs: 40_000, capitulos: [], transcripcion: [], ...over })
const pub = (id: string, modulo: Publicado['modulo'], vista?: string, m: Partial<MetaTutorial> = {}): Publicado =>
  ({ id, modulo, vista, titulo: `Título ${id}`, resumen: `Resumen ${id}`, descripcion: `Descripción ${id}`, meta: meta(m) })
const preg = (id: string, modulo: Pregunta['modulo'], tutorial?: string): Pregunta =>
  ({ id, modulo, pregunta: `¿${id}?`, respuesta: `Respuesta de ${id}`, tutorial })

describe('pestañasVisibles', () => {
  it('orden fijo: Inicio · Primeros pasos · Coordinación · Farmacia', () => {
    expect(pestañasVisibles(() => true)).toEqual(['inicio', 'general', 'track', 'pharma'])
  })
  it('las de módulo sólo con el módulo habilitado; Inicio y Primeros pasos, siempre', () => {
    expect(pestañasVisibles((m) => m === 'pharma')).toEqual(['inicio', 'general', 'pharma'])
    expect(pestañasVisibles(() => false)).toEqual(['inicio', 'general'])
  })
})

describe('tutorialInicial', () => {
  const lista = [pub('conocer', 'pharma', 'pharma/protocolos'), pub('dispensar', 'pharma', 'pharma/dispensaciones'), pub('otro', 'pharma')]
  it('el de la pantalla donde estás', () => {
    expect(tutorialInicial(lista, 'pharma', 'pharma/dispensaciones', new Set(['dispensar']))?.id).toBe('dispensar')
  })
  it('si la pantalla no tiene, el primero sin ver; si vio todos, el primero', () => {
    expect(tutorialInicial(lista, 'pharma', 'pharma/stock', new Set(['conocer']))?.id).toBe('dispensar')
    expect(tutorialInicial(lista, 'pharma', null, new Set(['conocer', 'dispensar', 'otro']))?.id).toBe('conocer')
  })
  it('una pantalla de OTRO módulo no cuenta, y un módulo sin tutoriales da null', () => {
    const conTrack = [...lista, pub('atender', 'track', 'track/visitas')]
    expect(tutorialInicial(conTrack, 'pharma', 'track/visitas', new Set())?.id).toBe('conocer')
    expect(tutorialInicial(lista, 'general', null, new Set())).toBeNull()
  })
})

describe('preguntasDeLaPestaña', () => {
  const preguntas = [
    preg('suelta', 'pharma'),
    preg('del-dispensar', 'pharma', 'dispensar'),
    preg('de-uno-sin-publicar', 'pharma', 'recepcion'),
    preg('de-otro-publicado', 'pharma', 'nueva'),
    preg('de-track', 'track'),
  ]
  const publicados = new Set(['dispensar', 'nueva'])
  it('primero las del tutorial cargado, después las sueltas del módulo', () => {
    expect(preguntasDeLaPestaña(preguntas, publicados, 'pharma', 'dispensar').map((p) => p.id))
      .toEqual(['del-dispensar', 'suelta', 'de-uno-sin-publicar'])
  })
  it('CRÍTICO · una pregunta atada a un tutorial SIN PUBLICAR cuenta como suelta (si no, no aparece en ningún lado)', () => {
    expect(preguntasDeLaPestaña(preguntas, publicados, 'pharma', null).map((p) => p.id)).toContain('de-uno-sin-publicar')
  })
  it('las de otro tutorial publicado esperan a que se cargue el suyo', () => {
    expect(preguntasDeLaPestaña(preguntas, publicados, 'pharma', 'dispensar').map((p) => p.id)).not.toContain('de-otro-publicado')
    expect(preguntasDeLaPestaña(preguntas, publicados, 'pharma', 'nueva').map((p) => p.id)[0]).toBe('de-otro-publicado')
  })
  it('sin repetir, aunque el tutorial pedido no esté publicado', () => {
    const ids = preguntasDeLaPestaña(preguntas, publicados, 'pharma', 'recepcion').map((p) => p.id)
    expect(ids.filter((x) => x === 'de-uno-sin-publicar')).toHaveLength(1)
  })
})

describe('buscarEnAyuda', () => {
  const tutoriales = [pub('dispensar', 'pharma', undefined, { capitulos: [{ inicioMs: 0, titulo: 'Escanear', texto: 'Pasá cada unidad por el lector.' }] })]
  const preguntas = [preg('lote', 'pharma'), preg('campana', 'general')]
  it('EL VACÍO FALSO: busca en todos los módulos visibles, no en la pestaña donde estás', () => {
    // Parado en Coordinación, buscando «recepción» (que es de Farmacia): no hay pestaña que la esconda.
    const visibles = preguntasVisibles([preg('t1', 'track'), { ...preg('f1', 'pharma'), pregunta: '¿Cómo registro una recepción?' }], () => true)
    expect(buscarEnAyuda(visibles, [], 'recepcion').map((r) => (r.tipo === 'pregunta' ? r.pregunta.id : ''))).toEqual(['f1'])
  })
  it('nunca encuentra lo que el usuario no puede ver (recibe lo ya filtrado)', () => {
    const visibles = preguntasVisibles([{ ...preg('t1', 'track'), pregunta: '¿Cómo marco la llegada?' }], (m) => m === 'pharma')
    expect(buscarEnAyuda(visibles, [], 'llegada')).toEqual([])
  })
  it('sin texto, nada (el panel muestra las pestañas)', () => {
    expect(buscarEnAyuda(preguntas, tutoriales, '   ')).toEqual([])
  })
  it('encuentra un tutorial por el texto de un capítulo, y primero los tutoriales', () => {
    const r = buscarEnAyuda([...preguntas, { ...preg('lector', 'pharma'), respuesta: 'Sobre el lector de códigos.' }], tutoriales, 'lector')
    expect(r.map((x) => (x.tipo === 'tutorial' ? `t:${x.tutorial.id}` : `p:${x.pregunta.id}`))).toEqual(['t:dispensar', 'p:lector'])
  })
})

describe('«Lo esencial»', () => {
  it('cada destacado existe en el catálogo o en las preguntas (si no, desaparece sin avisar)', () => {
    for (const d of DESTACADOS) {
      const existe = d.tipo === 'tutorial' ? TUTORIALES.some((t) => t.id === d.id) : PREGUNTAS.some((p) => p.id === d.id)
      expect(existe, `${d.tipo} ${d.id}`).toBe(true)
    }
  })
  it('saca lo que el usuario no ve, y respeta el orden', () => {
    const r = destacadosVisibles(
      [{ tipo: 'tutorial', id: 'dispensar' }, { tipo: 'pregunta', id: 'de-track' }, { tipo: 'pregunta', id: 'campana' }],
      [preg('campana', 'general')],
      [],
    )
    expect(r.map((x) => (x.tipo === 'pregunta' ? x.pregunta.id : x.tutorial.id))).toEqual(['campana'])
  })
})
