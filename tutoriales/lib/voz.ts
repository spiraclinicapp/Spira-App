import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ffmpeg from 'ffmpeg-static'
import { leerConfigDemo } from '../../scripts/demo/config.mjs'
import { duracionWavMs } from './wav'

/* ============================================================================
   La voz del tutorial. UNA interfaz chica y un adaptador por proveedor (docs/plan-tutoriales.md: «la voz se
   elige de oído»). La FINAL es de ElevenLabs (decisión del Director, 2026-10-14): la clave y la voz elegida van
   en `%USERPROFILE%\.spira\demo.env` (`TTS_KEY`, `TTS_VOZ_ID`), fuera del repo. Si no están, la fábrica usa
   Helena, la voz que trae Windows (castellano de España: sirve para probar, no para publicar). Se fuerza una u
   otra con `TUTORIALES_VOZ` (`elevenlabs` · `windows-helena`).

   Caché por (voz + texto): regrabar un tutorial porque cambió la pantalla no vuelve a sintetizar las frases
   que no cambiaron. Con un proveedor pago, eso además es plata.
   ============================================================================ */

export interface Voz {
  /** Entra en la clave de la caché: dos voces nunca comparten audio. */
  id: string
  /** Escribe un WAV PCM en `destino`. */
  sintetizar(texto: string, destino: string): Promise<void>
}

const correr = promisify(execFile)

/** Windows · System.Speech · «Microsoft Helena Desktop» (es-ES). El texto viaja por archivo, no por la línea de
 *  comandos: así las comillas latinas y las tildes llegan enteras, sin escaparlas a mano. */
export const vozWindowsHelena: Voz = {
  id: 'windows-helena',
  async sintetizar(texto, destino) {
    const entrada = `${destino}.txt`
    writeFileSync(entrada, texto, 'utf8')
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      "$s.SelectVoice('Microsoft Helena Desktop')",
      '$s.Rate = 0',
      `$s.SetOutputToWaveFile('${destino.replace(/'/g, "''")}')`,
      `$s.Speak([System.IO.File]::ReadAllText('${entrada.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8))`,
      '$s.Dispose()',
    ].join('; ')
    await correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
  },
}

/**
 * ElevenLabs. El modelo multilingüe (`eleven_multilingual_v2`, cambiable con `TUTORIALES_ELEVENLABS_MODELO`) y
 * el mp3 de 44,1 kHz, que todos los planes dan; ffmpeg lo pasa a WAV, que es lo que mide y mezcla la fábrica.
 * El `id` lleva la voz y el modelo: cambiar cualquiera de los dos vuelve a sintetizar (no reusa la caché).
 * Los errores nunca muestran la clave: sólo el status y lo que contesta el proveedor.
 */
export function vozElevenLabs(): Voz {
  const { ttsKey, ttsVozId } = leerConfigDemo()
  if (!ttsKey || !ttsVozId) {
    throw new Error('Para la voz de ElevenLabs faltan TTS_KEY y TTS_VOZ_ID en %USERPROFILE%\\.spira\\demo.env (o usá TUTORIALES_VOZ=windows-helena).')
  }
  const modelo = process.env.TUTORIALES_ELEVENLABS_MODELO ?? 'eleven_multilingual_v2'
  return {
    id: `elevenlabs-${ttsVozId}-${modelo}`,
    async sintetizar(texto, destino) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ttsVozId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': ttsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: texto, model_id: modelo }),
      })
      if (!r.ok) throw new Error(`ElevenLabs respondió HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`)
      const mp3 = `${destino}.mp3`
      writeFileSync(mp3, Buffer.from(await r.arrayBuffer()))
      if (!ffmpeg) throw new Error('ffmpeg-static no encontró el binario. Corré `npm run tutoriales:instalar`.')
      await correr(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3, '-ac', '1', '-ar', '44100', destino], { windowsHide: true })
    },
  }
}

/** La voz de la toma: la elegida con `TUTORIALES_VOZ`; si no, ElevenLabs si está configurada, y si no, Helena. */
export function elegirVoz(id = process.env.TUTORIALES_VOZ): Voz {
  if (id === 'windows-helena') return vozWindowsHelena
  if (id === 'elevenlabs') return vozElevenLabs()
  if (id) throw new Error(`Voz desconocida «${id}». Disponibles: elevenlabs, windows-helena.`)
  const { ttsKey, ttsVozId } = leerConfigDemo()
  return ttsKey && ttsVozId ? vozElevenLabs() : vozWindowsHelena
}

/** Sintetiza (o reusa de la caché) y devuelve la ruta del WAV y cuánto dura. */
export async function audioDe(voz: Voz, texto: string, dirCache: string): Promise<{ ruta: string; duracionMs: number }> {
  mkdirSync(dirCache, { recursive: true })
  const clave = createHash('sha256').update(`${voz.id}\n${texto}`).digest('hex').slice(0, 16)
  const ruta = join(dirCache, `${clave}.wav`)
  if (!existsSync(ruta)) await voz.sintetizar(texto, ruta)
  return { ruta, duracionMs: duracionWavMs(readFileSync(ruta)) }
}
