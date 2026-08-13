import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'
import { advanceRole } from './advanceStep'
import { ageFromBirth, SEX_LABELS, FERTILITY_LABELS } from '../../lib/visits'
import { formatAR } from '../../lib/dates'

/**
 * Reglas puras del encabezado de la visita (rediseño `docs/handoff-visitas-encabezado/`).
 *
 * POR QUÉ VIVEN ACÁ Y NO ADENTRO DEL JSX: son las que pueden estar al revés **sin que se vea**.
 * Un riel mal llenado o una etiqueta corrida se detectan mirando la pantalla; que
 * `puedeEditarFechaReal` devuelva `true` de más, no — la pantalla se ve impecable y la visita
 * termina marcada como atendida sin que nadie la haya atendido. Extraídas, tienen test
 * (`visitHeader.test.ts`) y el gate de `npm run build` las cuida. Mismo criterio que
 * `views/pharma/dispensaciones/estados.ts`.
 *
 * Todas toman la forma MÍNIMA de fila que necesitan (`Pick<DayVisitRow, …>`), no la fila entera:
 * así el test arma casos de dos campos en vez de fabricar un `DayVisitRow` completo.
 */

// ————————————————————————————————————————————————————
// Candados
// ————————————————————————————————————————————————————

/**
 * "Concretada" = fin de atención marcado. Se mira `operational_stage` y no `ready_at` porque la
 * etapa es lo que la vista ya derivó (0068/0069: `ready_at is not null → fin_atencion`), y así hay
 * UNA sola definición de concretada en el front. El servidor usa la misma condición en
 * `set_visit_physician` (0079).
 */
export function estaConcretada(visit: Pick<DayVisitRow, 'operational_stage'>): boolean {
  return visit.operational_stage === 'fin_atencion'
}

/**
 * ¿Se puede editar la fecha REAL? Solo si ya existe (decisión del Director, 2026-08-13).
 *
 * El handoff pide las dos fechas siempre editables y afirma que "corregirla no mueve la ruta".
 * Con el modelo actual eso es falso al crearla: la etapa se DERIVA de las marcas y `real_date`
 * no nula ES "Inicio de atención" (0069), así que escribirla en una visita "Por llegar" la
 * saltaría dos etapas. Corregir una que ya existe, en cambio, nunca cambia la etapa —
 * `real_date` sigue siendo no nula antes y después—, que es exactamente lo que el handoff
 * promete. La fecha la CREA "Iniciar atención"; este campo solo la corrige.
 *
 * Deuda anotada en `TODOS.md` ("desacoplar la etapa operativa de la fecha real"): si algún día
 * la atención tiene su propia marca, esta función se cae y el campo pasa a ser siempre editable.
 */
export function puedeEditarFechaReal(visit: Pick<DayVisitRow, 'real_date'>): boolean {
  return visit.real_date != null
}

/**
 * ¿Se puede editar el médico a cargo? Editable mientras la visita no esté concretada. El mismo
 * candado lo aplica el servidor (`set_visit_physician`, 0079), así que esto es presentación: sin
 * él la pantalla ofrecería un botón que la base va a rechazar.
 */
export function puedeEditarMedico(visit: Pick<DayVisitRow, 'operational_stage'>): boolean {
  return !estaConcretada(visit)
}

/** Ídem para el coordinador. Ojo: acá el candado es SOLO de pantalla — `set_visit_coordinator`
 *  (0065) no lo valida server-side y no se le agregó en la 0079 para no cambiarle el
 *  comportamiento a una función en producción. Ver el comentario de la migración. */
export function puedeEditarCoordinador(visit: Pick<DayVisitRow, 'operational_stage'>): boolean {
  return !estaConcretada(visit)
}

// ————————————————————————————————————————————————————
// Médico a cargo
// ————————————————————————————————————————————————————

/**
 * Médico a cargo que se muestra. Desde la 0079 la vista ya devuelve
 * `coalesce(visita, paciente)`, así que acá solo se normaliza el vacío: una cadena en blanco es
 * "sin médico", no un nombre de cero caracteres pintado como si existiera.
 *
 * Editarlo ADOPTA el heredado: el editor arranca con este valor, así que guardar sin tocar nada
 * copia el médico del paciente a la visita y lo congela ahí. Es deliberado — a partir de ese
 * momento la visita recuerda quién era su médico aunque el del paciente cambie después.
 */
export function medicoDeVisita(visit: Pick<DayVisitRow, 'treating_physician'>): string | null {
  const n = visit.treating_physician?.trim()
  return n ? n : null
}

