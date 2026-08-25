import { describe, expect, it } from 'vitest'
import { parseSettingsSection, SECCIONES } from './section'

/* Cómo se lee `?ajustes=` de la URL.
 *
 * Se testea por el caso que ya existe en la naturaleza: los links a `?ajustes=notif` y
 * `?ajustes=ayuda` que quedaron guardados de cuando esas secciones existían. Las dos decisiones de
 * esta función fallan calladas — si la cadena vacía se tratara como "desconocida", Ajustes se
 * abriría solo en cada pantalla de la app; y si un valor desconocido devolviera null, el link
 * viejo no haría nada y parecería roto.
 */

describe('parseSettingsSection', () => {
  it('reconoce las tres secciones vigentes', () => {
    for (const s of SECCIONES) expect(parseSettingsSection(s)).toBe(s)
  })

  it('la cadena vacía es "Ajustes cerrado"', () => {
    // Es el default del parámetro cuando no está en la URL. Confundirlo con un valor desconocido
    // abriría el modal en TODAS las pantallas de la app.
    expect(parseSettingsSection('')).toBeNull()
  })

  it('un link viejo a una sección que ya no existe abre en Mi cuenta', () => {
    // `?ajustes=notif` y `?ajustes=ayuda` son links reales de antes del 2026-08-25. Quien los abre
    // pidió entrar a Ajustes; devolver null lo dejaría mirando la pantalla de atrás.
    expect(parseSettingsSection('notif')).toBe('cuenta')
    expect(parseSettingsSection('ayuda')).toBe('cuenta')
  })

  it('cualquier basura también abre en Mi cuenta, no rompe ni cierra', () => {
    expect(parseSettingsSection('cualquier-cosa')).toBe('cuenta')
    expect(parseSettingsSection('CUENTA')).toBe('cuenta') // ojo: distingue mayúsculas, y cae al default
  })
})
