import type { TrackVisitRow } from '../data/visits'
import { daysDiffISO } from './dates'
import { KIND_LABELS, KIND_SHORT } from './visitLabels'
import type { VisitKind } from './visitLabels'

/**
 * Lógica de cronograma de visitas de un paciente, en helpers puros sobre
 * `TrackVisitRow[]`. Reusado por el Detalle de Protocolo, la Ficha del Paciente
 * y la tarjeta "Próxima visita". No mutan la entrada.
 */

/**
 * Lo MÍNIMO que hace falta para nombrar una visita. `TrackVisitRow` lo cumple sin adaptar nada
 * (tipado estructural), así que los seis consumidores que ya existen le siguen pasando su fila
 * entera y el compilador verifica que encaje.
 *
 * Existe porque el desplegable del mostrador de Farmacia también necesita nombrar visitas, y lo
 * que recibe de `visitas_dispensables` (0115) es un puñado de columnas, no una `TrackVisitRow`:
 * Farmacia no puede leer `patient_visits` (RLS 0006:162) y el RPC le devuelve lo justo. Pedirle
 * la fila completa habría obligado a inventarle campos vacíos con tal de satisfacer el tipo, que
 * es exactamente el momento en que un tipo deja de proteger y empieza a estorbar.
 */
export interface VisitTitleFields {
  visit_code: string | null
  visit_name: string | null
  kind: VisitKind
  /**
   * La visita de la que viene una continuación (v0144). OPCIONALES: `visitas_dispensables` (el
   * desplegable de Farmacia) no los trae, y ahí una continuación se lee «VNP», que es lo que es.
   */
  origin_visit_id?: string | null
  origin_code?: string | null
  origin_name?: string | null
  origin_kind?: VisitKind | null
}

/**
 * El TÍTULO de la definición de una visita, o '' si la visita no tiene definición (las sueltas).
 *
 * Desde el 2026-09-20 el título es UN SOLO texto libre —"V5 W4", "Control de seguridad"—: el
 * formulario del cuadro dejó de tener código y nombre por separado (decisión del Director) y lo
 * guarda entero en `name`, con `code` en null.
 *
 * Las definiciones VIEJAS sí tienen las dos columnas ("V6" + "W16") y se unen con un espacio, para
 * que lean igual que las nuevas. Se unen AL LEER y no con una migración: no toca datos reales, y
 * cada definición se normaliza sola el día que alguien la edite. El separador es un espacio y ya no
 * " - " justamente por eso — un título escrito de una sola vez no trae guión, y dos formatos
 * conviviendo en la misma lista se leen como dos clases de visita.
 */
function tituloDeDefinicion(v: VisitTitleFields): string {
  const codigo = v.visit_code?.trim() ?? ''
  const nombre = v.visit_name?.trim() ?? ''
  if (!codigo) return nombre
  if (!nombre) return codigo
  /* "V1 V1" no es un título, es un tartamudeo. Pasa seguido con datos reales: varios protocolos
     cargan la definición con el mismo texto en el código y en el nombre, y la pantalla lo repetía
     dos veces, como si fueran dos datos distintos.
     Se colapsa SÓLO cuando son idénticos (comparando sin espacios ni mayúsculas). Nada de
     "contiene a": con "V1" y "V1 basal" el nombre agrega información real, y descartarlo para que
     lea más lindo sería esconder un dato en una app auditable. */
  if (nombre.toLocaleLowerCase() === codigo.toLocaleLowerCase()) return codigo
  return `${codigo} ${nombre}`
}

/**
 * El nombre de la visita de la que viene una continuación, o '' si no es continuación. Se arma con
 * la MISMA regla que cualquier título (la definición, y si no hay, el tipo), para que «V3 W4» diga
 * lo mismo en la continuación que en la V3.
 */
function origenDeContinuacion(v: VisitTitleFields, corto: boolean): string {
  if (!v.origin_visit_id || !v.origin_kind) return ''
  const origen = { visit_code: v.origin_code ?? null, visit_name: v.origin_name ?? null, kind: v.origin_kind }
  return tituloDeDefinicion(origen) || (corto ? KIND_SHORT : KIND_LABELS)[v.origin_kind]
}

