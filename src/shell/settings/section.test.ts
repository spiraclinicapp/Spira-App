import { describe, expect, it } from 'vitest'
import { parseSettingsSection, SECCIONES, seccionVisible } from './section'

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

const nadie = { esGerencia: false, esJefaturaCoordinacion: false }
const gerencia = { esGerencia: true, esJefaturaCoordinacion: false }
const jefatura = { esGerencia: false, esJefaturaCoordinacion: true }

describe('seccionVisible', () => {
  it('sin gerencia, «Feedback recibido» cae a Mi cuenta', () => {
    // La sección no está en el menú, pero ?ajustes=feedback es una URL que cualquiera puede
    // escribir. Mostrarla igual dejaría una pantalla que sólo puede fallar: la RLS de la 0044 no le
    // va a devolver ni una fila.
    expect(seccionVisible('feedback', nadie)).toBe('cuenta')
    expect(seccionVisible('feedback', jefatura)).toBe('cuenta')
  })

  it('con gerencia, la deja pasar', () => {
    expect(seccionVisible('feedback', gerencia)).toBe('feedback')
  })

  it('«Estudios del centro» es de jefatura de Coordinación', () => {
    // A una coordinadora la RLS le devolvería sólo sus estudios —los de la grilla—, y gerencia ya los
    // tiene todos en la grilla con sus pacientes. Ninguna de las dos gana nada con la sección.
    expect(seccionVisible('estudios', jefatura)).toBe('estudios')
    expect(seccionVisible('estudios', nadie)).toBe('cuenta')
    expect(seccionVisible('estudios', gerencia)).toBe('cuenta')
  })

  it('las demás secciones no dependen de quién mira', () => {
    for (const s of ['cuenta', 'prefs', 'roles', 'plataformas'] as const) {
      for (const quien of [nadie, gerencia, jefatura]) expect(seccionVisible(s, quien)).toBe(s)
    }
  })
})
