import { describe, expect, it } from 'vitest'
import { MODULES } from '../modules/registry'
import {
  baseDeTutoriales, buscarTutoriales, capituloActual, duracionCorta, duracionHablada, motivoDelError, progresoDelCapitulo, publicados,
  siguienteDe, tutorialDeLaVista, tutorialesDelAlcance, urlDelTutorial, visiblesPara,
} from './catalogo'
import type { Meta, MetaTutorial, Publicado } from './catalogo'
import META from './tutoriales.meta.json'
import { TUTORIALES } from './tutoriales'
import type { Tutorial } from './tutoriales'
import { alcanzaParaVisto, CLAVE_VISTOS, leerVistos, marcarVisto } from './visto'

/**
 * Los tutoriales en video (plan de tutoriales, T5).
 *
 * POR QUÉ ESTOS: fallan en silencio. Un tutorial que no aparece no se ve "roto" (simplemente no está), una URL
 * mal armada sólo falla en prod, y un «✓ Visto» por haber abierto y cerrado es un dato falso que nadie nota.
 * La pantalla (la píldora, el reproductor) se verifica mirando.
 */

const meta = (over: Partial<MetaTutorial> = {}): MetaTutorial =>
  ({ version: 'a1b2c3d4', duracionMs: 80_000, capitulos: [], transcripcion: [], ...over })
const tut = (id: string, modulo: Tutorial['modulo'], vista?: string): Tutorial =>
  ({ id, modulo, vista, titulo: `Título ${id}`, resumen: `Resumen ${id}`, descripcion: `Descripción ${id}` })

