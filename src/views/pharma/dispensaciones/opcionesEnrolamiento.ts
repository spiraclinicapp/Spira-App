import type { PatientRow } from '../../../data/patients'

/**
 * Las opciones del primer desplegable del alta manual de Farmacia.
 *
 * LO QUE ARREGLA, Y POR QUÉ IMPORTA MÁS AHORA: el panel armaba estas opciones con un `map` sobre
 * pacientes y después resolvía el enrolamiento como `paciente.enrollments[0]`, descartando el
 * resto. Un paciente puede estar en VARIOS protocolos a la vez, y la medicación habilitada, las
 * visitas y los lotes cuelgan del ENROLAMIENTO, no de la persona: con dos enrolamientos, la mitad
 * de las dispensaciones se imputaban al protocolo equivocado.
 *
 * Hasta la 0115 eso casi no mordía, porque el desplegable de visitas filtraba tan fuerte
 * (`vd.dispenses = true`) que la lista quedaba vacía y el error se notaba. Al abrir ese filtro se
 * pierde el amortiguador: quedaría una vía activa para dispensar fuera de cronograma contra el
 * protocolo que no era, y con el medicamento habilitado en los dos protocolos NO FALLA NUNCA —
 * queda una dispensación imputada al sponsor equivocado, sin error en ninguna pantalla.
 *
 * La solución es un renglón por ENROLAMIENTO en vez de uno por paciente. Sale más barato que el
 * bug: desaparece el paso "elegir paciente y después protocolo" y con él todo el estado que haría
 * falta para manejarlo. Para el paciente con un solo protocolo —la enorme mayoría— la etiqueta no
 * cambia en nada, así que el arreglo es invisible: por eso vive acá, con test, y no en un `useMemo`.
 */

/** Una opción del desplegable. `value` es el ENROLAMIENTO, que es lo que el panel necesita para
 *  todo lo que viene después (visitas dispensables y medicación habilitada cuelgan de él). */
export interface OpcionEnrolamiento {
  value: string
  label: string
  /** El paciente dueño del enrolamiento, para las pantallas que todavía razonan por persona. */
  patientId: string
}

/**
 * Un renglón por enrolamiento con protocolo, ordenados como vinieron los pacientes.
 *
 * Se descartan los enrolamientos sin código de protocolo: sin protocolo no hay visitas
 * dispensadoras ni medicación habilitada, así que ofrecerlos sería un callejón sin salida.
 *
 * La etiqueta abre con el NOMBRE. Los pacientes que todavía no tienen IVRS (se asigna en la
 * randomización) aparecían todos como "Sin IVRS · PROT-A", sin forma de distinguirlos — y elegir
 * el equivocado en una dispensación es grave.
 */
export function opcionesDeEnrolamiento(patients: PatientRow[] | null | undefined): OpcionEnrolamiento[] {
  return (patients ?? []).flatMap((p) =>
    (p.enrollments ?? [])
      .filter((e) => !!e.protocol?.code)
      .map((e) => ({
        value: e.id,
        label: `${p.full_name} · ${p.code ?? 'Sin IVRS'} · ${e.protocol!.code}`,
        patientId: p.id,
      })),
  )
}
