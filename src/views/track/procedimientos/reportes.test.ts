import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  ETA_PRESETS,
  etaLabel,
  etaLibreInicial,
  etaValida,
  isDefaultLink,
  isPlatform,
  knownReports,
  linkOnPlatformChange,
  platformMeta,
  PLATFORMS,
} from './reportes'

/**
 * Reglas del circuito de reportes de un procedimiento (0089).
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. Un link que se pisa solo
 * después de que la coordinadora lo editó a mano se ve idéntico a uno correcto — hasta que alguien
 * hace click y aterriza en el portal equivocado. Un `knownReports` que deduplica de más borra
 * opciones del combobox sin dejar rastro. En cambio los chips, los colores y el agrupado fallan de
 * manera visible y se verifican mirando.
 *
 * Sin base y sin navegador: son funciones puras.
 */

/** Definición mínima para los tests de combobox. */
function def(over: Partial<{ id: string; name: string; platform: string; eta_hours: number | null }> = {}) {
  return {
    id: over.id ?? 'd1',
    name: over.name ?? 'Hematología completa',
    platform: over.platform ?? 'labcorp',
    eta_hours: over.eta_hours === undefined ? 48 : over.eta_hours,
  }
}

describe('plataformas', () => {
  it('reconoce las cinco del check de la base', () => {
    for (const p of ['iqvia', 'labcorp', 'clario', 'roche4g', 'otro']) {
      expect(isPlatform(p)).toBe(true)
    }
  })

  it('un valor desconocido cae a "otro" en vez de romper', () => {
    // El front puede leer datos de un schema más nuevo que él: nunca asumir que el valor es válido.
    expect(isPlatform('medidata')).toBe(false)
    expect(platformMeta('medidata')).toBe(PLATFORMS.otro)
    expect(platformMeta(null)).toBe(PLATFORMS.otro)
    expect(platformMeta(undefined)).toBe(PLATFORMS.otro)
  })
})

describe('link pegajoso', () => {
  it('un campo vacío cuenta como "sin tocar"', () => {
    // Todavía no hay nada que respetar: al elegir plataforma tiene que autocompletarse.
    expect(isDefaultLink('iqvia', '')).toBe(true)
    expect(isDefaultLink('iqvia', null)).toBe(true)
    expect(isDefaultLink('iqvia', '   ')).toBe(true)
  })

  it('un link escrito a mano NO es el default', () => {
    expect(isDefaultLink('iqvia', 'https://portal-del-estudio.example/act18301')).toBe(false)
  })

  it('al cambiar de plataforma, un link editado a mano se respeta', () => {
    // EL caso que importa: la coordinadora pegó la URL puntual del estudio y después corrigió la
    // plataforma. Pisarle el link ahí la manda a un portal que no es el suyo.
    const propio = 'https://portal-del-estudio.example/act18301'
    expect(linkOnPlatformChange('iqvia', 'labcorp', propio)).toBe(propio)
  })

  it('al cambiar de plataforma, un link vacío toma el default de la nueva', () => {
    // Hoy ninguna plataforma trae URL cargada (ver la nota de PLATFORMS), así que el default es ''.
    // El test fija el COMPORTAMIENTO, no el dato: si mañana se cargan las URLs reales, sigue valiendo.
    expect(linkOnPlatformChange('iqvia', 'labcorp', '')).toBe(PLATFORMS.labcorp.url ?? '')
  })

  it('recorta los espacios del link que conserva', () => {
    expect(linkOnPlatformChange('iqvia', 'labcorp', '  https://x.example  ')).toBe('https://x.example')
  })
})

