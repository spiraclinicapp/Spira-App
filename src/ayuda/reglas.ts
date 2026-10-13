import { normalizar } from '../lib/texto'

/* ============================================================================
   Reglas de la Ayuda: qué preguntas ve cada uno, en qué orden y cómo se busca.
   Plan: docs/plan-tutoriales.md, «Diseño» (DD3, DD4, DD7, DD8b).

   SON PURAS Y TIENEN TEST por lo mismo que la búsqueda de Alertas: su modo de falla es esconder sin avisar.
   Una pregunta que no aparece no se ve "rota" — simplemente no está, y quien tenía la duda concluye que la
   Ayuda no la cubre. El caso que ya se pescó en la revisión de diseño: buscar «recepción» parado en el filtro
   de Coordinación decía «No encontramos nada» y la respuesta existía en Farmacia. Por eso, con texto, se busca
   en TODO lo que el usuario puede ver, no en el alcance elegido.
   ============================================================================ */

/** `general` vale para cualquiera; las otras son la clave interna del módulo (ver CLAUDE.md, «Ojo con los nombres»). */
export type ModuloAyuda = 'general' | 'track' | 'pharma'

export interface Pregunta {
  /** Estable: lo usa el buscador global para abrir esta respuesta. No se cambia una vez publicado. */
  id: string
  modulo: ModuloAyuda
  pregunta: string
  respuesta: string
  /** Palabras con las que alguien buscaría esto sin que estén en el texto ("escanear" para "código de barras"). */
  palabras?: string[]
}

type Permitido = (moduleKey: string) => boolean

/** Lo que el usuario puede ver: las generales y las de los módulos que tiene. La RLS no interviene (esto es
 *  texto del repo), así que el filtro de acá es el único. */
export function preguntasVisibles(preguntas: readonly Pregunta[], isAllowed: Permitido): Pregunta[] {
  return preguntas.filter((p) => p.modulo === 'general' || isAllowed(p.modulo))
}

/**
 * Las del alcance elegido, en el orden en que se muestran: primero las del módulo, después las generales.
 * `moduloActual` null (desde Inicio, o con «Ver todos los módulos») = todas, agrupadas por módulo y las
 * generales al final. El orden dentro de cada grupo es el del archivo de preguntas: lo decide quien escribe.
 */
export function preguntasDelAlcance(visibles: readonly Pregunta[], moduloActual: ModuloAyuda | null): Pregunta[] {
  const orden = (m: ModuloAyuda) => (m === 'general' ? 2 : m === moduloActual ? 0 : 1)
  const elegibles = moduloActual ? visibles.filter((p) => p.modulo === moduloActual || p.modulo === 'general') : [...visibles]
  return elegibles
    .map((p, i) => ({ p, i }))
    .sort((a, b) => orden(a.p.modulo) - orden(b.p.modulo) || a.i - b.i)
    .map(({ p }) => p)
}

/** ¿El módulo del shell tiene preguntas propias? Si no (Inicio, o un módulo sin ninguna), el panel arranca en «todos». */
export function moduloDeAyuda(moduleKey: string): ModuloAyuda | null {
  return moduleKey === 'track' || moduleKey === 'pharma' ? moduleKey : null
}

/** Coincide si el término (sin tildes ni mayúsculas) aparece en la pregunta, la respuesta o sus palabras. */
export function coincide(p: Pregunta, termino: string): boolean {
  const t = normalizar(termino.trim())
  if (!t) return true
  return [p.pregunta, p.respuesta, ...(p.palabras ?? [])].some((campo) => normalizar(campo).includes(t))
}

/** Con texto: busca en TODAS las visibles (no en el alcance), manteniendo el orden del alcance de arriba. */
export function buscarPreguntas(visibles: readonly Pregunta[], termino: string, moduloActual: ModuloAyuda | null): Pregunta[] {
  return preguntasDelAlcance(visibles, null)
    .filter((p) => coincide(p, termino))
    .sort((a, b) => Number(b.modulo === moduloActual) - Number(a.modulo === moduloActual))
}
