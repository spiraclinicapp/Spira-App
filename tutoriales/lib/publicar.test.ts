import { describe, expect, it } from 'vitest'
import { ARCHIVOS, BUCKET, CUENTA, claveDeObjeto, urlPublica } from './publicar.mjs'

/**
 * La publicación sube a Storage de PROD. El límite de verdad lo pone la 0157 (la cuenta dedicada sólo puede subir al
 * bucket `tutoriales`); `claveDeObjeto` es el segundo cerrojo: estos tests fijan que no arme nada fuera de
 * `<id>/<versión>/<archivo>`.
 */
describe('claveDeObjeto', () => {
  it('arma la ruta de un tutorial', () => {
    expect(claveDeObjeto('dispensar', '02accad0', 'video.mp4')).toBe('dispensar/02accad0/video.mp4')
  })
  it('CRÍTICO · rechaza cualquier cosa que pueda salir de la carpeta del tutorial', () => {
    expect(() => claveDeObjeto('../ip-docs', '02accad0', 'video.mp4')).toThrow()
    expect(() => claveDeObjeto('dispensar/../x', '02accad0', 'video.mp4')).toThrow()
    expect(() => claveDeObjeto('dispensar', '../../x', 'video.mp4')).toThrow()
    expect(() => claveDeObjeto('dispensar', '02accad0', '../video.mp4')).toThrow()
    expect(() => claveDeObjeto('', '02accad0', 'video.mp4')).toThrow()
  })
  it('sólo los tres archivos de la fábrica, y la versión es el hash de 8', () => {
    expect(() => claveDeObjeto('dispensar', '02accad0', 'otra.pdf')).toThrow()
    expect(() => claveDeObjeto('dispensar', '02ACCAD0', 'video.mp4')).toThrow()
    expect(() => claveDeObjeto('dispensar', '02accad', 'video.mp4')).toThrow()
    expect(Object.keys(ARCHIVOS)).toEqual(['video.mp4', 'subtitulos.vtt', 'poster.jpg'])
  })
  it('el bucket es tutoriales, y la URL pública es la que arma la app', () => {
    expect(BUCKET).toBe('tutoriales')
    expect(urlPublica('abcdefghijklmnopqrst', 'dispensar/02accad0/video.mp4'))
      .toBe('https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/tutoriales/dispensar/02accad0/video.mp4')
    expect(CUENTA).toBe('tutoriales@fabrica.spira')
  })
})