/**
 * Título ancho de una visita: el de su definición ("V5 W4") o el label del kind para las sueltas
 * ("VNP", "Retest"). Para títulos de modal, ficha, lista vertical.
 */
export function visitTitle(v: VisitTitleFields): string {
  const origen = origenDeContinuacion(v, false)
  return tituloDeDefinicion(v) || (origen ? `Continuación de ${origen}` : KIND_LABELS[v.kind])
}

/**
 * El mismo título, PARA PANTALLAS QUE YA MUESTRAN LA SEMANA aparte: colapsa el nombre cuando no
 * dice nada más que esa semana.
 *
 * Es la hermana de la regla de arriba, con otra fuente de repetición. Hay cronogramas cargados con
 * el nombre = la semana ("V6" / "W16"), y entonces la ficha decía «V6 W16» al lado de un bloque
 * «Semana W16». La misma palabra dos veces en el mismo renglón se lee como dos datos distintos
 * (Director, 2026-09-15).
 *
 * Desde el 2026-09-20 le queda UN solo consumidor, la ficha del paciente: el cronograma dejó de
 * mostrar la semana abajo —ahora va el día con su ventana— y usa `visitTitle` derecho.
 *
 * SE COLAPSA EL NOMBRE Y NO LA SEMANA, y sólo acá: donde la semana NO está en pantalla —el
 * desplegable de Farmacia, las filas del día, el título del modal— `visitTitle` sigue devolviendo
 * «V6 W16», que ahí es la única forma de saber de qué semana se trata. Colapsar en la fuente
 * habría borrado ese dato en seis vistas para arreglar dos.
 *
 * Exige coincidencia EXACTA con la semana derivada (`studyTime`): "W16" con semana 16 colapsa;
 * "W16 basal" no —agrega información real—, "W15" con semana 16 tampoco —si el nombre y la cuenta
 * discrepan, esconder uno de los dos sería tapar el desacuerdo, que es justo lo que hay que ver.
 */
export function visitTitleConSemanaAparte(v: TrackVisitRow): string {
  const nombre = v.visit_name?.trim()
  const st = studyTime(v)
  if (!nombre || !v.visit_code || st?.unit !== 'semana') return visitTitle(v)
  const comoSemana = nombre.match(/^W\s*(\d+)$/i)
  return comoSemana && Number(comoSemana[1]) === st.value ? v.visit_code : visitTitle(v)
}

/**
 * Rótulo COMPACTO (pastillas, celdas angostas): el título de la definición o el short del kind
 * ("VNP", "Scr"). Una programada sin definición devuelve '' y cada pantalla decide qué hacer con
 * el hueco; para un rótulo que no puede quedar vacío, `visitShortLabel`.
 *
 * Devuelve el TÍTULO ENTERO y ya no un código corto aparte, porque desde el 2026-09-20 ese código
 * corto no existe: el cuadro guarda un solo texto. Decisión del Director, sabiendo el costo — la
 * pastilla pasa de "V5" a "V5 W4". La alternativa era adivinar el código quedándose con la primera
 * palabra del título, y adivinar habría puesto "Control" en la pastilla de una visita llamada
 * "Control V5".
 */
export function visitCode(v: VisitTitleFields): string {
  const origen = origenDeContinuacion(v, true)
  return tituloDeDefinicion(v) || (origen ? `Cont. ${origen}` : KIND_SHORT[v.kind])
}

/**
 * Rótulo compacto que NUNCA queda vacío: el código si lo hay, y si no el título (`visitTitle`).
 * Es el de la línea de tiempo, la fila de paciente y la oración de "Hoy · entre … y …".
 *
 * Antes el hueco de la programada sin código se llenaba con "V{n}", donde `n` era el conteo
 * cronológico de TODAS las visitas del paciente (sueltas incluidas). Salía un "V11" con la forma
 * exacta de un código de protocolo y sin relación con él: el paciente podía estar en su V6. El
 * Director lo marcó en la ficha (2026-09-14) y el contador se fue de toda la app. `visit_name` es
 * `not null` en `visit_definitions` (0002), así que el título siempre tiene de dónde salir.
 */
