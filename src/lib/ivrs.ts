import type { PatientRow } from '../data/patients'

/**
 * El IVRS que corresponde mostrar cuando se está parado en UN estudio: el de esa inscripción, con el
 * del paciente como respaldo.
 *
 * EL CASO QUE LO HIZO NECESARIO (prod, 2026-09-15): los pacientes de LTS17231 salían con los números
 * de ACT18301 (032001500001…). Son las mismas personas en los dos estudios, pero **el número de
 * sujeto es por estudio**, y el que se mostraba era el del estudio madre (`patients.code`) porque
 * nada leía `enrollments.ivrs_code`, que existe desde la 0062.
 *
 * FALLA EN SILENCIO, y por eso es una función con tests y no un `?.` suelto en cada pantalla: un
 * número de sujeto equivocado se ve perfectamente bien —tiene la forma de un IVRS— y sólo lo detecta
 * alguien que conozca la numeración del estudio. Es dato de paciente en una app auditable.
 *
 * El respaldo NO es un adorno: `ivrs_code` es nullable (pre-randomización, filas legacy). Sin él, la
 * lista pasaría de un número equivocado a "Sin IVRS", que es peor. Y sin inscripción en ese
 * protocolo —no debería pasar en una pantalla que ya lo filtró— también cae al del paciente.
 */
export function ivrsDelEstudio(patient: Pick<PatientRow, 'code' | 'enrollments'>, protocolId: string): string | null {
  const insc = patient.enrollments.find((e) => e.protocol?.id === protocolId)
  return insc?.ivrs_code ?? patient.code
}
