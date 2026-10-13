import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { duracionWavMs } from './wav'

/* ============================================================================
   La voz del tutorial. UNA interfaz chica y un adaptador por proveedor (docs/plan-tutoriales.md: «la voz se
   elige de oído»). Mientras el Director no elija, el único adaptador es la voz que trae Windows: Helena,
   castellano de España. NO es la voz final —el acento no es el nuestro—, pero es gratis, no pide claves y
   permite probar la fábrica de punta a punta. Cambiar de voz = agregar un adaptador y elegirlo con
   `TUTORIALES_VOZ`, sin tocar el resto.

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

const VOCES: Record<string, Voz> = { [vozWindowsHelena.id]: vozWindowsHelena }

export function elegirVoz(id = process.env.TUTORIALES_VOZ ?? vozWindowsHelena.id): Voz {
  const voz = VOCES[id]
  if (!voz) throw new Error(`Voz desconocida «${id}». Disponibles: ${Object.keys(VOCES).join(', ')}.`)
  return voz
}

/** Sintetiza (o reusa de la caché) y devuelve la ruta del WAV y cuánto dura. */
export async function audioDe(voz: Voz, texto: string, dirCache: string): Promise<{ ruta: string; duracionMs: number }> {
  mkdirSync(dirCache, { recursive: true })
  const clave = createHash('sha256').update(`${voz.id}\n${texto}`).digest('hex').slice(0, 16)
  const ruta = join(dirCache, `${clave}.wav`)
  if (!existsSync(ruta)) await voz.sintetizar(texto, ruta)
  return { ruta, duracionMs: duracionWavMs(readFileSync(ruta)) }
}