export function visitShortLabel(v: TrackVisitRow): string {
  return visitCode(v) || visitTitle(v)
}

/** Agrupa visitas por patient_id (para alimentar el tracker de cada fila en listas). */
export function groupVisitsByPatient(rows: TrackVisitRow[]): Map<string, TrackVisitRow[]> {
  const map = new Map<string, TrackVisitRow[]>()
  for (const v of rows) {
    const list = map.get(v.patient_id)
    if (list) list.push(v)
    else map.set(v.patient_id, [v])
  }
  return map
}

/** Fecha "efectiva" para ordenar/ubicar: estimada (programadas) o real (sueltas). */
function effectiveDate(v: TrackVisitRow): string {
  return v.estimated_date ?? v.real_date ?? ''
}

/** Solo las visitas del cronograma (kind 'programada'); las sueltas son historial. */
export function scheduledVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return rows.filter((v) => v.kind === 'programada')
}

/* Desempate cuando dos visitas caen en la misma fecha efectiva. Orden clínico de las SUELTAS
   pre-rando: firma → screening → randomización, y la randomización ANTES de la V1 de tratamiento
   (programada offset 0, sort_order ≥ 0) porque abre el cronograma. Las programadas por su
   sort_order; las demás sueltas (vnp/retest) al final del empate. */
function tieRank(v: TrackVisitRow): number {
  if (v.kind === 'programada') return v.sort_order ?? 0
  if (v.kind === 'firma') return -3
  if (v.kind === 'firma_screening' || v.kind === 'screening') return -2
  if (v.kind === 'randomizacion') return -1
  return Number.MAX_SAFE_INTEGER
}

/** Ordena cronológicamente por fecha efectiva; desempata con tieRank (randomización antes de V1). */
export function orderVisits(rows: TrackVisitRow[]): TrackVisitRow[] {
  return [...rows].sort((a, b) => {
    const da = effectiveDate(a)
    const db = effectiveDate(b)
    if (da !== db) return da.localeCompare(db)
    return tieRank(a) - tieRank(b)
  })
}

/**
 * Posición de "hoy" entre las visitas ordenadas por fecha efectiva: la última con fecha anterior a
 * hoy (`prev`), la primera con fecha posterior (`next`), y la que cae justo hoy (`todayVisit`, si hay).
 * Sirve para marcar "Hoy" en la línea de tiempo (con el tramo a medio llenar cuando cae entre dos).
 */
export function todaySplit(rows: TrackVisitRow[], today: string): {
  prev: TrackVisitRow | null
  next: TrackVisitRow | null
  todayVisit: TrackVisitRow | null
} {
  let prev: TrackVisitRow | null = null
  let next: TrackVisitRow | null = null
  let todayVisit: TrackVisitRow | null = null
  for (const v of orderVisits(rows)) {
    const d = effectiveDate(v)
    if (!d) continue
    if (d < today) prev = v
    else if (d === today) todayVisit = v
    else if (next === null) next = v
  }
  return { prev, next, todayVisit }
}

/**
 * Tiempo de estudio de una visita, para mostrar:
 *  · TRATAMIENTO (date_mode 'automatica'): semana relativa a la randomización = round(offset/7)
 *    → "Semana W4". La randomización es la semana 0.
 *  · PRE-RANDO (date_mode 'libre': screening/run-in/rando): el DÍA de referencia crudo (-28, -59…)
 *    → "Día -28". La semana negativa ("W-8") confunde en estas visitas, así que se muestra el día.
 *  null para las sueltas (no tienen offset).
 */
export function studyTime(v: TrackVisitRow): { unit: 'semana' | 'dia'; value: number } | null {
  if (v.offset_days == null) return null
  if (v.date_mode === 'libre') return { unit: 'dia', value: v.offset_days }
  return { unit: 'semana', value: Math.round(v.offset_days / 7) }
}

