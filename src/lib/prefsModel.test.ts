import { describe, expect, it } from 'vitest'
import { parsePrefs, PREFS_DEFAULT } from './prefsModel'

/* La validación de las preferencias (migración 0093).
 *
 * Se testea porque es el filtro entre tres fuentes que no controlamos del todo —una fila de la base,
 * un JSON viejo del navegador, y la respuesta de una versión anterior de la app— y el estado interno
 * de la interfaz. Si dejara pasar un valor que ningún control puede representar, no se rompe nada:
 * la app simplemente se comporta de una manera que nadie eligió, y el segmented se dibuja con las
 * tres opciones sin ninguna marcada. Eso no se ve como un error, se ve como un detalle raro.
 */

describe('parsePrefs', () => {
  it('acepta una fila de la base tal como llega (snake_case)', () => {
    expect(parsePrefs({ theme: 'dark', date_format: 'iso', home_view: 'ultimo' })).toEqual({
      theme: 'dark', dateFormat: 'iso', homeView: 'ultimo',
    })
  })

  it('acepta el caché del navegador (camelCase)', () => {
    expect(parsePrefs({ theme: 'system', dateFormat: 'iso', homeView: 'inicio' })).toEqual({
      theme: 'system', dateFormat: 'iso', homeView: 'inicio',
    })
  })

  it('un valor desconocido cae a su default, sin arrastrar a los demás', () => {
    // 'oscuro' es el error natural: alguien escribiendo el valor en castellano. Tiene que caer a
    // 'light' SIN llevarse puesto el formato de fecha, que sí era válido.
    expect(parsePrefs({ theme: 'oscuro', date_format: 'iso' })).toEqual({
      theme: 'light', dateFormat: 'iso', homeView: 'inicio',
    })
  })

  it('acepta el formato con el mes en letras (0097)', () => {
    // El valor nuevo tiene que entrar por las DOS puertas, la de la base y la del caché: si sólo
    // entrara por una, la preferencia se guardaría bien y volvería como 'dmy' al recargar.
    expect(parsePrefs({ date_format: 'dmesy' }).dateFormat).toBe('dmesy')
    expect(parsePrefs({ dateFormat: 'dmesy' }).dateFormat).toBe('dmesy')
  })

  it('los campos ausentes toman su default', () => {
    expect(parsePrefs({ theme: 'dark' })).toEqual({ ...PREFS_DEFAULT, theme: 'dark' })
  })

  it('un valor que no es string no pasa aunque exista', () => {
    // Un JSON corrupto o una columna que cambió de tipo: el `typeof === 'string'` es lo que evita
    // que un número o un objeto entren como si fueran una preferencia válida.
    expect(parsePrefs({ theme: 1, dateFormat: {}, homeView: null })).toEqual(PREFS_DEFAULT)
  })

  it('null, undefined y valores no-objeto devuelven los defaults', () => {
    expect(parsePrefs(null)).toEqual(PREFS_DEFAULT)
    expect(parsePrefs(undefined)).toEqual(PREFS_DEFAULT)
    expect(parsePrefs('dark')).toEqual(PREFS_DEFAULT)
    expect(parsePrefs(42)).toEqual(PREFS_DEFAULT)
  })

  it('los defaults son el comportamiento previo a la 0093', () => {
    // Si esto cambia, todo el que nunca tocó Ajustes ve la app distinta de un día para el otro.
    expect(PREFS_DEFAULT).toEqual({ theme: 'light', dateFormat: 'dmy', homeView: 'inicio' })
  })
})
