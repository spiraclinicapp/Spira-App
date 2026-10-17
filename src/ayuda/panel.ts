import { buscarTutoriales } from './catalogo'
import type { Publicado } from './catalogo'
import { coincide } from './reglas'
import type { ModuloAyuda, Pregunta } from './reglas'

/* ============================================================================
   Las reglas del panel de Ayuda v2: qué pestañas hay, qué tutorial se carga, qué preguntas van con él, qué
   encuentra la búsqueda y qué sale en «Lo esencial». Plan: docs/plan-ayuda-manual.md; handoff:
   docs/handoff-ayuda-manual/README.md, §2.

   PURAS Y CON TEST por lo mismo que `reglas.ts`: su modo de falla es esconder sin avisar. La trampa concreta de
   acá es la de las preguntas atadas a un tutorial: si el tutorial todavía no está publicado, la pregunta no tiene
   bajo qué video aparecer, y si no se la trata como suelta desaparece de la pestaña (ver `preguntasDeLaPestaña`).

   Recibe siempre lo YA FILTRADO para el usuario (`preguntasVisibles`, `visiblesPara`): estas funciones no saben
   de permisos, sólo de orden y de alcance.
   ============================================================================ */

/** `general` es «Primeros pasos». El orden del tipo no importa: el de la pantalla lo fija `pestañasVisibles`. */
export type PestañaPanel = 'inicio' | ModuloAyuda

/**
 * Las pestañas, en el orden fijo del handoff: Inicio · Primeros pasos · Coordinación · Farmacia. Inicio y
 * Primeros pasos son de todos; las de módulo, sólo de quien lo tiene habilitado.
 */
export function pestañasVisibles(isAllowed: (moduleKey: string) => boolean): PestañaPanel[] {
  return ['inicio', 'general', ...(['track', 'pharma'] as const).filter((m) => isAllowed(m))]
}

/**
 * El tutorial que se carga al abrir la pestaña de un módulo: el de la pantalla donde estás (`vista`,
 * `"<modulo>/<sub>"`), si es de este módulo; si no, el primero que todavía no viste; si no, el primero. `null` =
 * el módulo no tiene ninguno publicado (la pestaña muestra sólo preguntas).
 */
export function tutorialInicial(
  tutoriales: readonly Publicado[],
  modulo: ModuloAyuda,
  vista: string | null,
  vistos: ReadonlySet<string>,
): Publicado | null {
  const delModulo = tutoriales.filter((t) => t.modulo === modulo)
  return (vista ? delModulo.find((t) => t.vista === vista) : undefined)
    ?? delModulo.find((t) => !vistos.has(t.id))
    ?? delModulo[0]
    ?? null
}

/**
 * Las preguntas de la pestaña: primero las del tutorial cargado y después las sueltas del módulo. «Suelta» es una
 * pregunta sin tutorial **o con un tutorial que no está publicado**: si no, quedaría esperando un video que no se
 * ve y no aparecería en ningún lado. Sin repetir, en el orden del archivo.
 */
export function preguntasDeLaPestaña(
  preguntas: readonly Pregunta[],
  publicados: ReadonlySet<string>,
  modulo: ModuloAyuda,
  tutorialId: string | null,
): Pregunta[] {
  const delTutorial = tutorialId ? preguntas.filter((p) => p.tutorial === tutorialId) : []
  const sueltas = preguntas.filter((p) => p.modulo === modulo && (!p.tutorial || !publicados.has(p.tutorial)))
  return [...new Set([...delTutorial, ...sueltas])]
}

export type Resultado =
  | { tipo: 'tutorial'; tutorial: Publicado }
  | { tipo: 'pregunta'; pregunta: Pregunta }

/**
 * La búsqueda del panel: con texto, en TODO lo visible (todos los módulos, no la pestaña elegida: la regla de
 * `reglas.ts`), primero los tutoriales y después las preguntas. Sin texto no hay resultados: el panel muestra las
 * pestañas.
 */
export function buscarEnAyuda(preguntas: readonly Pregunta[], tutoriales: readonly Publicado[], termino: string): Resultado[] {
  if (!termino.trim()) return []
  return [
    ...buscarTutoriales(tutoriales, termino).map((tutorial) => ({ tipo: 'tutorial' as const, tutorial })),
    ...preguntas.filter((p) => coincide(p, termino)).map((pregunta) => ({ tipo: 'pregunta' as const, pregunta })),
  ]
}

export interface Destacado { tipo: 'tutorial' | 'pregunta'; id: string }

/**
 * «Lo esencial» del Inicio del panel (A12: elegida a mano, no «lo más consultado», porque no hay conteo). Saca lo
 * que este usuario no ve: un tutorial sin publicar o de otro módulo, una pregunta de un módulo que no tiene.
 */
export function destacadosVisibles(
  destacados: readonly Destacado[],
  preguntas: readonly Pregunta[],
  tutoriales: readonly Publicado[],
): Resultado[] {
  return destacados.flatMap((d): Resultado[] => {
    if (d.tipo === 'tutorial') {
      const tutorial = tutoriales.find((t) => t.id === d.id)
      return tutorial ? [{ tipo: 'tutorial', tutorial }] : []
    }
    const pregunta = preguntas.find((p) => p.id === d.id)
    return pregunta ? [{ tipo: 'pregunta', pregunta }] : []
  })
}
