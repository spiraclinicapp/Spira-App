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
  /** El tutorial en video que muestra esto (id de `tutoriales.ts`). El «Ver cómo se hace» sale sólo si está publicado. */
  tutorial?: string
  /** El TÍTULO del capítulo de ese tutorial donde se ve la respuesta: la Ayuda ofrece «▶ 0:26 en el video» y salta
   *  ahí (docs/plan-ayuda-manual.md, A3). Va por título y no por número porque una regrabación puede sumar un
   *  capítulo antes; si lo renombra, el test de `preguntas.test.ts` falla. Sólo con `tutorial`. */
  capitulo?: string
}

type Permitido = (moduleKey: string) => boolean

/** Lo que el usuario puede ver: las generales y las de los módulos que tiene. La RLS no interviene (esto es
 *  texto del repo), así que el filtro de acá es el único. */
export function preguntasVisibles(preguntas: readonly Pregunta[], isAllowed: Permitido): Pregunta[] {
  return preguntas.filter((p) => p.modulo === 'general' || isAllowed(p.modulo))
}

/** Coincide si el término (sin tildes ni mayúsculas) aparece en la pregunta, la respuesta o sus palabras. El
 *  orden de los resultados y el alcance (todo lo visible, nunca sólo la pestaña) los pone `panel.ts`. */
export function coincide(p: Pregunta, termino: string): boolean {
  const t = normalizar(termino.trim())
  if (!t) return true
  return [p.pregunta, p.respuesta, ...(p.palabras ?? [])].some((campo) => normalizar(campo).includes(t))
}