/**
 * Elige la visita "actual" de una lista YA ordenada cronológicamente: la primera sin realizar o,
 * si están todas hechas, la última. null si la lista está vacía.
 * Antes esto era una cascada por estado (proxima → ventana vencida → cualquiera) que dependía de
 * que una visita a más de 7 días fuera `futura` y no matcheara la primera rama. Desde el rediseño
 * de estados (0068) ninguna pendiente es ya `futura`, así que esa cascada agarraba en la primera
 * pasada una visita lejana y salteaba una anterior con la ventana vencida. Con la lista ordenada,
 * la primera sin `real_date` ya es la respuesta correcta en todos los casos.
 */
function pickCurrent(ordered: TrackVisitRow[]): TrackVisitRow | null {
  if (ordered.length === 0) return null
  return ordered.find((v) => v.real_date === null) ?? ordered[ordered.length - 1]
}

/**
 * "Actualidad" del paciente en el CRONOGRAMA (solo programadas): para el "Visita actual V#" de
 * la ficha y la adherencia. null si no hay programadas (p. ej. pre-randomización).
 */
export function currentVisit(rows: TrackVisitRow[]): TrackVisitRow | null {
  return pickCurrent(orderVisits(scheduledVisits(rows)))
}

/** Adherencia = realizadas / programadas (solo cuentan las del cronograma; las sueltas no). */
export function adherence(rows: TrackVisitRow[]): { done: number; planned: number; pct: number } {
  const sch = scheduledVisits(rows)
  const planned = sch.length
  const done = sch.filter((v) => v.real_date !== null).length
  return { done, planned, pct: planned === 0 ? 0 : Math.round((done / planned) * 100) }
}

/** Desvío en días entre lo real y lo estimado. Positivo = vino DESPUÉS de lo previsto. */
export function desvioDias(estimated: string | null, real: string | null): number | null {
  if (!estimated || !real) return null
  return Math.round((Date.parse(real) - Date.parse(estimated)) / 86400000)
}

/**
 * El día de estudio de una visita con su ventana, para el renglón de abajo del cronograma del
 * paciente: **"Día 56 (±3 días)"**. `null` para las sueltas, que no tienen offset.
 *
 * Reemplazó al "Semana W8" que estaba ahí hasta el 2026-09-20 (pedido del Director): la semana se
 * mudó al título, que ahora se escribe entero en el cuadro, y el renglón de abajo pasó a decir el
 * dato que no estaba en ninguna parte — cuándo cae la visita y cuánto se puede correr.
 *
 * La ventana sale de las FECHAS de esta visita (`window_start`/`window_end` contra
 * `estimated_date`) y no de la definición del cuadro: son las que se generaron para este paciente,
 * y si el cuadro cambió después, lo que vale —y lo que se audita— es la ventana con la que la
 * visita se agendó.
 *
 * Dos decisiones que la hacen honesta y conviene no "simplificar":
 *  · Una ventana ASIMÉTRICA se dice como es ("−1/+3 días"). La simetría la impone el formulario de
 *    hoy, pero hay filas viejas con ventanas distintas de cada lado, y promediarlas a un ± sería
 *    afirmar algo falso sobre una fecha límite.
 *  · Una ventana de CERO no se escribe: "Día 56" ya lo dice todo y "(±0 días)" es ruido.
 */
export function ventanaDeVisita(v: TrackVisitRow): string | null {
  if (v.offset_days == null) return null
  const dia = `Día ${v.offset_days}`
  if (!v.estimated_date || !v.window_start || !v.window_end) return dia
  const menos = daysDiffISO(v.window_start, v.estimated_date)
  const mas = daysDiffISO(v.estimated_date, v.window_end)
  /* Una ventana que NO contiene a su propia fecha estimada es un dato inconsistente —pasa si la
     fecha se movió sin regenerar la ventana—, y ahí la resta da un lado negativo. Sin esta guarda
     el renglón escribía "(−31/+-25 días)": una cadena rota, que es peor que no decir nada. Se
     muestra el día solo, que es lo único que en ese estado sigue siendo cierto. */
  if (menos < 0 || mas < 0) return dia
  if (menos === 0 && mas === 0) return dia
  const unidad = (n: number) => (n === 1 ? 'día' : 'días')
  return menos === mas ? `${dia} (±${mas} ${unidad(mas)})` : `${dia} (−${menos}/+${mas} días)`
}

