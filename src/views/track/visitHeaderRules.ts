import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { OPERATIONAL_STAGES, STAGE_ORDER } from '../visitStates'
import { advanceRole } from './advanceStep'
import { ageFromBirth, desvioDias, SEX_LABELS, FERTILITY_LABELS } from '../../lib/visits'
import { addDaysISO, formatAR } from '../../lib/dates'

/**
 * Reglas puras del encabezado de la visita (rediseño `docs/handoff-visitas-encabezado/`).
 *
 * POR QUÉ VIVEN ACÁ Y NO ADENTRO DEL JSX: son las que pueden estar al revés **sin que se vea**.
 * Un riel mal llenado o una etiqueta corrida se detectan mirando la pantalla; que
 * `muestraFechaReal` devuelva `true` de más, no — la pantalla se ve impecable y la visita
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
 * ¿El segundo campo de fechas está mostrando la fecha REAL? Si no, está mostrando la citación.
 *
 * Gobierna las TRES cosas del campo a la vez —el rótulo ("Fecha realizada" o "Fecha programada";
 * hasta el 2026-09-14, "Fecha real" o "Citado"), el valor que
 * pinta y la columna que escribe al guardar—, y que sea UN solo predicado es el punto: si el
 * rótulo se decidiera por un lado y el destino del guardado por otro, el campo podría decir
 * "Citado" y escribir en `real_date`.
 *
 * Y ESO ES EL GUARD, no una preferencia de diseño. La etapa operativa se DERIVA de las marcas, y
 * `real_date` no nula ES "Inicio de atención" (0069): escribirla desde este campo en una visita
 * "Por llegar" la saltaría dos etapas del recorrido, sin que nadie haya atendido a nadie. Al mirar
 * `real_date`, el campo sólo puede escribirla cuando ya existe — corregir nunca mueve la ruta.
 * La fecha la CREA "Iniciar atención" (`start_visit_attention`, 0102), nunca este campo.
 *
 * Antes se llamaba `puedeEditarFechaReal` y era el candado de edición del campo "Fecha real"
 * (decisión del Director, 2026-08-13). Con los dos campos fundidos en uno (2026-08-29) el mismo
 * predicado pasó a decidir además qué se muestra; cambió el nombre, no la regla.
 *
 * Deuda anotada en `TODOS.md` ("desacoplar la etapa operativa de la fecha real"): si algún día la
 * atención tiene su propia marca de etapa, el guard deja de hacer falta — pero el interruptor
 * entre citación y fecha real sigue siendo éste.
 */
export function muestraFechaReal(visit: Pick<DayVisitRow, 'real_date'>): boolean {
  return visit.real_date != null
}

/**
 * En qué DÍA hay que pararse en «Visitas» para que esta visita esté en la lista, o `null` si no hay
 * ninguno.

 * Es exactamente la contracara de lo que consulta `useVisitsForDay`: esa vista trae las de
 * `estimated_date = día` **o** `real_date = día`, así que la realizada manda cuando existe —una
 * visita atendida otro día vive en el día que vino, no en el que estaba citada— y la programada
 * cubre a las que todavía no se atendieron.
 *
 * ESTO FALLA SIN VERSE, y por eso está acá con test: elegir el campo equivocado no rompe nada
 * —navega, abre el día, no tira ningún error— y la visita simplemente no está, que es el síntoma
 * exacto que este botón vino a resolver. Una suelta sin ninguna de las dos fechas no tiene día: el
 * llamador no ofrece el salto en vez de mandar a una pantalla vacía.
 */
