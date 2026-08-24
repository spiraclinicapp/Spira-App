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
