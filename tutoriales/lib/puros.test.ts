/**
 * Las piezas puras de la fábrica fallan en silencio: un subtítulo corrido medio segundo, o un audio que arranca
 * antes que su clic, no rompen nada — el video sale, se publica, y se ve "raro" sin que nadie sepa por qué.
 * Estos tests los corre el `vitest` de la app (no importan Playwright ni ffmpeg).
 */
import { describe, expect, it } from 'vitest'
import { armarVtt, tiempoVtt } from './vtt'
import { armarCapitulos, armarTramos, esperaRestante, PAUSA_MS, problemasDeCapitulos } from './lineaDeTiempo'
import { duracionWavMs } from './wav'

describe('tiempoVtt', () => {
  it('hh:mm:ss.mmm siempre con horas', () => {
    expect(tiempoVtt(0)).toBe('00:00:00.000')
    expect(tiempoVtt(1234)).toBe('00:00:01.234')
    expect(tiempoVtt(61_005)).toBe('00:01:01.005')
    expect(tiempoVtt(3_725_500)).toBe('01:02:05.500')
  })
  it('redondea al milisegundo y rechaza negativos o no finitos', () => {
    expect(tiempoVtt(999.6)).toBe('00:00:01.000')
    expect(() => tiempoVtt(-1)).toThrow()
    expect(() => tiempoVtt(Number.NaN)).toThrow()
  })
})

describe('armarVtt', () => {
  it('un cue por paso con texto, numerado, con el encabezado WEBVTT', () => {
    const vtt = armarVtt([
      { inicioMs: 0, finMs: 1500, texto: 'Entrá a Dispensaciones.' },
      { inicioMs: 2000, finMs: 3000, texto: '' },
      { inicioMs: 3100, finMs: 4200, texto: 'Tocá «Preparar».' },
    ])
    expect(vtt).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nEntrá a Dispensaciones.\n\n2\n00:00:03.100 --> 00:00:04.200\nTocá «Preparar».\n',
    )
  })
  it('aplana los saltos de línea (una línea en blanco cortaría el cue)', () => {
    expect(armarVtt([{ inicioMs: 0, finMs: 10, texto: 'uno\n\ndos' }])).toContain('\nuno dos\n')
  })
  it('marcas desordenadas, pisadas o con fin antes del inicio → error', () => {
    expect(() => armarVtt([{ inicioMs: 1000, finMs: 2000, texto: 'a' }, { inicioMs: 1500, finMs: 2500, texto: 'b' }])).toThrow(/pisadas/)
    expect(() => armarVtt([{ inicioMs: 1000, finMs: 900, texto: 'a' }])).toThrow(/fin antes/)
  })
})

describe('línea de tiempo', () => {
  it('acción más larga que el audio → sólo la pausa', () => {
    expect(esperaRestante(1000, 3000)).toBe(PAUSA_MS)
  })
  it('audio más largo que la acción → espera lo que falta más la pausa', () => {
    expect(esperaRestante(4000, 1500)).toBe(2500 + PAUSA_MS)
  })
  it('rechaza duraciones negativas', () => {
    expect(() => esperaRestante(-1, 0)).toThrow()
  })
  it('el tramo termina cuando termina de sonar, y los capítulos salen de los pasos que los declaran', () => {
    const tramos = armarTramos([
      { inicioMs: 0, audioMs: 2000, accionMs: 500, texto: 'a', capitulo: 'Entrar', resumen: ' Entrá a la pantalla. ' },
      { inicioMs: 2450, audioMs: 1000, accionMs: 3000, texto: 'b' },
      { inicioMs: 5450, audioMs: 0, accionMs: 100, texto: '' },
    ])
    expect(tramos.map((t) => [t.inicioMs, t.finMs])).toEqual([[0, 2000], [2450, 3450], [5450, 5451]])
    expect(armarCapitulos(tramos)).toEqual([{ inicioMs: 0, titulo: 'Entrar', texto: 'Entrá a la pantalla.' }])
    expect(() => armarVtt(tramos)).not.toThrow()
  })
  it('un capítulo sin resumen frena la grabación en vez de escribir un meta a medias', () => {
    const tramos = armarTramos([{ inicioMs: 0, audioMs: 1000, accionMs: 0, texto: 'a', capitulo: 'Entrar', resumen: '  ' }])
    expect(() => armarCapitulos(tramos)).toThrow(/«Entrar» no tiene resumen/)
  })
})

describe('problemasDeCapitulos (lo chequea guion() al cargar)', () => {
  it('un guion bien armado no tiene problemas, y uno sin capítulos tampoco', () => {
    expect(problemasDeCapitulos([
      { capitulo: 'A', resumen: 'a' },
      {},
      { capitulo: 'B', resumen: 'b' },
    ])).toEqual([])
    expect(problemasDeCapitulos([{}, {}])).toEqual([])
  })
  it('nombra cada problema: sin resumen, resumen suelto, repetido y primer paso sin capítulo', () => {
    expect(problemasDeCapitulos([
      {},
      { capitulo: 'A' },
      { resumen: 'huérfano' },
      { capitulo: 'A', resumen: 'otra vez' },
    ])).toEqual([
      'el paso 2 abre el capítulo «A» sin resumen',
      'el paso 3 tiene resumen pero no abre ningún capítulo',
      'el capítulo «A» está repetido (paso 4)',
      'el primer paso no abre un capítulo',
    ])
  })
})

/** Un WAV PCM mínimo: RIFF + fmt + (chunks extra) + data de `bytesDatos`. */
function wav(bytesDatos: number, byteRate = 32_000, extra: [string, number][] = []): Uint8Array {
  const partes: number[] = []
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]
  const txt = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const fmt = [1, 0, 1, 0, ...u32(16_000), ...u32(byteRate), 2, 0, 16, 0] // 16 bytes
  const cuerpo = [...txt('WAVE'), ...txt('fmt '), ...u32(16), ...fmt]
  for (const [id, tam] of extra) cuerpo.push(...txt(id), ...u32(tam), ...new Array(tam + (tam % 2)).fill(0))
  cuerpo.push(...txt('data'), ...u32(bytesDatos), ...new Array(bytesDatos).fill(0))
  partes.push(...txt('RIFF'), ...u32(cuerpo.length), ...cuerpo)
  return Uint8Array.from(partes)
}

describe('duracionWavMs', () => {
  it('bytes de datos / byteRate', () => {
    expect(duracionWavMs(wav(32_000))).toBe(1000)
    expect(duracionWavMs(wav(8_000))).toBe(250)
  })
  it('recorre los chunks: uno extra antes de data (como el de Windows) no la desfasa', () => {
    expect(duracionWavMs(wav(16_000, 32_000, [['LIST', 26], ['fact', 3]]))).toBe(500)
  })
  it('un data truncado no inventa duración', () => {
    const w = wav(32_000).slice(0, -16_000)
    expect(duracionWavMs(w)).toBe(500)
  })
  it('lo que no es un WAV → error', () => {
    expect(() => duracionWavMs(Uint8Array.from([1, 2, 3]))).toThrow(/RIFF/)
  })
})
