import type { PatientEnrollment, PatientRow } from '../data/patients'

/**
 * El estado de una INSCRIPCIÓN (`enrollments.status`, enum de 0001), que es el que manda dentro de
 * un estudio.
 *
 * Ojo con el otro «activo»: `patients.status` es de la PERSONA y quedó LEGACY con la 0127. Los dos
 * se llamaban igual en pantalla y por eso dar de baja en ACT18301 daba de baja también en LTS17231,
 * que es su extensión y tiene a las mismas personas inscriptas (prod, 2026-09-16).
 */
export type EnrollmentStatus = 'screening' | 'activo' | 'completado' | 'discontinuado'

/** Cómo se dice cada estado en pantalla (va al `title` y al `aria-label` del punto y la bandera). */
export const ETIQUETA_ESTADO: Record<EnrollmentStatus, string> = {
  screening: 'En screening',
  activo: 'Activo en el estudio',
  completado: 'Completó el estudio',
  discontinuado: 'Discontinuado',
}

/**
 * Lo mismo en UNA palabra, para la bandera de la esquina de la tarjeta: ahí el texto va a 9,5px en
 * mayúsculas y "Activo en el estudio" no es una etiqueta, es una oración.
 *
 * SON CUATRO PALABRAS Y NO DOS. El handoff de diseño dibujaba «Activo»/«Inactivo» —con 47 de 48
 * pacientes activos es lo que se ve en pantalla casi siempre—, pero el dato tiene cuatro valores y
 * la bandera existe justamente para no depender del `title`: decirle «INACTIVO» a alguien que
 * completó el estudio sería decir MENOS de lo que hoy dice el punto al apuntarlo (Director,
 * 2026-09-17). El COLOR sigue siendo binario —abierto o cerrado, que es lo que decide
 * `estaAbierta`—; la palabra es la que matiza.
 */
export const PALABRA_ESTADO: Record<EnrollmentStatus, string> = {
  screening: 'Screening',
  activo: 'Activo',
  completado: 'Completado',
  discontinuado: 'Discontinuado',
}

/**
 * Motivos de cierre. Quien opera elige un HECHO CLÍNICO y la app deriva el valor técnico: «pasó a la
 * extensión» y «retiró el consentimiento» son las dos un cierre, pero una es buena y la otra no, y
 * pedirle a una coordinadora que elija entre `completado` y `discontinuado` es pedirle que traduzca.
 *
 * ESPEJO DEL `case` DE LA 0127: los siete `value` tienen que existir en la función `close_enrollment`
 * y en su check constraint. Si se desincronizan, la RPC levanta 23514 y el front muestra el mensaje:
 * la duplicación es inevitable (una vive en la base y la otra en el desplegable) pero falla RUIDOSA.
 */
export const MOTIVOS_DE_CIERRE: readonly { value: string; label: string; estado: EnrollmentStatus }[] = [
  { value: 'completo', label: 'Completó el estudio', estado: 'completado' },
  { value: 'extension', label: 'Pasó a la extensión', estado: 'completado' },
  { value: 'consentimiento', label: 'Retiró el consentimiento', estado: 'discontinuado' },
  { value: 'exclusion', label: 'Criterio de exclusión', estado: 'discontinuado' },
  { value: 'evento_adverso', label: 'Evento adverso', estado: 'discontinuado' },
  { value: 'perdida_seguimiento', label: 'Pérdida de seguimiento', estado: 'discontinuado' },
  { value: 'investigador', label: 'Decisión del investigador', estado: 'discontinuado' },
]

/** El estado que deja un motivo, o null si el motivo no es de los siete. */
export function estadoDelMotivo(motivo: string): EnrollmentStatus | null {
  return MOTIVOS_DE_CIERRE.find((m) => m.value === motivo)?.estado ?? null
}

/**
 * ¿La inscripción sigue en curso? Screening y activo sí; completado y discontinuado no.
 *
 * Sin dato cuenta como ABIERTA a propósito: un `null` llega cuando una consulta no trajo la columna,
 * y pintar de cerrado a medio padrón por una consulta incompleta es peor que no pintar nada.
 */
export function estaAbierta(status: EnrollmentStatus | null | undefined): boolean {
  return status !== 'completado' && status !== 'discontinuado'
}

/**
 * La inscripción que corresponde cuando se está parado en UN estudio. Mismo criterio que
 * `ivrsDelEstudio`: la misma persona en dos estudios tiene DOS inscripciones y cada una lleva su
 * propio estado.
 */
export function inscripcionDelEstudio(
  patient: Pick<PatientRow, 'enrollments'>,
  protocolId: string,
): PatientEnrollment | null {
  return patient.enrollments.find((e) => e.protocol?.id === protocolId) ?? null
}

/**
 * ¿La persona sigue en seguimiento en el centro? Reemplaza a `patients.status`, que era una sola
 * columna para todos los estudios.
 *
 * SIN NINGUNA INSCRIPCIÓN cuenta como activa: es el paciente recién dado de alta, antes de
 * inscribirlo a un estudio. La regla literal («alguna abierta») lo dejaría inactivo apenas se crea.
 */
export function personaActiva(patient: Pick<PatientRow, 'enrollments'>): boolean {
  if (patient.enrollments.length === 0) return true
  return patient.enrollments.some((e) => estaAbierta(e.status))
}
