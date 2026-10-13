import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@playwright/test'
import { SCRIPT_CURSOR } from './cursor'
import { Escena } from './guion'
import type { Guion } from './guion'
import { armarCapitulos, armarTramos, esperaRestante } from './lineaDeTiempo'
import type { PasoMedido } from './lineaDeTiempo'
import { achicar, extraerPoster, mezclar } from './mezcla'
import { armarVtt } from './vtt'
import { audioDe, elegirVoz } from './voz'

/* ============================================================================
   La grabación de un guion, de punta a punta (docs/plan-tutoriales.md, «Las dos mitades y la frontera»):

     1. voz     → un WAV por paso (con caché) y cuánto dura cada uno
     2. imagen  → Edge + Playwright graba a 1536×864; cada paso hace su acción y espera lo que falte de su audio
     3. mezcla  → ffmpeg pone cada audio en el instante en que arrancó su paso → mp4 H.264 + AAC
     4. salida  → tutoriales/salida/<id>/<versión>/ {video.mp4, subtitulos.vtt, poster.jpg}
                  + src/ayuda/tutoriales.meta.json (versión, duración, capítulos, transcripción)
                  + tutoriales/capturas/<id>/NN.png (referencia chica de cada paso, para `tutoriales:verificar`)

   La versión es un hash corto del mp4: va en la ruta de Storage, así un video regrabado nunca choca con la
   caché del anterior. Un guion `prueba` (la prueba de la fábrica) sólo deja la carpeta de salida.
   ============================================================================ */

const FABRICA = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(FABRICA, '..')
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

  // 2 · imagen
  const ctx = await browser.newContext({
    viewport: { width: ANCHO, height: ALTO },
    recordVideo: { dir: trabajo, size: { width: ANCHO, height: ALTO } },
    baseURL: opciones.baseURL,
  })
  await ctx.addInitScript(SCRIPT_CURSOR)
  const page = await ctx.newPage()
  const t0 = Date.now() // el video arranca con la página: las marcas se miden desde acá
  const escena = new Escena(page)
  if (g.preparar) await g.preparar(escena)

  const medidos: PasoMedido[] = []
  const capturas: string[] = []
  for (const [i, paso] of g.pasos.entries()) {
    const inicioMs = Date.now() - t0
    const antes = Date.now()
    if (paso.hace) await paso.hace(escena)
    // La captura de referencia también tarda: se cuenta como parte de la acción, para que la espera que
    // sigue sea exactamente lo que le falta al audio (si no, la voz del paso se pisa con la del siguiente).
    const captura = join(trabajo, `paso-${String(i + 1).padStart(2, '0')}.png`)
    await page.screenshot({ path: captura })
    capturas.push(captura)
    const accionMs = Date.now() - antes
    const audioMs = audios[i]?.duracionMs ?? 0
    await page.waitForTimeout(esperaRestante(audioMs, accionMs))
    medidos.push({ inicioMs, audioMs, accionMs, texto: paso.dice.trim(), ...(paso.capitulo ? { capitulo: paso.capitulo } : {}) })
  }
  const video = page.video()
  await ctx.close()
  const crudo = await video!.path()

  // 3 · mezcla
  const tmpMp4 = join(trabajo, 'video.mp4')
  mezclar(crudo, medidos.flatMap((m, i) => (audios[i] ? [{ ruta: audios[i]!.ruta, inicioMs: m.inicioMs }] : [])), tmpMp4)
  const version = createHash('sha256').update(readFileSync(tmpMp4)).digest('hex').slice(0, 8)

  // 4 · salida
  const carpeta = join(FABRICA, 'salida', g.id, version)
  mkdirSync(carpeta, { recursive: true })
  copyFileSync(tmpMp4, join(carpeta, 'video.mp4'))
  const tramos = armarTramos(medidos)
  writeFileSync(join(carpeta, 'subtitulos.vtt'), armarVtt(tramos), 'utf8')
  const iPoster = Math.max(0, g.pasos.findIndex((p) => p.poster))
  extraerPoster(join(carpeta, 'video.mp4'), medidos[iPoster].inicioMs + Math.min(800, medidos[iPoster].audioMs), join(carpeta, 'poster.jpg'))
  const duracionMs = Math.max(...tramos.map((t) => t.finMs))

  if (!g.prueba) {
    const dirCapturas = join(FABRICA, 'capturas', g.id)
    rmSync(dirCapturas, { recursive: true, force: true })
    mkdirSync(dirCapturas, { recursive: true })
    capturas.forEach((c, i) => achicar(c, 480, join(dirCapturas, `${String(i + 1).padStart(2, '0')}.png`)))
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
