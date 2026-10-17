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
  /** El resumen corto del capítulo que abre este paso (ver `Paso.resumen`). */
  resumen?: string
}

export interface Tramo {
  inicioMs: number
  finMs: number
  texto: string
  capitulo?: string
  resumen?: string
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
    ...(p.resumen ? { resumen: p.resumen } : {}),
  }))
}

export interface CapituloArmado { inicioMs: number; titulo: string; texto: string }

/**
 * Los capítulos del reproductor: un salto por cada paso que declara uno, con su resumen como `texto`. Es lo que se
 * lee en la lista de capítulos de la Ayuda y en el «Paso a paso» del manual (docs/plan-ayuda-manual.md, A1 y A4).
 * Un capítulo sin resumen no se escribe a medias: frena la grabación, como `problemasDeCapitulos` frena el guion.
 */
export function armarCapitulos(tramos: readonly Tramo[]): CapituloArmado[] {
  return tramos.filter((t) => t.capitulo).map((t) => {
    const texto = t.resumen?.trim() ?? ''
    if (!texto) throw new Error(`El capítulo «${t.capitulo}» no tiene resumen`)
    return { inicioMs: t.inicioMs, titulo: t.capitulo!, texto }
  })
}

/**
 * Las reglas de los capítulos de un guion, que se chequean al cargarlo (`guion()`), antes de gastar una toma:
 *  · todo capítulo lleva su resumen, y un resumen sin capítulo no tiene dónde ir (seguro es un error de tipeo);
 *  · si hay capítulos, el primero abre en el primer paso: si no, los primeros segundos del video no son de ningún
 *    capítulo y el número de la lista no coincide con lo que se ve;
 *  · dos capítulos no se llaman igual: las preguntas frecuentes apuntan a un capítulo por su título.
 * Devuelve los problemas en castellano (vacío = está bien), para que el error los nombre todos de una vez.
 */
export function problemasDeCapitulos(pasos: readonly { capitulo?: string; resumen?: string }[]): string[] {
  const problemas: string[] = []
  const vistos = new Set<string>()
  pasos.forEach((p, i) => {
    const n = i + 1
    const titulo = p.capitulo?.trim()
    const resumen = p.resumen?.trim()
    if (titulo && !resumen) problemas.push(`el paso ${n} abre el capítulo «${titulo}» sin resumen`)
    if (resumen && !titulo) problemas.push(`el paso ${n} tiene resumen pero no abre ningún capítulo`)
    if (titulo) {
      if (vistos.has(titulo)) problemas.push(`el capítulo «${titulo}» está repetido (paso ${n})`)
      vistos.add(titulo)
    }
  })
  if (vistos.size > 0 && !pasos[0]?.capitulo?.trim()) problemas.push('el primer paso no abre un capítulo')
  return problemas
}
