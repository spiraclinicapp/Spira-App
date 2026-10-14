import { execFileSync, spawnSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

/* ============================================================================
   Mezcla con ffmpeg: el video crudo de Playwright (webm VP8) + el audio de cada paso, colocado en el instante
   en que el paso empezó → mp4 H.264 + AAC. Siempre se recodifica a mp4: el webm no anda en todos los Safari
   (resultado de T0, docs/plan-tutoriales.md). `+faststart` pone el índice al principio, para que el video
   arranque a reproducir sin bajarse entero.
   ============================================================================ */

function ff(args: string[]) {
  if (!ffmpeg) throw new Error('ffmpeg-static no encontró el binario. Corré `npm run tutoriales:instalar`.')
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true })
}

export interface Pista {
  ruta: string
  inicioMs: number
}

/**
 * `hastaMs`: dónde se corta. El crudo de Playwright sigue grabando mientras se cierra el navegador, así que
 * dura un par de segundos más que el guion; sin el corte, la píldora decía «0:15» y el reproductor «0:17»
 * (QA de T5, 2026-10-13).
 */
export function mezclar(videoCrudo: string, pistas: readonly Pista[], salidaMp4: string, hastaMs?: number): void {
  const entradas = ['-i', videoCrudo, ...pistas.flatMap((p) => ['-i', p.ruta])]
  const retrasos = pistas.map((p, i) => `[${i + 1}:a]adelay=${Math.round(p.inicioMs)}:all=1[a${i}]`)
  const mezcla = pistas.length
    ? `${retrasos.join(';')};${pistas.map((_, i) => `[a${i}]`).join('')}amix=inputs=${pistas.length}:normalize=0[aout]`
    : null
  ff([
    ...entradas,
    ...(mezcla ? ['-filter_complex', mezcla, '-map', '0:v', '-map', '[aout]'] : ['-map', '0:v']),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    ...(mezcla ? ['-c:a', 'aac', '-b:a', '96k'] : []),
    ...(hastaMs ? ['-t', (hastaMs / 1000).toFixed(3)] : []),
    '-movflags', '+faststart',
    salidaMp4,
  ])
}

/**
 * Cuánto dura de verdad un mp4, leído de ffmpeg (`ffmpeg-static` no trae `ffprobe`). Es la cifra del meta: el
 * largo del crudo de Playwright no es confiable —en una corrida sigue grabando mientras se cierra el navegador,
 * en otra termina antes—, así que se mide lo que se publica y no lo que se planeó.
 */
export function duracionDelVideo(mp4: string): number {
  if (!ffmpeg) throw new Error('ffmpeg-static no encontró el binario. Corré `npm run tutoriales:instalar`.')
  // Sin salida, ffmpeg termina con error a propósito: sólo interesa la cabecera que imprime en stderr.
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', mp4], { encoding: 'utf8', windowsHide: true })
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr ?? '')
  if (!m) throw new Error(`No se pudo leer la duración de ${mp4}`)
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000)
}

/** Un cuadro del video como póster (JPEG). */
export function extraerPoster(mp4: string, enMs: number, salidaJpg: string): void {
  ff(['-ss', (enMs / 1000).toFixed(3), '-i', mp4, '-frames:v', '1', '-q:v', '3', salidaJpg])
}

/** Achica una captura al ancho dado (las de referencia de `tutoriales:verificar` pesan ~20 KB a 480 px). */
export function achicar(entradaPng: string, ancho: number, salidaPng: string): void {
  ff(['-i', entradaPng, '-vf', `scale=${ancho}:-2:flags=lanczos`, salidaPng])
}