export function diaDeLaVisita(visit: Pick<DayVisitRow, 'real_date' | 'estimated_date'>): string | null {
  return visit.real_date ?? visit.estimated_date ?? null
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
// El sello de la atención (0102)
// ————————————————————————————————————————————————————

/**
 * La fecha que el CRONOGRAMA manda para esta visita, o null si el protocolo no manda ninguna.
 *
 * Es el primero de los tres tiempos que el encabezado distingue desde el 2026-08-29: lo que dice
 * el protocolo · para cuándo la citamos (`estimated_date`) · cuándo vino (`real_date`). Antes los
 * dos primeros estaban fundidos en un campo llamado "Fecha est.", que en realidad mostraba la
 * citación —es la que cambia al reagendar—, no lo que manda el estudio.
 *
 * EL ANCLA ES LA RANDOMIZACIÓN, NO EL ENROLAMIENTO, y ésta es la parte que hay que no equivocar:
 * el generador vigente (`generate_patient_visits`, 0022) inserta el cronograma con
 * `randomization_date + offset_days`. La versión de la 0003 usaba `enrollment_date` y quedó
 * superada por la 0021/0022 — derivar desde ahí daría una fecha equivocada en TODA visita de
 * tratamiento, y equivocada en silencio: se vería como una fecha perfectamente plausible.
 *
 * DEVUELVE NULL EN CUATRO CASOS, y ninguno es un descuido:
 *   · `kind <> 'programada'` — firma, screening y randomización son visitas SUELTAS: se crean de a
 *     una y el protocolo no les fija fecha. No hay nada que derivar.
 *   · `date_mode = 'libre'` — el cronograma declara que esa visita se agenda a criterio del centro.
 *     Su `offset_days` existe pero es una referencia, no una fecha mandada.
 *   · sin `offset_days` o sin fecha de randomización — falta el término de la cuenta.
 * En todos ellos el encabezado muestra "—". Es la respuesta honesta: el protocolo no manda fecha,
 * y ponerle una calculada igual sería inventar el número contra el que después se mide un desvío.
 *
 * Se deriva y no se guarda: el cronograma se edita (`ScheduleEditor`), así que esto contesta "qué
 * dice el protocolo HOY". Para una visita generada antes de un cambio de cronograma, el resultado
 * puede no coincidir con el `estimated_date` con el que nació — y así tiene que ser: la citación
 * quedó registrada en su propio campo.
 */
export function fechaSegunProtocolo(
  visit: Pick<DayVisitRow, 'kind' | 'date_mode' | 'offset_days' | 'enrollment_randomization_date'>,
): string | null {
  if (visit.kind !== 'programada') return null
  if (visit.date_mode === 'libre') return null
  if (visit.offset_days == null || visit.enrollment_randomization_date == null) return null
  // `addDaysISO` y no `new Date(iso)`: aquél parsea en UTC y correría el día.
  return addDaysISO(visit.enrollment_randomization_date, visit.offset_days)
}

/**
 * ¿La fecha estimada NO APLICA a esta visita? Decide si el campo vacío dice "N/A" o "—".
 *
 * `fechaSegunProtocolo` devuelve null por dos motivos que en pantalla no pueden verse iguales:
 *   · el protocolo NO MANDA fecha (visita suelta, agenda libre) → "N/A": no hay nada que esperar.
 *   · el protocolo sí manda, pero falta un término de la cuenta (sin randomización, sin offset)
 *     → "—": hay una fecha que todavía no se puede calcular.
 * La raya sola en una VNP no se entendía (Director, 2026-09-14). La alternativa que se descartó
 * fue repetir la fecha realizada: eso inventa una estimación que nadie hizo y la muestra como dato
 * de referencia, que en una app auditable es peor que decir que no aplica.
 */
export function estimadaNoAplica(visit: Pick<DayVisitRow, 'kind' | 'date_mode'>): boolean {
  return visit.kind !== 'programada' || visit.date_mode === 'libre'
}

/**
 * Cuántos días se corrió la visita de lo que manda el protocolo. Positivo = vino DESPUÉS.
 *
 * Es `desvioDias` anclado en la fecha del PROTOCOLO y no en la citación, y existe como función con
 * nombre justamente para que ese anclaje sea la cosa que se testea. El cronograma lo muestra bajo
 * la fecha de cada fila («est 12/08 · +2 d») desde que el Director pidió que abajo vaya la estimada
 * (2026-09-20): antes decía «prog» y restaba contra `estimated_date`, así que el número y la fecha
 * de al lado hablaban de la misma cosa. Ahora no lo harían — y una resta que quedó viva bajo un
 * rótulo nuevo no se ve rota, sólo da un número plausible que no es el que dice ser.
 *
 * `null` cuando el protocolo no manda fecha (suelta, agenda libre, sin randomización) o la visita
 * todavía no se atendió: en los dos casos falta un término, y ponerle un número igual sería
 * inventar la referencia contra la que se mide.
 */
export function desvioSegunProtocolo(
  visit: Pick<DayVisitRow, 'kind' | 'date_mode' | 'offset_days' | 'enrollment_randomization_date' | 'real_date'>,
): number | null {
  return desvioDias(fechaSegunProtocolo(visit), visit.real_date)
}

/* ACÁ VIVÍA `horaDeAtencion` (0102), que daba la hora del sello de inicio para mostrarla al lado
   de la fecha realizada. Se retiró el 2026-09-16 junto con esa hora: el Director la vio decir 10:40
   arriba mientras la barra de abajo decía "Fin de atención 13:09" sobre la misma visita. El sello
   sigue en la base (`attended_at`); lo que se fue es mostrarlo ahí. Si alguna vez vuelve, ojo con
   lo que la función cuidaba: comparar el DÍA del sello con `real_date` usando `Date` y no
   `slice(0, 10)`, porque el ISO llega en UTC y las atenciones de después de las 21:00 caen al día
   siguiente. Está en el historial de git, con sus cinco tests. */

// ————————————————————————————————————————————————————
// Coordinador de la visita
// ————————————————————————————————————————————————————

/** Una opción del desplegable de coordinador. */
export interface OpcionCoordinador { value: string; label: string }

/**
 * Las opciones del chip de coordinador: las del protocolo, más —si hace falta— el que la visita
 * TIENE asignado aunque no esté entre ellas.
 *
 * ESA ÚLTIMA LÍNEA ES TODA LA FUNCIÓN, y viene de un bug real (2026-08-30). Desde la 0102, marcar
 * el inicio de atención sella como coordinador a quien apretó el botón **sin validarlo contra
 * `protocol_coordinators`** (decisión del Director). Gerencia ve todas las visitas, así que puede
 * quedar sellada en un protocolo que no coordina — y entonces su id no está entre las opciones.
 *
 * Un desplegable que no encuentra su propio valor cae al placeholder, así que el modal mostraba
 * **"Asignar coordinador" sobre una visita que YA tenía coordinador**, mientras la fila de al lado
 * mostraba el nombre correcto (lo lee del snapshot `coordinator_name`, que no depende de esta
 * lista). Dos pantallas del mismo dato diciendo cosas distintas, y la que mentía era la que
 * invitaba a escribir.
 *
 * Se resuelve mostrando lo que hay, que es la regla de la casa: el valor asignado se agrega como
 * opción con su nombre sellado. No se lo marca como anómalo en la etiqueta — el chip tiene ancho de
 * chip— y no hace falta: quien mire la lista desplegada ve que esa persona no está entre las del
 * protocolo.
 *
 * `coordinator_name` puede ser null en filas viejas (la columna nació con la 0065 y las anteriores
 * quedaron sin snapshot). Ahí se etiqueta genérico antes que dejar una opción sin texto: el chip
 * diría "Asignar coordinador" otra vez, que es exactamente el bug.
 */
export function opcionesDeCoordinador(
  visit: Pick<DayVisitRow, 'coordinator_id' | 'coordinator_name'>,
  delProtocolo: { id: string; full_name: string }[],
): OpcionCoordinador[] {
  const opciones: OpcionCoordinador[] = [
    { value: '', label: '— Sin asignar —' },
    ...delProtocolo.map((c) => ({ value: c.id, label: c.full_name })),
  ]
  const asignado = visit.coordinator_id
  if (asignado && !opciones.some((o) => o.value === asignado)) {
    opciones.push({ value: asignado, label: visit.coordinator_name ?? 'Coordinador asignado' })
  }
  return opciones
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
