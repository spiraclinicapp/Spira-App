/* ┌─ Filtros de Visitas: qué pasa, cuánto queda y qué tecla hace qué ───────────────────────────┐
   Lógica PURA del panel de filtros de dos columnas (handoff §2.1) y de los atajos de teclado.
   Se testea porque falla en silencio: un AND que debería ser OR, o un conteo que cuenta la propia
   categoría, dibuja un panel prolijo con números que no coinciden con la lista de atrás.

   Reglas (las mismas de antes del rediseño):
     · AND entre categorías, OR dentro de cada una;
     · la búsqueda (nombre / N° / protocolo / código de visita) va encima de todo;
     · el conteo de cada opción es FACETADO: cuenta lo que pasa los filtros de las OTRAS categorías,
       así marcar «Concurrió» no deja a «Por llegar» en 0 dentro de la misma columna.
   └─────────────────────────────────────────────────────────────────────────────────────────────┘ */
import type { OperationalStage } from '../../../data/dayVisits'
import type { VisitStatus } from '../../../data/visits'
import { estadoDeFila } from './calendario'

/** Sentinela de «sin médico» / «sin coordinador» (valores null) en la URL y en las opciones. */
export const NONE = '∅'

/**
 * Opción «Espera al médico» DENTRO del filtro Estado. No es una etapa: es la marca `wants_doctor`
 * mientras la atención sigue abierta. Vive con los estados porque el usuario piensa «mostrame los
 * que están esperando», no «cruzá dos ejes».
 */
export const ESPERA_MEDICO = 'espera_medico'

export type CategoriaFiltro = 'estado' | 'protocolo' | 'medico' | 'coordinador'
export const CATEGORIAS: readonly CategoriaFiltro[] = ['estado', 'protocolo', 'medico', 'coordinador']

export type Filtros = Record<CategoriaFiltro, string[]>

export const SIN_FILTROS: Filtros = { estado: [], protocolo: [], medico: [], coordinador: [] }

/** Lo que el filtro necesita de una fila (una `DayVisitRow` lo cumple). */
export interface FilaFiltrable {
  operational_stage: OperationalStage
  computed_status: VisitStatus
  wants_doctor: boolean
  doctor_seen_at: string | null
  no_show_at?: string | null
  protocol_id: string
  protocol_code: string
  treating_physician: string | null
  coordinator_id: string | null
  patient_name: string
  patient_code: string | null
}

/** Espera al médico: lo pidieron, el médico todavía no lo vio y la atención no cerró. Se mira la ETAPA
 *  y no `left_at` (desde la 0068 nadie escribe esa columna). Y se mira `doctor_seen_at` porque
 *  `mark_doctor_seen` (0031) NO apaga `wants_doctor`: sin esto, la fila decía «Visto por médico» y el
 *  filtro lo seguía contando como esperando — la misma regla que los «faltan» de la cola del médico. */
export const esperaMedico = (v: FilaFiltrable) => v.wants_doctor && !v.doctor_seen_at && v.operational_stage !== 'fin_atencion'

/**
 * Los valores de una fila en una categoría. Estado puede dar DOS: su estado y «Espera al médico» —
 * por eso es una lista—, y elegir los dos muestra la unión (OR dentro de la categoría, como las demás).
 */
export function valoresDe(cat: CategoriaFiltro, v: FilaFiltrable): string[] {
  if (cat === 'estado') return esperaMedico(v) ? [estadoDeFila(v), ESPERA_MEDICO] : [estadoDeFila(v)]
  if (cat === 'protocolo') return [v.protocol_id]
  if (cat === 'medico') return [v.treating_physician ?? NONE]
  return [v.coordinator_id ?? NONE]
}

/** ¿La fila pasa los filtros? `saltear` deja afuera una categoría (para el conteo facetado). */
export function pasaFiltros(v: FilaFiltrable, f: Filtros, saltear?: CategoriaFiltro): boolean {
  for (const cat of CATEGORIAS) {
    if (cat === saltear || f[cat].length === 0) continue
    if (!valoresDe(cat, v).some((x) => f[cat].includes(x))) return false
  }
  return true
}

/**
 * La búsqueda: nombre, N° (IVRS), protocolo y código de visita. `codigo` se pasa ya calculado
 * (`visitCode` depende de campos que este módulo no tiene por qué conocer).
 */
export function coincideBusqueda(v: FilaFiltrable, codigo: string, termino: string): boolean {
  const t = termino.trim().toLowerCase()
  if (!t) return true
  return `${v.patient_name} ${v.patient_code ?? ''} ${v.protocol_code} ${codigo}`.toLowerCase().includes(t)
}

export const totalFiltros = (f: Filtros) => CATEGORIAS.reduce((n, c) => n + f[c].length, 0)

/** Cuántas filas de `base` caen en la opción `valor` de `cat`, con los filtros de las OTRAS categorías. */
export function conteoFacetado(base: FilaFiltrable[], f: Filtros, cat: CategoriaFiltro, valor: string): number {
  let n = 0
  for (const v of base) if (pasaFiltros(v, f, cat) && valoresDe(cat, v).includes(valor)) n++
  return n
}

/**
 * Las opciones de una categoría: los valores presentes en `base` MÁS los ya elegidos que no estén.
 * Lo segundo importa: al pasar a una semana donde el filtro no tiene visitas, la opción tiene que
 * seguir en el panel (marcada, con 0) para poder destildarla; si desapareciera, el filtro seguiría
 * vaciando la lista sin que haya dónde sacarlo.
 */
export function opcionesDe(base: FilaFiltrable[], f: Filtros, cat: CategoriaFiltro): string[] {
  const set = new Set<string>()
  for (const v of base) for (const x of valoresDe(cat, v)) set.add(x)
  for (const x of f[cat]) set.add(x)
  return [...set]
}

// ————————————————————————————————————————————————————
// Atajos de teclado
// ————————————————————————————————————————————————————

export type Atajo = 'anterior' | 'siguiente' | 'hoy' | 'mes' | 'semana' | 'dia'

/**
 * Qué atajo dispara una tecla (handoff, «Interactions»): ← → período · T/H hoy · M S D vista.
 *
 * NO dispara nada con un modificador (Ctrl K abre el buscador del shell, Ctrl ⇧ F el feedback), con
 * el foco en algo editable (escribir «Sánchez» en el buscador no puede cambiar de vista tres veces)
 * ni con `bloqueado`: un modal o popover abierto. El modal de la visita ya usa ↑↓/j-k para moverse
 * entre visitas, y una flecha que además cambiara el día de atrás lo dejaría mostrando una visita que
 * ya no está en la lista.
 */
export function atajoDeTecla(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  editable: boolean
  bloqueado: boolean
}): Atajo | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.editable || e.bloqueado) return null
  switch (e.key) {
    case 'ArrowLeft': return 'anterior'
    case 'ArrowRight': return 'siguiente'
    case 't': case 'T': case 'h': case 'H': return 'hoy'
    case 'm': case 'M': return 'mes'
    case 's': case 'S': return 'semana'
    case 'd': case 'D': return 'dia'
    default: return null
  }
}
