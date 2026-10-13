/* ============================================================================
   Duración de un WAV PCM leyendo su encabezado. Hace falta para la línea de tiempo («primero la voz»), y así
   no dependemos de `ffprobe`, que `ffmpeg-static` no trae. Puro: recibe los bytes, no lee archivos.

   Se recorre los chunks en vez de suponer un encabezado fijo de 44 bytes: el sintetizador de Windows mete
   chunks extra antes de `data`, y con el atajo de los 44 bytes la duración sale mal y el video se desfasa.
   ============================================================================ */

export function duracionWavMs(bytes: Uint8Array): number {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  if (bytes.byteLength < 12 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') throw new Error('No es un WAV (falta RIFF/WAVE)')

  let byteRate: number | null = null
  let o = 12
  while (o + 8 <= bytes.byteLength) {
    const id = ascii(o)
    const tam = v.getUint32(o + 4, true)
    if (id === 'fmt ') byteRate = v.getUint32(o + 16, true)
    if (id === 'data') {
      if (!byteRate) throw new Error('WAV sin chunk fmt antes de data')
      const datos = Math.min(tam, bytes.byteLength - (o + 8)) // un `data` truncado no inventa duración
      return (datos / byteRate) * 1000
    }
    o += 8 + tam + (tam % 2) // los chunks se alinean a par
  }
  throw new Error('WAV sin chunk data')
}
