/**
 * La config del demo falla en silencio de una manera concreta: si un dato falta y el error no lo nombra, el
 * script siguiente tira un 401 o un "fetch failed" lejos de la causa. Estos tests fijan que el mensaje diga QUÉ
 * falta y DÓNDE, y que nunca se cuele un valor (son claves).
 */
import { describe, expect, it } from 'vitest'
import { ConfigDemoError, leerConfigDemo, parsearEnv } from './config.mjs'

const RUTA = 'C:/falso/.spira/demo.env'
const REF = 'demodemodemodemodemo'
const completo = [
  '# comentario con = adentro',
  `DEMO_REF=${REF}`,
  'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx',
  '   DEMO_SECRET_KEY = "sb_secret_yyy"   ',
  'DEMO_DB_URL=',
  'TTS_KEY=',
].join('\r\n')
const desde = (texto: string, existe = true) => ({ ruta: RUTA, leer: () => texto, existe: () => existe })

describe('parsearEnv', () => {
  it('ignora comentarios y vacíos, recorta espacios y comillas, acepta CRLF', () => {
    expect(parsearEnv(completo)).toEqual({
      DEMO_REF: REF,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxx',
      DEMO_SECRET_KEY: 'sb_secret_yyy',
      DEMO_DB_URL: '',
      TTS_KEY: '',
    })
  })
  it('un renglón sin "=" o que empieza con "=" no es una clave', () => {
    expect(parsearEnv('suelto\n=valor\nA=1')).toEqual({ A: '1' })
  })
})

describe('leerConfigDemo', () => {
  it('completo → arma la URL desde el ref y deja lo opcional en null', () => {
    expect(leerConfigDemo(desde(completo))).toEqual({
      ref: REF,
      url: `https://${REF}.supabase.co`,
      publishableKey: 'sb_publishable_xxx',
      secretKey: 'sb_secret_yyy',
      dbUrl: null,
      ttsKey: null,
    })
  })
  it('archivo ausente → error con la ruta', () => {
    expect(() => leerConfigDemo(desde('', false))).toThrow(ConfigDemoError)
    expect(() => leerConfigDemo(desde('', false))).toThrow(RUTA)
  })
  it('claves faltantes → las nombra todas', () => {
    expect(() => leerConfigDemo(desde(`DEMO_REF=${REF}`))).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY, DEMO_SECRET_KEY/)
  })
  it('ref con forma inválida → error que NO muestra el valor', () => {
    const malo = completo.replace(REF, 'ESTO-NO-ES-UN-REF')
    expect(() => leerConfigDemo(desde(malo))).toThrow(ConfigDemoError)
    try { leerConfigDemo(desde(malo)) } catch (e) { expect(String(e)).not.toContain('ESTO-NO-ES-UN-REF') }
  })
})