describe('el catálogo del repo', () => {
  it('ids únicos y con forma de carpeta (son la ruta en Storage y la clave de «visto»)', () => {
    const ids = TUTORIALES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
  it('el módulo y la pantalla de cada uno existen en el registry (si no, la píldora no sale nunca)', () => {
    for (const t of TUTORIALES) {
      if (t.modulo !== 'general') expect(MODULES.some((m) => m.key === t.modulo)).toBe(true)
      if (t.vista) {
        const [m, s] = t.vista.split('/')
        expect(MODULES.find((x) => x.key === m)?.submodules.some((x) => x.key === s), t.vista).toBe(true)
      }
    }
  })
  it('una pantalla ofrece UN tutorial, no dos (DD5: una píldora por pantalla)', () => {
    const vistas = TUTORIALES.flatMap((t) => (t.vista ? [t.vista] : []))
    expect(new Set(vistas).size).toBe(vistas.length)
  })
  it('todo lo que hay en el meta es del catálogo, con versión y duración (lo escribe la fábrica)', () => {
    for (const [id, m] of Object.entries(META as Meta)) {
      expect(TUTORIALES.some((t) => t.id === id), id).toBe(true)
      expect(m?.version.trim()).not.toBe('')
      expect(m?.duracionMs).toBeGreaterThan(0)
    }
  })
})

describe('publicados y visibles', () => {
  const catalogo = [tut('a', 'pharma', 'pharma/dispensaciones'), tut('b', 'track'), tut('c', 'general'), tut('d', 'pharma')]
  const todos = publicados(catalogo, { a: meta(), b: meta(), c: meta(), d: meta({ version: ' ' }) })

  it('CRÍTICO · sin versión en el meta no se publica: el catálogo puede adelantarse a la grabación', () => {
    expect(todos.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(publicados(catalogo, { a: meta({ duracionMs: 0 }) })).toEqual([])
  })
  it('cada uno ve los generales y los de sus módulos', () => {
    expect(visiblesPara(todos, (m) => m === 'pharma').map((t) => t.id)).toEqual(['a', 'c'])
  })
  it('la píldora busca la pantalla exacta', () => {
    expect(tutorialDeLaVista(todos, 'pharma', 'dispensaciones')?.id).toBe('a')
    expect(tutorialDeLaVista(todos, 'pharma', 'stock')).toBeNull()
  })
  it('el alcance del panel: el módulo y los generales; null = todos', () => {
    expect(tutorialesDelAlcance(todos, 'track').map((t) => t.id)).toEqual(['b', 'c'])
    expect(tutorialesDelAlcance(todos, null).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
  it('se busca sin tildes y también en lo que dice la voz', () => {
    const conVoz: Publicado[] = [{ ...tut('x', 'pharma'), meta: meta({ transcripcion: ['Escaneá cada unidad con el lector.'] }) }]
    expect(buscarTutoriales(conVoz, 'ESCANEA').map((t) => t.id)).toEqual(['x'])
    expect(buscarTutoriales(conVoz, 'recepción')).toEqual([])
  })
  it('el siguiente es el que sigue en la lista; el último no tiene', () => {
    expect(siguienteDe(todos, 'a')?.id).toBe('b')
    expect(siguienteDe(todos, 'c')).toBeNull()
  })
})

describe('Storage', () => {
  it('la base sale del proyecto de la app (prod en prod, demo en el demo)', () => {
    expect(baseDeTutoriales('https://abcdefghijklmnopqrst.supabase.co/')).toBe(
      'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/tutoriales')
  })
  it('un video que no está (Storage da 400 o 404) no se reintenta; sin respuesta o con 5xx, sí', () => {
    expect(motivoDelError(400)).toBe('noDisponible')
    expect(motivoDelError(404)).toBe('noDisponible')
    expect(motivoDelError(null)).toBe('sinRed')
    expect(motivoDelError(503)).toBe('sinRed')
  })
  it('la ruta es <id>/<versión>/<archivo>, la que deja la fábrica', () => {
    expect(urlDelTutorial('https://x/tutoriales', { id: 'dispensar', meta: { version: 'a1b2c3d4' } }, 'video.mp4'))
      .toBe('https://x/tutoriales/dispensar/a1b2c3d4/video.mp4')
  })
})

describe('tiempos', () => {
  it('«1:20» y su versión hablada dicen el mismo número de segundos, truncado como el reproductor nativo', () => {
    expect(duracionCorta(80_900)).toBe('1:20')
    expect(duracionHablada(80_900)).toBe('1 minuto 20 segundos')
    expect(duracionCorta(15_560)).toBe('0:15')
    expect(duracionCorta(45_000)).toBe('0:45')
    expect(duracionHablada(45_000)).toBe('45 segundos')
    expect(duracionHablada(120_000)).toBe('2 minutos')
    expect(duracionHablada(61_000)).toBe('1 minuto 1 segundo')
  })
  const caps = [{ inicioMs: 0, titulo: 'Entrar' }, { inicioMs: 14_000, titulo: 'Elegir' }, { inicioMs: 38_000, titulo: 'Escanear' }]
  it('el capítulo actual es el último que ya empezó', () => {
    expect(capituloActual(caps, 0)).toBe(0)
    expect(capituloActual(caps, 37_999)).toBe(1)
    expect(capituloActual(caps, 50_000)).toBe(2)
    expect(capituloActual([{ inicioMs: 5_000, titulo: 'x' }], 1_000)).toBe(-1)
  })
  it('el progreso del capítulo va de 0 a 1 hasta el siguiente (o el final)', () => {
    expect(progresoDelCapitulo(caps, 1, 26_000, 80_000)).toBeCloseTo(0.5)
    expect(progresoDelCapitulo(caps, 2, 80_000, 80_000)).toBe(1)
  })
})

describe('visto', () => {
  const memoria = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
  }
  it('CRÍTICO · abrirlo no alcanza: visto es terminado o ≥ 90 % reproducido', () => {
    expect(alcanzaParaVisto(5, 80)).toBe(false)
    expect(alcanzaParaVisto(71, 80)).toBe(false)
    expect(alcanzaParaVisto(72, 80)).toBe(true)
    expect(alcanzaParaVisto(3, 80, true)).toBe(true)
    expect(alcanzaParaVisto(10, NaN)).toBe(false)
  })
  it('marcar y leer', () => {
    const a = memoria()
    marcarVisto('dispensar', a)
    expect([...leerVistos(a)]).toEqual(['dispensar'])
  })
  it('un almacenamiento que tira, o un valor roto, no rompe nada: todo «no visto»', () => {
    const roto = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    expect(leerVistos(roto).size).toBe(0)
    expect([...marcarVisto('x', roto)]).toEqual(['x'])
    const basura = memoria()
    basura.setItem(CLAVE_VISTOS, '{no es json')
    expect(leerVistos(basura).size).toBe(0)
    expect(leerVistos(null).size).toBe(0)
  })
})
