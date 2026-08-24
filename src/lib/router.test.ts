import { describe, expect, it } from 'vitest'
import { MODULES } from '../modules/registry'
import type { Codec } from './router'
import {
  buildUrl, codecs, listOf, oneOf, parseHref, parseUrl, readParam, resolveShortId, shortId, writeParam,
} from './router'

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

  /* El vocabulario interno no entra por la barra: la URL habla el nombre visible y nada más. Dos
     direcciones para la misma pantalla ensucian el historial y los links que se comparten. */
  it('la key interna no es un slug válido', () => {
    expect(parseUrl('/track/protocolos', '')).toBeNull()
    expect(parseUrl('/coordinacion/protocolos', '')).toBeNull()
    expect(parseUrl('/track/pacientes', '')).toBeNull()
    expect(parseUrl('/farmacia/medicamentos', '')).toBeNull()
    expect(parseUrl('/coordinacion/pacientes', '')).not.toBeNull()
  })

  /* Los módulos cuyo slug ES su key (Inicio, Lab, Contable) no caen en la regla de arriba: ahí no
     hay dos vocabularios, hay uno solo. */
  it('un módulo cuyo slug coincide con su key sigue siendo válido', () => {
    expect(parseUrl('/inicio/tareas', '')).toMatchObject({ moduleKey: 'inicio', subKey: 'tareas' })
    expect(parseUrl('/lab/muestras', '')).toMatchObject({ moduleKey: 'lab', subKey: 'muestras' })
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

  /* La coma es el separador que el spec promete para los filtros multi-valor y `URLSearchParams`
     la porcentúa: `?estado=pendiente%2Cen-curso` no se dicta por teléfono, que es justamente lo que
     se buscaba al omitir los defaults. */
  it('la coma de los multi-valor queda literal, no %2C', () => {
    expect(buildUrl({
      moduleKey: 'track', subKey: 'visitas', path: [], query: { estado: 'pendiente,en-curso' },
    })).toBe('/coordinacion/visitas?estado=pendiente,en-curso')
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
      // Con query: son la mitad de los ejemplos del §4.2 y faltaban. El primero es el que agarra la
      // coma porcentuada.
      '/coordinacion/visitas?dia=2026-08-22&estado=pendiente,en-curso',
      '/farmacia/stock?apartado=protocolo&estado=pronto',
      // Paciente sin IVRS: identificador corto con el prefijo `p-`.
      '/coordinacion/pacientes/EFC18244/p-8f3a2c1d',
    ]
    for (const ruta of rutas) {
      const [pathname, search] = ruta.split('?')
      const estado = parseUrl(pathname, search ? `?${search}` : '')
      expect(estado, `no parseó ${ruta}`).not.toBeNull()
      expect(buildUrl(estado!), `no volvió a ${ruta}`).toBe(ruta)
    }
  })
})

describe('parseHref · corta el href por el PRIMER ?', () => {
  it('un href sin query', () => {
    expect(parseHref('/coordinacion/pacientes')).toMatchObject({ moduleKey: 'track', query: {} })
  })

  it('un href con query', () => {
    expect(parseHref('/coordinacion/visitas?dia=2026-08-22')).toMatchObject({
      subKey: 'visitas', query: { dia: '2026-08-22' },
    })
  })

  /* Con `split('?')` este caso perdía TODO lo que venía después del segundo `?`: el día se leía y el
     estado desaparecía sin ruido. Un `?` sin encodear en un valor no es exótico — sale de un texto
     libre pegado en la barra. */
  it('un ? sin encodear adentro de un valor no trunca el resto del query', () => {
    expect(parseHref('/coordinacion/visitas?buscar=por?que&dia=2026-08-22')).toMatchObject({
      query: { buscar: 'por?que', dia: '2026-08-22' },
    })
  })
})

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

