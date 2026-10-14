import type { OperationalStage } from '../../data/dayVisits'

/**
 * ┌─ En qué anda la jornada: el KPI «Visitas de hoy» del Resumen ──────────────────────────────────┐
 *
 * Reparte las visitas de hoy en tres grupos que no se pisan, para la barra de la tarjeta (handoff
 * `design_handoff_kpis_visitas`, más el «en el centro» que pidió el Director el 2026-10-13):
 *
 *   · REALIZADAS — atención terminada (`fin_atencion`).
 *   · EN EL CENTRO — llegó y todavía no terminó (`concurrio_al_centro` o `inicio_atencion`). Es lo
 *     vivo de la tarjeta: alguien está adentro y hay algo que hacer ahora.
 *   · POR LLEGAR — `por_llegar` y SIN «no vino». Una ausencia marcada no está por llegar: la levanta
 *     Pendientes como «por reprogramar».
 *
 * Por eso los tres pueden sumar menos que el total: las «no vino» no van en ninguno, y la barra las
 * deja como pista vacía, que es lo que son (nada que avanzar). Es una regla pura con test porque se
 * equivoca en silencio: si una «no vino» cayera en «por llegar», la tarjeta esperaría a alguien que
 * ya se sabe que no viene, prolija y sin un solo error.
 *
 * Las etapas salen de `operational_stage` (0068), derivada de las marcas: nada se infiere.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Lo único que esta regla mira de una visita. */
export interface ConEtapa {
  operational_stage: OperationalStage
  no_show_at: string | null
}

export interface AvanceDelDia {
  realizadas: number
  enCentro: number
  porLlegar: number
}

export function avanceDelDia(visitas: readonly ConEtapa[]): AvanceDelDia {
  let realizadas = 0
  let enCentro = 0
  let porLlegar = 0
  for (const v of visitas) {
    if (v.operational_stage === 'fin_atencion') realizadas++
    else if (v.operational_stage === 'concurrio_al_centro' || v.operational_stage === 'inicio_atencion') enCentro++
    else if (v.operational_stage === 'por_llegar' && !v.no_show_at) porLlegar++
  }
  return { realizadas, enCentro, porLlegar }
}
