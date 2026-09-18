/* Las reglas PURAS de las desviaciones de protocolo (0131).
 *
 * Viven acá y no en `deviations.ts` por lo mismo que `alertDismissalModel.ts`: aquel archivo
 * importa el cliente de Supabase —que lee `window` al cargarse— y estas reglas son comparación de
 * cadenas. Separadas, se pueden testear sin montar nada.
 *
 * QUÉ RESUELVEN, que es lo que explica por qué existe la tabla: una ventana vencida no tenía
 * salida. Sale de la lista cargando la visita (y entonces deja de estar vencida) o descartando la
 * alerta (0070) con un motivo que dice "esto no correspondía". Ninguna de las dos dice lo que de
 * verdad pasó, que es una desviación de protocolo — así que nadie vaciaba la lista y el sedimento
 * crecía sin techo. Documentar es la salida honesta.
 *
 * Lo que se testea es lo que puede quedar al revés SIN VERSE: las tres reglas de acá filtran
 * listas, y un filtro invertido no rompe nada que se mire — muestra de más o de menos. En un
 * sistema auditable, una alerta que no aparece es peor que una de más.
 */

/** Fila de `protocol_deviations` (0131). */
export interface ProtocolDeviationRow {
  id: string
  visit_id: string
  /** `window_end` de la ventana que se venció. Parte de la identidad del desvío. 0131. */
  anchor: string
  reason: string
  /** Obligatorio desde la base (check de no-vacío). 0131. */
  detail: string
  recorded_by: string
  /**
   * Nombre y puesto de quien documentó, DESNORMALIZADOS en la fila (0131, mismo motivo que
   * `author_name` en la 0048 y `dismissed_by_name` en la 0070): la RLS de `users` sólo muestra la
   * fila propia, así que un join ocultaría el autor para todo el que no sea gerencia. Es el puesto
   * de entonces.
   */
  recorded_by_name: string
  recorded_by_role: string
  recorded_at: string
}

/**
 * Los seis motivos, definidos por el Director (2026-09-17).
 *
 * "Otro" va a secas y no "Otro (explicar)": acá la explicación se pide SIEMPRE, así que el
 * paréntesis prometía una distinción que no existe.
 *
 * Los valores tienen que ser EXACTAMENTE los del `check` de la 0131. Si se desincronizan, la base
 * levanta un `23514` y el front muestra "El motivo no es válido" — falla ruidosa, que es lo que se
 * quiere de una duplicación inevitable (mismo criterio que el vocabulario de cierre en la 0127).
 */
export const DEVIATION_REASONS: { value: string; label: string }[] = [
  { value: 'no_concurrio',            label: 'El paciente no concurrió y no avisó' },
  { value: 'pidio_otra_fecha',        label: 'El paciente no pudo venir y pidió otra fecha' },
  { value: 'motivo_clinico',          label: 'Motivo clínico del paciente (internación, evento adverso, enfermedad intercurrente)' },
  { value: 'centro_no_pudo',          label: 'El centro no pudo (feriado, agenda, falta de producto)' },
  { value: 'cronograma_mal_generado', label: 'El cronograma estaba mal generado' },
  { value: 'otro',                    label: 'Otro' },
]

/** Etiqueta legible de un motivo guardado; el valor crudo si viniera uno desconocido. */
export function deviationReasonLabel(value: string): string {
  return DEVIATION_REASONS.find((r) => r.value === value)?.label ?? value
}

/**
 * ¿El formulario está listo para confirmarse? Motivo elegido y explicación con algo más que
 * espacios.
 *
 * A DIFERENCIA DE `descarteListo` (0070), la explicación se exige SIEMPRE y no sólo con el motivo
 * "otro": el lector de esto, meses después, es un monitor, y un motivo de catálogo solo no le dice
 * nada. El check de la base lo exige igual; esta función existe para que el botón no prometa algo
 * que la base va a rebotar — un botón habilitado que rebota es una promesa rota, no una
 * validación.
 */
export function desviacionLista(reason: string, detail: string): boolean {
  return reason !== '' && detail.trim() !== ''
}

/**
 * Los estados de inscripción CERRADOS: los dos que escribe `close_enrollment` (0127).
 *
 * LA REGLA VA POR EXCLUSIÓN Y NO POR `=== 'activo'`, que es el error fácil y mudo. El enum
 * `enrollment_status` (0001) tiene CUATRO valores —`screening`, `activo`, `completado`,
 * `discontinuado`— y **una inscripción en `screening` está abierta**: ese paciente está en
 * selección y sus visitas hay que atenderlas. Filtrar por "activo" las haría desaparecer de la
 * lista sin un solo error en consola, y un quinto valor futuro se caería solo del tablero.
 */
export const ESTADOS_DE_INSCRIPCION_CERRADOS: readonly string[] = ['completado', 'discontinuado']

export function inscripcionCerrada(enrollmentStatus: string): boolean {
  return ESTADOS_DE_INSCRIPCION_CERRADOS.includes(enrollmentStatus)
}

/**
 * ¿Esta visita ya tiene documentada la desviación de ESTA ventana?
 *
 * El ancla es el punto fino, igual que la huella de los descartes: sin ella, documentar una vez
 * taparía la visita para siempre, incluso si se reprograma y vence una ventana NUEVA — que sería
 * un vencimiento oculto, exactamente lo que este módulo existe para evitar.
 *
 * TIENE QUE ESPEJAR AL SERVIDOR: el ancla la calcula `record_protocol_deviation` (0131) leyendo
 * `window_end` de la visita, y acá se compara contra lo guardado. Si los dos lados eligieran
 * columnas distintas, ninguna desviación coincidiría nunca —o peor, coincidiría de más y taparía
 * una ventana que no correspondía—.
 */
export function isVisitDeviationRecorded(
  deviations: readonly ProtocolDeviationRow[],
  visit: { id: string; window_end: string | null },
): boolean {
  if (!visit.window_end) return false
  return deviations.some((d) => d.visit_id === visit.id && d.anchor === visit.window_end)
}
