import { describe, expect, it } from 'vitest'
import { buildUrl, parseUrl } from './router'

/**
 * El mapeo entre la URL y el estado de navegación.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. Si un slug queda mapeado a la
 * key equivocada, la pantalla no se ve mal — se ve perfecta, y es la pantalla de otra cosa. Nadie
 * agarra eso mirando. El resto (que el back del navegador ande, que un filtro se restaure) falla de
 * manera visible y se verifica en el navegador.
 *
 * Sin base y sin DOM: son funciones puras sobre dos strings.
 */

describe('parseUrl · módulo y submódulo', () => {
  it('la raíz es Inicio › Resumen', () => {
    expect(parseUrl('/', '')).toEqual({ moduleKey: 'inicio', subKey: 'resumen', path: [], query: {} })
  })

  it('traduce el slug visible a la key interna', () => {
    expect(parseUrl('/coordinacion/pacientes', '')).toMatchObject({ moduleKey: 'track', subKey: 'protocolos' })
    expect(parseUrl('/farmacia/stock', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'medicamentos' })
    expect(parseUrl('/farmacia/estadisticas', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'reportes' })
  })

  it('un módulo sin submódulo cae al primero del módulo', () => {
    expect(parseUrl('/coordinacion', '')).toMatchObject({ moduleKey: 'track', subKey: 'resumen' })
    expect(parseUrl('/farmacia', '')).toMatchObject({ moduleKey: 'pharma', subKey: 'protocolos' })
  })

  it('una ruta desconocida es null (no un redirect mudo)', () => {
    expect(parseUrl('/farmaceutica', '')).toBeNull()
    expect(parseUrl('/coordinacion/inventado', '')).toBeNull()
  })

  it('un path mal codificado es null, no una excepción', () => {
    expect(parseUrl('/coordinacion/pacientes/100%', '')).toBeNull()
  })

  it('guarda los segmentos que siguen al submódulo', () => {
    expect(parseUrl('/coordinacion/pacientes/EFC18244/32000740001', '')).toMatchObject({
      moduleKey: 'track', subKey: 'protocolos', path: ['EFC18244', '32000740001'],
    })
  })

  it('lee el query', () => {
    expect(parseUrl('/coordinacion/visitas', '?dia=2026-08-22&estado=pendiente')).toMatchObject({
      query: { dia: '2026-08-22', estado: 'pendiente' },
    })
  })
})

describe('buildUrl', () => {
  it('emite el slug visible, no la key interna', () => {
    expect(buildUrl({ moduleKey: 'track', subKey: 'protocolos', path: [], query: {} }))
      .toBe('/coordinacion/pacientes')
    expect(buildUrl({ moduleKey: 'pharma', subKey: 'medicamentos', path: [], query: {} }))
      .toBe('/farmacia/stock')
  })

  it('Inicio › Resumen es la raíz', () => {
    expect(buildUrl({ moduleKey: 'inicio', subKey: 'resumen', path: [], query: {} })).toBe('/')
  })

  it('arma path y query', () => {
    expect(buildUrl({
      moduleKey: 'track', subKey: 'visitas', path: [], query: { dia: '2026-08-22' },
    })).toBe('/coordinacion/visitas?dia=2026-08-22')
  })

  it('ida y vuelta sobre las rutas del spec', () => {
    const rutas = [
      '/',
      '/coordinacion/pacientes',
      '/coordinacion/pacientes/todos',
      '/coordinacion/pacientes/EFC18244',
      '/coordinacion/pacientes/EFC18244/32000740001',
      '/coordinacion/visitas',
      '/coordinacion/para-ver-medico',
      '/coordinacion/alertas',
      '/farmacia/pacientes',
      '/farmacia/recepcion',
      '/farmacia/stock',
      '/farmacia/dispensaciones',
      '/farmacia/dispensaciones/D-0417',
      '/farmacia/estadisticas',
    ]
    for (const ruta of rutas) {
      const [pathname, search] = ruta.split('?')
      const estado = parseUrl(pathname, search ? `?${search}` : '')
      expect(estado, `no parseó ${ruta}`).not.toBeNull()
      expect(buildUrl(estado!), `no volvió a ${ruta}`).toBe(ruta)
    }
  })
})

