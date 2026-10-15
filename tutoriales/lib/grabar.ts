import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { SCRIPT_CURSOR } from './cursor'
import { resetearDemo, verificarAppDelDemo } from './demo'
import { Escena } from './guion'
import type { Guion } from './guion'
import { armarCapitulos, armarTramos, esperaRestante } from './lineaDeTiempo'
import type { PasoMedido } from './lineaDeTiempo'
import { duracionDelVideo, extraerPoster, mezclar } from './mezcla'
import { armarVtt } from './vtt'
import { entrarComo } from './sesion'
import { audioDe, elegirVoz } from './voz'

/* ============================================================================
   La grabación de un guion, de punta a punta (docs/plan-tutoriales.md, «Las dos mitades y la frontera»):

     1. voz     → un WAV por paso (con caché) y cuánto dura cada uno
     2. imagen  → Edge + Playwright graba a 1536×864; cada paso hace su acción y espera lo que falte de su audio
     3. mezcla  → ffmpeg pone cada audio en el instante en que arrancó su paso → mp4 H.264 + AAC
     4. salida  → tutoriales/salida/<id>/<versión>/ {video.mp4, subtitulos.vtt, poster.jpg}
                  + src/ayuda/tutoriales.meta.json (versión, duración, capítulos, transcripción)
                  + tutoriales/capturas/<id>/NN.png (referencia chica de cada paso: la deja `grabar.pw.ts` después, por el camino de `verificar`)

   La versión es un hash corto del mp4: va en la ruta de Storage, así un video regrabado nunca choca con la
   caché del anterior. Un guion `prueba` (la prueba de la fábrica) sólo deja la carpeta de salida.
   ============================================================================ */

const FABRICA = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(FABRICA, '..')
/** Lo que sigue el video después del último paso, para que el final no se corte en seco. */
const RESPIRO_FINAL_MS = 600

export const ANCHO = 1536
export const ALTO = 864

export interface Resultado {
  carpeta: string
  version: string
  duracionMs: number
}