/** ¿La fecha real cayó FUERA de la ventana [window_start, window_end] del cronograma? */
export function fueraDeVentana(real: string | null, windowStart: string | null, windowEnd: string | null): boolean {
  if (!real || !windowStart || !windowEnd) return false
  return real < windowStart || real > windowEnd
}

/**
 * ¿La ventana de esta visita está ABIERTA hoy? Es decir: ¿ésta se puede hacer AHORA?
 *
 * Espejo temporal de `fueraDeVentana`: aquélla mira el pasado de una visita hecha (¿se cumplió?),
 * ésta el presente de una pendiente (¿se puede?). Recibe la fila entera y no tres fechas sueltas
 * porque necesita cuatro datos, y con cuatro parámetros posicionales del mismo tipo el día que se
 * inviertan dos nadie lo ve.
 *
 * Dos exclusiones que son decisiones, no descuidos:
 *  · Una visita YA ATENDIDA no entra, aunque hoy siga cayendo en su ventana (pasa seguido: se
 *    atendió el lunes y la ventana cierra el viernes). "Se puede hacer" ya no aplica.
 *  · Las SUELTAS tampoco: no tienen ventana. No es una guarda defensiva — el check
 *    `patient_visits_kind_shape` (0022) obliga a que `kind <> 'programada'` traiga las dos columnas
 *    en null, y a que las programadas las tengan siempre.
 *
 * Comparación de ISO como texto, igual que `fueraDeVentana`: con `YYYY-MM-DD` el orden
 * lexicográfico ES el cronológico, así que no entra ningún `Date` —ni su huso— en una regla de
 * calendario.
 */
export function ventanaAbierta(v: TrackVisitRow, today: string): boolean {
  if (v.real_date !== null) return false
  if (!v.window_start || !v.window_end) return false
  return today >= v.window_start && today <= v.window_end
}

/**
 * Dónde cae HOY respecto del cronograma, en una línea: "Hoy · entre VNP y V7 · Agendada".
 *
 * Vivía adentro de `PdVisitFlow`, que dibujaba una línea de tiempo horizontal donde la posición de
 * hoy se leía en el espacio (un marcador a mitad del tramo). Al pasar la fila del listado de
 * pacientes al cronograma VERTICAL, esa señal espacial se perdía: una lista de fechas no dice, por
 * sí sola, de qué lado del hoy estás parado. Es información real y barata, así que se rescata como
 * texto en vez de dejarla caer con el componente.
 *
 * Cuatro casos, y el orden importa: hoy CAE en una visita (la nombra), hoy cae ENTRE dos, hoy es
 * anterior a todas, hoy es posterior a todas. El estado que se cita es siempre el de la visita que
 * viene —la que todavía se puede hacer algo con ella—, salvo cuando ya no hay ninguna.
 */
export function ubicacionDeHoy(rows: TrackVisitRow[], today: string): string {
  const { prev, next, todayVisit } = todaySplit(rows, today)
  if (todayVisit) return `Hoy · ${visitShortLabel(todayVisit)} · ${visitStateLabel(todayVisit, today)}`
  if (prev && next) return `Hoy · entre ${visitShortLabel(prev)} y ${visitShortLabel(next)} · ${visitStateLabel(next, today)}`
  if (next) return `Hoy · antes de ${visitShortLabel(next)} · ${visitStateLabel(next, today)}`
  if (prev) return `Hoy · después de ${visitShortLabel(prev)}`
  return ''
}

/**
 * Ventana de ±radius visitas alrededor de la actual, con cuántas quedan fuera a cada lado
 * (para los controles "+N" que expanden).
 */