describe('codecs · el format tiene que ser re-parseable por su propio parse', () => {
  /* POR QUÉ ESTE TEST: si un `format` emite algo que su propio `parse` no acepta, no se rompe nada a
     la vista — el filtro simplemente no sobrevive al recargar. Y si `oneOf.format` devolviera algo
     constante, `writeParam` creería que TODO está en su default (compara `format(value) ===
     format(def)`) y ningún filtro de enum llegaría nunca a la URL. Las dos fallas son mudas en
     pantalla. Hasta acá solo `list` y `listOf` tenían ida y vuelta ejercitada; `bool`, `num` y `oneOf`
     podían romperse con la suite entera en verde.

     Un `it` por codec (no un loop tabular con `never`) para que el nombre del test que falla diga
     directo cuál codec se rompió, sin sacrificar el chequeo real de ida y vuelta. */
  function idaYVuelta<T>(codec: Codec<T>, valor: T) {
    expect(codec.parse(codec.format(valor))).toEqual(valor)
  }

  it('str', () => idaYVuelta(codecs.str, 'hola'))
  it('list', () => idaYVuelta(codecs.list, ['a', 'b']))
  it('num', () => idaYVuelta(codecs.num, 7))
  it('bool en true', () => idaYVuelta(codecs.bool, true))
  it('bool en false', () => idaYVuelta(codecs.bool, false))
  it('oneOf', () => idaYVuelta<'tablero' | 'historial'>(oneOf(['tablero', 'historial'] as const), 'historial'))
  it('listOf', () => idaYVuelta<('activo' | 'pausado')[]>(listOf(['activo', 'pausado'] as const), ['activo']))
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

  /* El `query` que recibe sale del objeto MEMOIZADO de `useUrlLocation`, compartido por todas las
     vistas montadas: mutarlo en vez de copiarlo corrompería el estado de las otras en silencio, y el
     síntoma aparecería lejos de acá. */
  it('no muta el query que recibe', () => {
    const entrada = { dia: '2026-08-22' }
    writeParam(entrada, 'estado', 'pendiente', '', codecs.str)
    writeParam(entrada, 'dia', '2026-08-23', '2026-08-23', codecs.str)
    expect(entrada).toEqual({ dia: '2026-08-22' })
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

  /* Los tres que siguen cubren el agujero del token corto. `startsWith('')` es true para TODAS las
     filas, así que sin el largo mínimo un segmento vacío —el que deja un `p-` pelado en la barra—
     devolvía la única fila cargada como si fuera un match legítimo. */
  it('un token vacío no resuelve, ni siquiera con una sola fila cargada', () => {
    expect(resolveShortId(filas, '')).toBeNull()
    expect(resolveShortId([filas[0]], '')).toBeNull()
  })

  it('un token más corto que el identificador no resuelve', () => {
    expect(resolveShortId(filas, '8f3a')).toBeNull()
  })

  it('resuelve por PREFIJO, no por subcadena', () => {
    const enElMedio = [{ id: 'aaaaaaaa-0000-4000-8000-8f3a2c1d0000' }]
    expect(resolveShortId(enElMedio, '8f3a2c1d')).toBeNull()
  })
})

describe('MODULE_SLUG y SUB_SLUG · sin slugs repetidos', () => {
  /* `invertir()` (el que arma MODULE_KEY y SUB_KEY a partir de los mapas de ida) acepta duplicados EN
     SILENCIO: si dos keys mapearan al mismo slug, el mapa invertido se queda con la ÚLTIMA que
     escribió esa entrada, y la key perdedora tendría un `buildUrl` que emite una URL que `parseUrl`
     resuelve a OTRA key — pantalla equivocada, sin ningún error ni advertencia. Es plausible el día
     que un submódulo nuevo (Lab, Contable) elija un rótulo que ya usa otro.

     MODULE_SLUG y SUB_SLUG son privados de router.ts y no hace falta exportarlos: alcanza con
     recorrer cada módulo y submódulo REAL de MODULES, armar su URL y volver a parsearla — si hubiera
     una colisión, la key perdedora del desempate no volvería a sí misma. */
  it('cada módulo y submódulo de MODULES hace ida y vuelta a su propia key', () => {
    for (const mod of MODULES) {
      for (const sub of mod.submodules) {
        const url = buildUrl({ moduleKey: mod.key, subKey: sub.key, path: [], query: {} })
        const estado = parseUrl(url, '')
        expect(estado, `${mod.key}/${sub.key} (${url}) no vuelve a sí mismo`).toMatchObject({
          moduleKey: mod.key, subKey: sub.key,
        })
      }
    }
  })
})