describe('plazo', () => {
  it('acepta el rango de la base y rechaza lo que el check bloquearía', () => {
    // report_definitions_eta_chk: eta_hours is null or (> 0 and <= 8760).
    expect(etaValida(null)).toBe(true)
    expect(etaValida(1)).toBe(true)
    expect(etaValida(8760)).toBe(true)
    expect(etaValida(0)).toBe(false)
    expect(etaValida(-1)).toBe(false)
    expect(etaValida(8761)).toBe(false)
    expect(etaValida(1.5)).toBe(false)
  })

  it('etiqueta en días cuando el plazo es múltiplo de 24, y en horas si no', () => {
    expect(etaLabel(1)).toBe('~1 h')
    expect(etaLabel(5)).toBe('~5 h')
    expect(etaLabel(24)).toBe('~1 día')
    expect(etaLabel(48)).toBe('~2 días')
    expect(etaLabel(72)).toBe('~3 días')
  })

  it('sin plazo lo DICE, no queda mudo', () => {
    // Un reporte sin plazo no vence nunca; la tarjeta tiene que decirlo en vez de mostrar un hueco.
    expect(etaLabel(null)).toBe('Sin plazo')
  })

  it('los chips ofrecen 1 hora, 24, 48, 72 y 7 días', () => {
    expect(ETA_PRESETS.map((p) => p.value)).toEqual([1, 24, 48, 72, 168])
  })

  it('el campo libre arranca VACÍO cuando el plazo ya es un chip', () => {
    // Si no, el número aparecería dos veces: encendido en el chip y escrito en el campo.
    for (const p of ETA_PRESETS) expect(etaLibreInicial(p.value)).toBe('')
    expect(etaLibreInicial(null)).toBe('')
  })

  it('el campo libre arranca CON el número cuando el plazo no es un chip', () => {
    // Regresión: el campo tomaba su texto de una expresión que lo vaciaba apenas el número
    // coincidía con un preset, así que tipear "12" era imposible — al entrar el "1" se limpiaba
    // solo. El texto del input ahora es estado propio; esta función solo decide el arranque.
    expect(etaLibreInicial(12)).toBe('12')
    expect(etaLibreInicial(124)).toBe('124')
    expect(etaLibreInicial(8760)).toBe('8760')
  })
})

describe('knownReports', () => {
  it('deduplica el mismo nombre en la misma plataforma', () => {
    const r = knownReports([
      def({ id: 'a', name: 'Hematología completa', platform: 'labcorp' }),
      def({ id: 'b', name: 'hematología completa', platform: 'labcorp' }),
    ])
    expect(r).toHaveLength(1)
  })

  it('NO deduplica el mismo nombre en plataformas distintas', () => {
    // Mismo rótulo, otro portal y otro plazo: son dos opciones distintas del combobox.
    const r = knownReports([
      def({ id: 'a', name: 'Hematología completa', platform: 'labcorp', eta_hours: 48 }),
      def({ id: 'b', name: 'Hematología completa', platform: 'iqvia', eta_hours: 24 }),
    ])
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.platform).sort()).toEqual(['iqvia', 'labcorp'])
  })

  it('excluye la definición que se está editando', () => {
    const r = knownReports([def({ id: 'a' }), def({ id: 'b', name: 'Curva flujo-volumen' })], 'a')
    expect(r.map((x) => x.name)).toEqual(['Curva flujo-volumen'])
  })

  it('descarta nombres vacíos y normaliza una plataforma desconocida', () => {
    const r = knownReports([
      def({ id: 'a', name: '   ' }),
      def({ id: 'b', name: 'Química', platform: 'medidata' }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].platform).toBe('otro')
  })

  it('ordena por nombre en castellano', () => {
    const r = knownReports([
      def({ id: 'a', name: 'Ácido úrico' }),
      def({ id: 'b', name: 'Bilirrubina' }),
      def({ id: 'c', name: 'Amilasa' }),
    ])
    expect(r.map((x) => x.name)).toEqual(['Ácido úrico', 'Amilasa', 'Bilirrubina'])
  })
})

describe('agruparPorCategoria', () => {
  it('respeta el orden de aparición de las categorías', () => {
    const g = agruparPorCategoria([
      { category: 'Laboratorio' },
      { category: 'Elegibilidad' },
      { category: 'Laboratorio' },
    ])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Elegibilidad'])
    expect(g[0].items).toHaveLength(2)
  })

  it('manda los sin categoría al final, aunque aparezcan primero', () => {
    const g = agruparPorCategoria([{ category: null }, { category: 'Laboratorio' }])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Sin categoría'])
  })

  it('trata la categoría vacía como "sin categoría"', () => {
    const g = agruparPorCategoria([{ category: '   ' }, { category: 'Laboratorio' }])
    expect(g.map((x) => x.categoria)).toEqual(['Laboratorio', 'Sin categoría'])
  })
})