import { codecs, listOf, oneOf, readParam, resolveShortId, shortId, writeParam } from './router'

describe('codecs', () => {
  it('lista: coma como separador, sin vacíos', () => {
    expect(codecs.list.parse('a,b')).toEqual(['a', 'b'])
    expect(codecs.list.parse('')).toEqual([])
    expect(codecs.list.format(['a', 'b'])).toBe('a,b')
  })

  it('bool: 1/0, cualquier otra cosa es inválida', () => {
    expect(codecs.bool.parse('1')).toBe(true)
    expect(codecs.bool.parse('0')).toBe(false)
    expect(codecs.bool.parse('si')).toBeNull()
  })

  it('num: descarta lo que no es número', () => {
    expect(codecs.num.parse('7')).toBe(7)
    expect(codecs.num.parse('ayer')).toBeNull()
  })

  it('oneOf: solo acepta los valores del enum', () => {
    const c = oneOf(['tablero', 'historial'] as const)
    expect(c.parse('historial')).toBe('historial')
    expect(c.parse('inventado')).toBeNull()
  })

  it('listOf: descarta los elementos que no pertenecen al enum', () => {
    const c = listOf(['activo', 'pausado', 'cerrado'] as const)
    expect(c.parse('activo,inventado,cerrado')).toEqual(['activo', 'cerrado'])
    expect(c.parse('inventado')).toEqual([])
    expect(c.parse('')).toEqual([])
  })

  it('listOf: ida y vuelta de una lista válida', () => {
    const c = listOf(['activo', 'pausado'] as const)
    expect(c.parse(c.format(['activo', 'pausado']))).toEqual(['activo', 'pausado'])
  })
})

describe('readParam · un valor inválido cae al default, no rompe', () => {
  it('devuelve el default cuando el parámetro no está', () => {
    expect(readParam({}, 'dia', '2026-08-23', codecs.str)).toBe('2026-08-23')
  })

  it('devuelve el default cuando el valor es inválido', () => {
    expect(readParam({ agrupar: 'inventado' }, 'agrupar', 'operativo', oneOf(['operativo', 'estado'] as const)))
      .toBe('operativo')
  })

  it('devuelve el valor cuando es válido', () => {
    expect(readParam({ dia: '2026-08-22' }, 'dia', '2026-08-23', codecs.str)).toBe('2026-08-22')
  })
})

describe('writeParam · lo que está en su default no se escribe', () => {
  it('omite el valor por default', () => {
    expect(writeParam({}, 'dia', '2026-08-23', '2026-08-23', codecs.str)).toEqual({})
  })

  it('escribe el valor distinto del default', () => {
    expect(writeParam({}, 'dia', '2026-08-22', '2026-08-23', codecs.str)).toEqual({ dia: '2026-08-22' })
  })

  it('borra el parámetro al volver al default', () => {
    expect(writeParam({ dia: '2026-08-22' }, 'dia', '2026-08-23', '2026-08-23', codecs.str)).toEqual({})
  })

  it('una lista vacía es el default y no se escribe', () => {
    expect(writeParam({ estado: 'activo' }, 'estado', [], [], codecs.list)).toEqual({})
  })
})

describe('identificadores cortos', () => {
  const filas = [{ id: '8f3a2c1d-0000-4000-8000-000000000001' }, { id: 'a71c4e05-0000-4000-8000-000000000002' }]

  it('shortId son los primeros 8', () => {
    expect(shortId('8f3a2c1d-0000-4000-8000-000000000001')).toBe('8f3a2c1d')
  })

  it('resuelve por prefijo y por uuid completo', () => {
    expect(resolveShortId(filas, '8f3a2c1d')?.id).toBe(filas[0].id)
    expect(resolveShortId(filas, filas[1].id)?.id).toBe(filas[1].id)
  })

  it('con dos filas empatadas no devuelve ninguna', () => {
    const empate = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001' }, { id: 'aaaaaaaa-0000-4000-8000-000000000002' }]
    expect(resolveShortId(empate, 'aaaaaaaa')).toBeNull()
  })

  it('sin coincidencias devuelve null', () => {
    expect(resolveShortId(filas, 'ffffffff')).toBeNull()
  })
})
