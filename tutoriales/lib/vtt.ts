/* ============================================================================
   Subtítulos WebVTT desde las marcas de tiempo del guion. Puro: no importa Playwright ni ffmpeg, así lo corre
   el `vitest` de la app (que no instala las dependencias de la fábrica).

   Un cue por paso del guion: el texto es el mismo que se narró (`dice`), y el tiempo es el que el paso ocupó
   de verdad en la grabación. Sale de la misma fuente que la voz, así que no pueden quedar desfasados.
   ============================================================================ */

export interface Marca {
  inicioMs: number
  finMs: number
  texto: string
}

/** `hh:mm:ss.mmm`, el formato que exige WebVTT (las horas siempre, para que no haya dos formas). */
export function tiempoVtt(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`Tiempo inválido para VTT: ${ms}`)
  const total = Math.round(ms)
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const mil = total % 1000
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(h)}:${dos(m)}:${dos(s)}.${String(mil).padStart(3, '0')}`
}

/**
 * Arma el archivo. Los pasos sin texto no generan cue (un paso puede ser sólo una acción). Tira si las marcas
 * vienen desordenadas o se pisan: eso sería un bug de la línea de tiempo, y un subtítulo que tapa al siguiente
 * se ve como un error de la app, no de la fábrica.
 */
export function armarVtt(marcas: readonly Marca[]): string {
  const lineas = ['WEBVTT', '']
  let n = 0
  let finAnterior = 0
  for (const m of marcas) {
    if (m.finMs < m.inicioMs) throw new Error(`Marca con fin antes del inicio: ${m.inicioMs} → ${m.finMs}`)
    if (m.inicioMs < finAnterior) throw new Error(`Marcas desordenadas o pisadas en ${m.inicioMs} ms`)
    finAnterior = m.finMs
    const texto = m.texto.trim()
    if (!texto) continue
    n += 1
    // Una línea en blanco adentro del texto cortaría el cue: se aplana a un espacio.
    lineas.push(String(n), `${tiempoVtt(m.inicioMs)} --> ${tiempoVtt(m.finMs)}`, texto.replace(/\s*\n\s*/g, ' '), '')
  }
  return lineas.join('\n')
}