// ————————————————————————————————————————————————————
// Barra de acción: listón, riel y contexto
// ————————————————————————————————————————————————————

/** Posición en el recorrido: "2 de 4" y el llenado del riel (25/50/75/100 %, handoff §7). */
export function etapaProgreso(stage: OperationalStage): { paso: number; total: number; pct: number } {
  const total = STAGE_ORDER.length
  // Una etapa desconocida (fila vieja en caché tras un cambio de enum) cae en el paso 1 en vez de
  // dar 0 o NaN: el riel queda vacío pero la barra no se rompe.
  const i = STAGE_ORDER.indexOf(stage)
  const paso = (i < 0 ? 0 : i) + 1
  return { paso, total, pct: Math.round((paso / total) * 100) }
}

/**
 * La frase que acompaña a la etapa en el listón. El handoff (§7) da tres ejemplos y no la regla;
 * esta es la regla que los explica a los tres:
 *
 *   por_llegar (única etapa SIN marca)  → "la marca la hace Recepción"  ← lo útil es QUIÉN arranca
 *   ya arrancó                          → "sigue inicio de atención"    ← lo útil es QUÉ viene
 *   fin_atencion (terminal)             → "ruta completa"
 *
 * El rol y la etapa siguiente NO se escriben a mano: salen de `advanceRole` y `STAGE_ORDER`, que
 * son los mismos que gobiernan el botón. Si mañana cambia quién marca qué (ya pasó en la 0068),
 * cambia en un solo lugar y esta frase lo sigue.
 */
export function contextoDeEtapa(stage: OperationalStage): string {
  if (stage === 'fin_atencion') return 'ruta completa'
  if (stage === 'por_llegar') {
    return advanceRole(stage) === 'reception' ? 'la marca la hace Recepción' : 'la marca el clínico'
  }
  const i = STAGE_ORDER.indexOf(stage)
  const siguiente = STAGE_ORDER[i + 1]
  if (!siguiente) return ''
  // "Inicio de atención" → "sigue inicio de atención": la etiqueta va en minúscula porque entra
  // en el medio de una frase, no como título.
  const label = OPERATIONAL_STAGES[siguiente]?.label ?? ''
  return `sigue ${label.charAt(0).toLowerCase()}${label.slice(1)}`
}

/**
 * Hora de la marca de la etapa ACTUAL, o null si esa etapa no tiene hora que mostrar.
 *
 * `inicio_atencion` devuelve null a propósito, y no es un olvido: esa etapa se deriva de
 * `real_date`, que es un `date` **sin hora** (las otras dos salen de `arrived_at` / `ready_at`,
 * que son `timestamptz`). El mock dibuja una hora ahí; el dato no existe, así que la barra
 * muestra la etapa sin hora en vez de inventar una. Anotado en `TODOS.md`.
 */
export function marcaDeEtapa(
  visit: Pick<DayVisitRow, 'arrived_at' | 'ready_at' | 'operational_stage'>,
): string | null {
  if (visit.operational_stage === 'concurrio_al_centro') return visit.arrived_at
  if (visit.operational_stage === 'fin_atencion') return visit.ready_at
  return null
}

// ————————————————————————————————————————————————————
// Datos del paciente (rejilla del encabezado)
// ————————————————————————————————————————————————————

export interface DatoPaciente { k: string; v: string }

/**
 * Las celdas de la rejilla de datos, en orden. **La celda que no aplica NO se dibuja** (checklist
 * de QA del handoff: "«Fértil» ausente no deja hueco"), así que se devuelve la lista ya filtrada
 * en vez de una con huecos que el JSX tenga que saltear.
 *
 * Los cuatro datos vienen de `v_track_visits`: sexo y nacimiento desde la 0049, fertilidad desde
 * la 0079. Antes la fertilidad exigía una segunda consulta al paciente que llegaba después y
 * recomponía el encabezado a la vista del usuario.
 */
export function datosDelPaciente(
  visit: Pick<DayVisitRow, 'sex' | 'birth_date' | 'fertility'>,
): DatoPaciente[] {
  const out: DatoPaciente[] = []
  if (visit.sex) out.push({ k: 'Sexo', v: SEX_LABELS[visit.sex] ?? visit.sex })
  const edad = ageFromBirth(visit.birth_date)
  if (edad !== null) out.push({ k: 'Edad', v: `${edad} años` })
  if (visit.birth_date) out.push({ k: 'F. nacimiento', v: formatAR(visit.birth_date) })
  if (visit.fertility) out.push({ k: 'Fértil', v: FERTILITY_LABELS[visit.fertility] ?? visit.fertility })
  return out
}
