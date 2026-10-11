/**
 * Filtros y atajos de Visitas.
 *
 * Se testean porque fallan en SILENCIO: un AND que debería ser OR, o un conteo que cuenta su propia
 * categoría, dibujan un panel prolijo con números que no coinciden con la lista de atrás.
 */
import { describe, expect, it } from 'vitest'
import {
  ESPERA_MEDICO, NONE, SIN_FILTROS, atajoDeTecla, coincideBusqueda, conteoFacetado, opcionesDe,
  pasaFiltros, totalFiltros, valoresDe,
} from './filtrosVisitas'
import type { FilaFiltrable, Filtros } from './filtrosVisitas'

const base: FilaFiltrable = {
  operational_stage: 'por_llegar', computed_status: 'proxima', wants_doctor: false, doctor_seen_at: null,
  protocol_id: 'p1', protocol_code: 'EFC16750', treating_physician: 'Dr. Iturre', coordinator_id: 'c1',
  patient_name: 'Laura Benítez', patient_code: '032001520014',
}
const fila = (o: Partial<FilaFiltrable>): FilaFiltrable => ({ ...base, ...o })
const f = (o: Partial<Filtros>): Filtros => ({ ...SIN_FILTROS, ...o })

describe('valores por categoría', () => {
  it('«No vino» filtra como su propio estado, no como «por llegar»', () => {
    expect(valoresDe('estado', fila({ computed_status: 'por_reprogramar' }))).toEqual(['por_reprogramar'])
    // Con la ventana vencida (le gana a por_reprogramar en la vista) la falta sigue siendo la falta.
    expect(valoresDe('estado', fila({ computed_status: 'ventana_vencida', no_show_at: '2026-10-08T12:00:00-03:00' }))).toEqual(['por_reprogramar'])
  })

  it('quien espera al médico suma esa opción a su estado', () => {
    expect(valoresDe('estado', fila({ operational_stage: 'concurrio_al_centro', wants_doctor: true })))
      .toEqual(['concurrio_al_centro', ESPERA_MEDICO])
    // Ya lo vio el médico: `mark_doctor_seen` no apaga `wants_doctor`, pero ya no está esperando.
    expect(valoresDe('estado', fila({ operational_stage: 'inicio_atencion', wants_doctor: true, doctor_seen_at: '2026-10-08T10:00:00-03:00' })))
      .toEqual(['inicio_atencion'])
    // Con la atención cerrada ya no espera a nadie.
    expect(valoresDe('estado', fila({ operational_stage: 'fin_atencion', wants_doctor: true }))).toEqual(['fin_atencion'])
  })

  it('médico y coordinador vacíos caen en el sentinela', () => {
    expect(valoresDe('medico', fila({ treating_physician: null }))).toEqual([NONE])
    expect(valoresDe('coordinador', fila({ coordinator_id: null }))).toEqual([NONE])
  })
})

describe('pasaFiltros', () => {
  const a = fila({ operational_stage: 'concurrio_al_centro', wants_doctor: true })
  const b = fila({ operational_stage: 'por_llegar', protocol_id: 'p2' })

  it('OR dentro de la categoría', () => {
    const filtro = f({ estado: ['por_llegar', ESPERA_MEDICO] })
    expect(pasaFiltros(a, filtro)).toBe(true)
    expect(pasaFiltros(b, filtro)).toBe(true)
  })

  it('AND entre categorías', () => {
    expect(pasaFiltros(b, f({ estado: ['por_llegar'], protocolo: ['p1'] }))).toBe(false)
    expect(pasaFiltros(b, f({ estado: ['por_llegar'], protocolo: ['p2'] }))).toBe(true)
  })

  it('sin filtros pasa todo', () => {
    expect(pasaFiltros(a, SIN_FILTROS)).toBe(true)
    expect(totalFiltros(SIN_FILTROS)).toBe(0)
    expect(totalFiltros(f({ estado: ['x'], medico: ['y', 'z'] }))).toBe(3)
  })
})

describe('conteo facetado', () => {
  const filas = [
    fila({ operational_stage: 'por_llegar', protocol_id: 'p1' }),
    fila({ operational_stage: 'concurrio_al_centro', protocol_id: 'p1' }),
    fila({ operational_stage: 'concurrio_al_centro', protocol_id: 'p2' }),
  ]

  it('ignora la categoría que se está mirando', () => {
    // Marcar «Concurrió» no deja a «Por llegar» en 0 dentro de la misma columna.
    const filtro = f({ estado: ['concurrio_al_centro'] })
    expect(conteoFacetado(filas, filtro, 'estado', 'por_llegar')).toBe(1)
    expect(conteoFacetado(filas, filtro, 'estado', 'concurrio_al_centro')).toBe(2)
  })

  it('aplica las otras categorías', () => {
    const filtro = f({ protocolo: ['p2'] })
    expect(conteoFacetado(filas, filtro, 'estado', 'por_llegar')).toBe(0)
    expect(conteoFacetado(filas, filtro, 'estado', 'concurrio_al_centro')).toBe(1)
  })

  it('una opción elegida sin visitas en el período sigue en el panel', () => {
    expect(opcionesDe(filas, f({ protocolo: ['p9'] }), 'protocolo').sort()).toEqual(['p1', 'p2', 'p9'])
  })
})

describe('búsqueda', () => {
  it('busca en nombre, N°, protocolo y código de visita, sin mayúsculas', () => {
    expect(coincideBusqueda(base, 'V5 W10', 'benítez')).toBe(true)
    expect(coincideBusqueda(base, 'V5 W10', '0320015')).toBe(true)
    expect(coincideBusqueda(base, 'V5 W10', 'efc')).toBe(true)
    expect(coincideBusqueda(base, 'V5 W10', 'v5 w10')).toBe(true)
    expect(coincideBusqueda(base, 'V5 W10', 'quintana')).toBe(false)
    expect(coincideBusqueda(base, 'V5 W10', '   ')).toBe(true)
  })
})

describe('atajos de teclado', () => {
  const t = (key: string, o: Partial<Parameters<typeof atajoDeTecla>[0]> = {}) =>
    atajoDeTecla({ key, ctrlKey: false, metaKey: false, altKey: false, editable: false, bloqueado: false, ...o })

  it('mapea las teclas del handoff', () => {
    expect(t('ArrowLeft')).toBe('anterior')
    expect(t('ArrowRight')).toBe('siguiente')
    expect(t('t')).toBe('hoy')
    expect(t('H')).toBe('hoy')
    expect(t('m')).toBe('mes')
    expect(t('s')).toBe('semana')
    expect(t('d')).toBe('dia')
    expect(t('x')).toBeNull()
  })

  it('no dispara escribiendo, con modificadores ni con un modal abierto', () => {
    expect(t('s', { editable: true })).toBeNull()
    expect(t('k', { ctrlKey: true })).toBeNull()
    expect(t('ArrowLeft', { metaKey: true })).toBeNull()
    expect(t('ArrowRight', { bloqueado: true })).toBeNull()
  })
})
