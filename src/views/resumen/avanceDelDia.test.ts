import { describe, expect, it } from 'vitest'
import type { OperationalStage } from '../../data/dayVisits'
import { avanceDelDia } from './avanceDelDia'

/**
 * El reparto de la jornada del KPI «Visitas de hoy». Falla en silencio de dos maneras: contar una
 * «no vino» como por llegar, y meter a alguien que ya llegó en dos grupos a la vez.
 */

const v = (operational_stage: OperationalStage, no_show_at: string | null = null) => ({ operational_stage, no_show_at })

describe('avanceDelDia', () => {
  it('sin visitas, todo en cero', () => {
    expect(avanceDelDia([])).toEqual({ realizadas: 0, enCentro: 0, porLlegar: 0 })
  })

  it('reparte por etapa: llegó y está en atención cuentan los dos como en el centro', () => {
    const r = avanceDelDia([
      v('fin_atencion'), v('fin_atencion'),
      v('concurrio_al_centro'), v('inicio_atencion'),
      v('por_llegar'),
    ])
    expect(r).toEqual({ realizadas: 2, enCentro: 2, porLlegar: 1 })
  })

  /* La ausencia marcada no está por llegar ni en ningún otro grupo: la barra la deja como pista vacía. */
  it('una «no vino» no cuenta en ningún grupo', () => {
    const r = avanceDelDia([v('por_llegar', '2026-10-13T12:00:00Z'), v('por_llegar')])
    expect(r).toEqual({ realizadas: 0, enCentro: 0, porLlegar: 1 })
  })

  it('cada visita cae en un solo grupo', () => {
    const visitas = [v('fin_atencion'), v('concurrio_al_centro'), v('inicio_atencion'), v('por_llegar')]
    const r = avanceDelDia(visitas)
    expect(r.realizadas + r.enCentro + r.porLlegar).toBe(visitas.length)
  })
})