export function flowWindow(
  rows: TrackVisitRow[],
  currentId: string | null,
  radius = 3,
): { window: TrackVisitRow[]; moreBefore: number; moreAfter: number } {
  const ordered = orderVisits(rows)
  if (ordered.length === 0) return { window: [], moreBefore: 0, moreAfter: 0 }
  const curIdx = currentId ? ordered.findIndex((v) => v.id === currentId) : 0
  const center = curIdx < 0 ? 0 : curIdx
  let start = Math.max(0, center - radius)
  let end = Math.min(ordered.length - 1, center + radius)
  // Intentar mostrar 2*radius+1 si hay margen.
  while (end - start < radius * 2 && (start > 0 || end < ordered.length - 1)) {
    if (start > 0) start--
    else if (end < ordered.length - 1) end++
    else break
  }
  return {
    window: ordered.slice(start, end + 1),
    moreBefore: start,
    moreAfter: ordered.length - 1 - end,
  }
}

/** Los 3 estados de la pelotita —color, relleno y marca adentro— (el label granular lo da visitStateLabel). */
export type DotVisual = 'agendada' | 'en_curso' | 'completa'

/**
 * Color/relleno de la pelotita según el recorrido operativo:
 *  · agendada → GRIS    (todavía no atendida: agendada / por llegar / concurrió = sin real_date)
 *  · en_curso → CONTORNO verde (la atención empezó y la visita sigue abierta o con pendientes)
 *  · completa → RELLENO verde   (visita CERRADA: terminó la atención y no queda nada pendiente)
 * El contorno verde aparece al marcar "Inicio de atención" (real_date) y se mantiene mientras la
 * visita sigue abierta. Solo se rellena cuando se cierra (ready_at + sin pendientes): "pendiente"
 * hoy son los REPORTES sin evolucionar y el producto en investigación sin resolver
 * (`computed_status`, 0137). Los procedimientos sin reporte dejaron de contar con el rediseño del
 * modal —sólo se tildan los que dejan informe—, así que una visita que no lleva ninguno se rellena
 * apenas se cierra la atención.
 * El cierre se lee de `ready_at` y ya no de `left_at`: desde la 0068 "Fuera del sitio" salió del
 * recorrido y nadie vuelve a escribir esa columna — con la condición vieja el punto no se llenaría
 * nunca más.
 */
export function dotVisual(v: TrackVisitRow): DotVisual {
  if (v.real_date === null) return 'agendada'
  if (v.ready_at !== null && v.computed_status === 'completa') return 'completa'
  return 'en_curso'
}

export type VisitStateLabel =
  | 'Agendada' | 'En ventana' | 'Por llegar' | 'Concurrió al centro'
  | 'Inicio de atención' | 'Fin de atención'
  | 'Visita realizada' | 'Completa' | 'Sin cerrar'

/**
 * Etiqueta del estado de la visita según el recorrido operativo (lo que pasa en "Visitas del
 * día") + el checklist. `today` (ISO) distingue Agendada (futura) de Por llegar (hoy, sin llegar).
 * Los strings replican a mano los de `OPERATIONAL_STAGES` y `VISIT_STATES`
 * (views/visitStates.tsx). No se importan por una cuestión de CAPAS: `lib/` no depende de
 * `views/`. Si cambian allá, cambian acá. Dos no salen de ahí: "Sin cerrar", que es la combinación
 * de una etapa y un estado y no existe en ninguno de los dos (ver abajo), y "En ventana", que no
 * mira ninguno de los dos ejes sino el CALENDARIO (`ventanaAbierta`).
 */