export async function grabarGuion(browser: Browser, g: Guion, opciones: { baseURL?: string } = {}): Promise<Resultado> {
  const trabajo = join(FABRICA, '.trabajo', g.id)
  rmSync(trabajo, { recursive: true, force: true })
  mkdirSync(trabajo, { recursive: true })

  // 1 · voz
  const voz = elegirVoz()
  const audios: ({ ruta: string; duracionMs: number } | null)[] = []
  for (const p of g.pasos) audios.push(p.dice.trim() ? await audioDe(voz, p.dice.trim(), join(FABRICA, '.cache', 'voz')) : null)

  // 2 · imagen. Un tutorial de verdad se graba contra la app del DEMO, y eso se comprueba (cerrojo 3) antes
  //     de abrir nada: grabado contra prod, el video publicaría nombres reales.
  if (!g.prueba) {
    if (!opciones.baseURL) throw new Error(`«${g.id}» es un tutorial: se graba contra la app del demo (falta baseURL).`)
    await verificarAppDelDemo(opciones.baseURL)
    resetearDemo()
  }
  const ctx = await browser.newContext({
    viewport: { width: ANCHO, height: ALTO },
    recordVideo: { dir: trabajo, size: { width: ANCHO, height: ALTO } },
    baseURL: opciones.baseURL,
  })
  await ctx.addInitScript(SCRIPT_CURSOR)
  if (g.cuenta) await entrarComo(ctx, g.cuenta)
  const page = await ctx.newPage()
  const t0 = Date.now() // el video arranca con la página: las marcas se miden desde acá
  const escena = new Escena(page)
  if (g.preparar) await g.preparar(escena)

  const medidos: PasoMedido[] = []
  for (const [i, paso] of g.pasos.entries()) {
    const inicioMs = Date.now() - t0
    const antes = Date.now()
    /* La foto del paso en `.trabajo/` se saca SÓLO si el paso falla. Antes iba en todos, y cada `page.screenshot`
       pausa la grabación del video: el atraso se acumulaba paso a paso. En «Agendar y reprogramar» la acción del
       décimo paso salía ~2 s después de su voz, y explica el contador atrasado de «Dispensar» (2026-10-15). La
       de referencia de `verificar` sale aparte, en otra pasada, y no graba video. */
    try {
      if (paso.hace) await paso.hace(escena)
    } catch (e) {
      await page.screenshot({ path: join(trabajo, `paso-${String(i + 1).padStart(2, '0')}-fallo.png`) }).catch(() => {})
      throw e
    }
    const accionMs = Date.now() - antes
    const audioMs = audios[i]?.duracionMs ?? 0
    await page.waitForTimeout(esperaRestante(audioMs, accionMs))
    medidos.push({ inicioMs, audioMs, accionMs, texto: paso.dice.trim(), ...(paso.capitulo ? { capitulo: paso.capitulo } : {}) })
  }
  /* El video se corta donde termina el último paso, más un respiro corto para que no se corte en seco. */
  const finMs = Date.now() - t0 + RESPIRO_FINAL_MS
  const video = page.video()
  await ctx.close()
  const crudo = await video!.path()

  // 3 · mezcla
  const tmpMp4 = join(trabajo, 'video.mp4')
  mezclar(crudo, medidos.flatMap((m, i) => (audios[i] ? [{ ruta: audios[i]!.ruta, inicioMs: m.inicioMs }] : [])), tmpMp4, finMs)
  const version = createHash('sha256').update(readFileSync(tmpMp4)).digest('hex').slice(0, 8)

  // 4 · salida
  const carpeta = join(FABRICA, 'salida', g.id, version)
  mkdirSync(carpeta, { recursive: true })
  copyFileSync(tmpMp4, join(carpeta, 'video.mp4'))
  const tramos = armarTramos(medidos)
  writeFileSync(join(carpeta, 'subtitulos.vtt'), armarVtt(tramos), 'utf8')
  const iPoster = Math.max(0, g.pasos.findIndex((p) => p.poster))
  /* El póster, al FINAL del paso: lo último antes de que empiece el siguiente, con la acción hecha y la voz dicha.
     Es el cuadro más quieto: la página cargó, el modal terminó de abrir y las pistas que dejó el mouse al pasar ya
     se cerraron. Antes iba a 0,8 s del inicio (ver `Paso.poster`). */
  const posterMs = medidos[iPoster].inicioMs + Math.max(medidos[iPoster].audioMs, medidos[iPoster].accionMs) - 150
  extraerPoster(join(carpeta, 'video.mp4'), Math.max(0, posterMs), join(carpeta, 'poster.jpg'))
  /* La duración del meta es la del mp4 MEDIDO, no la planeada: la de la píldora tiene que ser la del
     reproductor (QA de T5: decía «0:15» y el video duraba 0:17). */
  const duracionMs = duracionDelVideo(join(carpeta, 'video.mp4'))

  /* Las capturas de referencia de `tutoriales:verificar` NO salen de esta toma: las deja `grabar.pw.ts` al
     terminar, pasando el guion por el mismo camino que después las compara (`lib/verificar.ts`). Sacarlas acá,
     con el estilo que esconde los avisos, lo aplicaría a la página que se está filmando. */
  if (!g.prueba) {
    escribirMeta(g.id, {
      version,
      duracionMs: Math.round(duracionMs),
      capitulos: armarCapitulos(tramos),
      transcripcion: tramos.map((t) => t.texto).filter(Boolean),
    })
  }
  return { carpeta, version, duracionMs }
}

/** Mezcla la entrada de este tutorial en `src/ayuda/tutoriales.meta.json`, con las claves ordenadas (diff estable). */
function escribirMeta(id: string, entrada: object) {
  const ruta = join(REPO, 'src', 'ayuda', 'tutoriales.meta.json')
  const actual = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : {}
  actual[id] = entrada
  const ordenado = Object.fromEntries(Object.keys(actual).sort().map((k) => [k, actual[k]]))
  writeFileSync(ruta, JSON.stringify(ordenado, null, 2) + '\n', 'utf8')
}
