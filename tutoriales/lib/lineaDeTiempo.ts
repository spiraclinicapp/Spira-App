/* ============================================================================
   La línea de tiempo de una grabación: «primero la voz, después la imagen» (docs/plan-tutoriales.md).

   Cada paso del guion tiene un audio ya sintetizado (sabemos cuánto dura) y una acción (clics, tipeo) que
   tarda lo que tarda. El paso dura lo que dure lo más largo de los dos, más una pausa para respirar: si la
   acción termina antes que la voz, la grabación espera; si la voz termina antes, el siguiente paso no arranca
   hasta que la acción terminó. El audio de cada paso se coloca en el instante en que el paso empezó.

   Puro: lo corre el `vitest` de la app.
   ============================================================================ */

/** Pausa entre pasos, para que una frase no se pegue a la siguiente. */
export const PAUSA_MS = 450

/** Cuánto más hay que esperar después de la acción para que termine de sonar el audio del paso. */
export function esperaRestante(audioMs: number, accionMs: number, pausaMs = PAUSA_MS): number {
  if (audioMs < 0 || accionMs < 0) throw new Error('Duraciones negativas')
  return Math.max(0, audioMs - accionMs) + pausaMs
}

export interface PasoMedido {
  /** Cuándo empezó el paso, medido desde el arranque de la grabación. */
  inicioMs: number
  audioMs: number
  accionMs: number
  texto: string
  capitulo?: string
}

export interface Tramo {
  inicioMs: number
  finMs: number
  texto: string
  capitulo?: string
}

/**
 * Las marcas finales de cada paso, para los subtítulos y los capítulos. El fin es cuando termina de sonar
 * (no cuando arranca el paso siguiente), así el subtítulo no queda en pantalla durante la pausa.
 */
export function armarTramos(pasos: readonly PasoMedido[]): Tramo[] {
  return pasos.map((p) => ({
    inicioMs: p.inicioMs,
    finMs: p.inicioMs + Math.max(p.audioMs, 1),
    texto: p.texto,
    ...(p.capitulo ? { capitulo: p.capitulo } : {}),
  }))
}

/** Los capítulos del reproductor: un salto por cada paso que declara uno. */
export function armarCapitulos(tramos: readonly Tramo[]): { inicioMs: number; titulo: string }[] {
  return tramos.filter((t) => t.capitulo).map((t) => ({ inicioMs: t.inicioMs, titulo: t.capitulo! }))
}