export function visitStateLabel(v: TrackVisitRow, today: string): VisitStateLabel {
  // El recorrido operativo describe EL DÍA de la visita: fuera de ese día, envejece mal. Una visita
  // pasada que quedó a mitad de camino —se atendió y nunca se marcó el cierre, que con el flujo
  // viejo era lo habitual porque cerrar pedía dos marcas más— se rotularía "Inicio de atención",
  // que se lee como que la atención está empezando AHORA sobre algo de hace semanas, y encima
  // contradice al chip clínico de la misma pantalla. Una visita atendida HOY conserva su etapa
  // operativa, que es cuando esa información sirve.
  //
  // PERO "PASADA Y SIN CERRAR" NO ES "COMPLETA" (Director, 2026-09-14). Hasta ese día, para lo pasado
  // mandaba sólo el eje clínico, y una visita sin nada pendiente decía "Completa" aunque nadie le
  // hubiera marcado el fin de atención: al lado, la pelotita (`dotVisual`, que mira `ready_at`) decía
  // "en curso" y el modal "sigue fin de atención". Tres lecturas del mismo dato, una contradiciendo a
  // las otras dos. Ahora se dice lo que pasó —se atendió y no se cerró— con un rótulo que no suena a
  // "está empezando ahora". Alcanza también a la carga histórica (real_date sin ninguna marca): el
  // Director lo eligió sabiéndolo, porque es igual de cierto para esas visitas.
  if (v.real_date !== null && v.real_date < today) {
    if (v.ready_at === null) return 'Sin cerrar'
    return v.computed_status === 'completa' ? 'Completa' : 'Visita realizada'
  }
  // "Completa" solo cuando la visita está CERRADA (terminó la atención + sin checklist pendiente);
  // así coincide con el relleno del punto (ver dotVisual). Antes de eso, la etapa operativa.
  if (v.ready_at !== null && v.computed_status === 'completa') return 'Completa'
  if (v.ready_at !== null) return 'Fin de atención'
  if (v.real_date !== null) return 'Inicio de atención'
  if (v.arrived_at !== null) return 'Concurrió al centro'
  const d = v.estimated_date ?? v.real_date ?? ''
  if (d && d <= today) return 'Por llegar'
  // «En ventana» va DESPUÉS de «Por llegar», y el orden es la decisión: una vez que llegó el día
  // citado, "el paciente tiene que venir hoy" es más urgente y más preciso que "se puede hacer".
  // Así que este rótulo cubre el tramo de la ventana ANTERIOR a la fecha citada, que hasta ahora no
  // tenía nombre y se leía igual que una visita del mes que viene.
  //
  // Lo que sostiene: el cronograma tiñe la fila cuando `ventanaAbierta` es verdadero, y con este
  // orden «Agendada» NUNCA convive con el teñido — siempre hay una palabra distinta respaldando al
  // color, que es lo que pide WCAG 1.4.1 (el color no puede ser la única señal).
  if (ventanaAbierta(v, today)) return 'En ventana'
  return 'Agendada'
}

/** Edad en años desde una fecha ISO de nacimiento (YYYY-MM-DD). null si no hay fecha. */
export function ageFromBirth(birthISO: string | null): number | null {
  if (!birthISO) return null
  const [y, m, d] = birthISO.split('-').map(Number)
  if (!y || !m || !d) return null
  const today = new Date()
  let age = today.getFullYear() - y
  const monthDiff = today.getMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--
  return age
}

/** Labels con acento para el sexo (valor crudo → display). */
export const SEX_LABELS: Record<string, string> = {
  F: 'Femenino',
  M: 'Masculino',
  Otro: 'Otro',
}

/** Forma corta del sexo, para líneas compactas ("Fem. 31a", cola de Para ver médico). */
export const SEX_SHORT: Record<string, string> = {
  F: 'Fem.',
  M: 'Masc.',
  Otro: 'Otro',
}

/** Labels con acento para fertilidad (valor ascii de la base → display). */
export const FERTILITY_LABELS: Record<string, string> = {
  fertil: 'Fértil',
  no_fertil: 'No fértil',
  esterilizado: 'Esterilizado/a',
  posmenopausica: 'Posmenopáusica',
  na: 'N/A',
}

/** Opciones para el select de fertilidad en el alta (valor ascii + label). */
export const FERTILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'fertil', label: 'Fértil' },
  { value: 'no_fertil', label: 'No fértil' },
  { value: 'esterilizado', label: 'Esterilizado/a' },
  { value: 'posmenopausica', label: 'Posmenopáusica' },
  { value: 'na', label: 'N/A' },
]
