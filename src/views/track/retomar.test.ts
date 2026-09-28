import { describe, expect, it } from 'vitest'
import type { TrackVisitRow } from '../../data/visits'
import type { MarcaRow } from '../../data/pendientes'
import {
  agruparPorRetomar, diasEsperando, pacientesDelEstudio, pendientesAlFinalizar, procedimientosRepetibles,
  cierreDeVentana, contadorDeDias, marcaDePendiente, rotuloDeVisita, visitasConFechaPasada, visitasParaRetest, visitasParaTraer,
} from './retomar'

/**
 * Las reglas de «pendientes por retomar» y del retest con origen (v0145).
 *
 * Todas fallan EN SILENCIO si quedan al revés: un aviso al finalizar que salta en cada visita (o en
 * ninguna), un retest que ofrece lo que no se hizo, una lista de Pendientes que esconde o que
 * repite. Nada de eso se ve roto; se ve «raro», y lo raro no se reporta.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const p = (procedure_id: string, completed: boolean, tiene_reporte: boolean) =>
  ({ procedure_id, name: procedure_id.toUpperCase(), completed, tiene_reporte })

const v = (campos: Partial<TrackVisitRow>) => ({
  id: 'v', enrollment_id: 'e1', kind: 'programada', visit_def_id: 'd', estimated_date: null, real_date: null,
  window_start: null, window_end: null, no_show_at: null, computed_status: 'proxima',
  enrollment_status: 'activo', patient_name: 'Ana', patient_code: 'A-1', protocol_id: 'p1',
  visit_code: null, visit_name: 'V3', ...campos,
}) as TrackVisitRow

describe('pendientesAlFinalizar', () => {
  it('lista sólo lo que tiene reporte y no se tildó', () => {
    const r = pendientesAlFinalizar([p('lab', false, true), p('hem', true, true), p('vit', false, false)])
    expect(r.map((x) => x.procedure_id)).toEqual(['lab'])
  })
  it('un procedimiento sin reporte nunca dispara el aviso', () => {
    expect(pendientesAlFinalizar([p('vit', false, false), p('ecg', false, false)])).toEqual([])
  })
})

describe('procedimientosRepetibles', () => {
  it('lo tildado y lo sin reporte, si la visita se atendió', () => {
    const r = procedimientosRepetibles([p('lab', true, true), p('hem', false, true), p('vit', false, false)], true)
    expect(r.map((x) => x.procedure_id)).toEqual(['lab', 'vit'])
  })
  it('nada si la visita no se atendió', () => {
    expect(procedimientosRepetibles([p('lab', true, true), p('vit', false, false)], false)).toEqual([])
  })
})

describe('visitasParaRetest', () => {
  const hoy = '2026-09-27'
  it('atendidas en los últimos 60 días, la más reciente primero', () => {
    const r = visitasParaRetest([
      v({ id: 'a', real_date: '2026-09-20' }),
      v({ id: 'b', real_date: '2026-09-25' }),
      v({ id: 'vieja', real_date: '2026-07-28' }),  // 61 días
      v({ id: 'limite', real_date: '2026-07-29' }), // 60 días: entra
      v({ id: 'sin', real_date: null }),
      v({ id: 'futura', real_date: '2026-09-30' }),
    ], hoy)
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'limite'])
  })
  it('deja afuera las inscripciones cerradas', () => {
    expect(visitasParaRetest([v({ id: 'c', real_date: '2026-09-20', enrollment_status: 'discontinuado' })], hoy)).toEqual([])
  })
})

describe('visitasParaTraer', () => {
  const dia = '2026-09-27'
  it('TODA visita sin hacer, de antes y de después del día, por fecha: vencidas y faltas incluidas', () => {
    // El Director (2026-09-28): «¿por qué no figuran estas si son visitas pendientes?». Las vencidas
    // y las «No vino» se agendan desde acá también.
    const r = visitasParaTraer([
      v({ id: 'b', estimated_date: '2026-10-05' }),
      v({ id: 'a', estimated_date: '2026-10-02' }),
      v({ id: 'hoy', estimated_date: '2026-09-27' }),                         // ya es de este día
      v({ id: 'antes', estimated_date: '2026-09-20' }),                       // atrasada, ventana abierta
      v({ id: 'hecha', estimated_date: '2026-10-01', real_date: '2026-09-26' }),
      v({ id: 'falto', estimated_date: '2026-10-01', no_show_at: '2026-09-26T10:00:00+00:00' }),
      v({ id: 'vencida', estimated_date: '2026-10-01', computed_status: 'ventana_vencida' }),
      v({ id: 'cerrada', estimated_date: '2026-10-01', enrollment_status: 'completado' }),
      v({ id: 'encentro', estimated_date: '2026-09-25', computed_status: 'en_atencion' }), // está ahora en el centro
      v({ id: 'sinfecha', estimated_date: null }),
    ], dia)
    expect(r.map((x) => x.id)).toEqual(['antes', 'falto', 'vencida', 'a', 'b'])
  })
})

describe('marcaDePendiente', () => {
  it('dice por qué no es una pendiente cualquiera; la vencida primero', () => {
    expect(marcaDePendiente({ computed_status: 'ventana_vencida', no_show_at: null })).toBe('Ventana vencida')
    expect(marcaDePendiente({ computed_status: 'ventana_vencida', no_show_at: '2026-09-20T10:00:00+00:00' })).toBe('Ventana vencida')
    expect(marcaDePendiente({ computed_status: 'por_reprogramar', no_show_at: '2026-09-20T10:00:00+00:00' })).toBe('No vino')
    expect(marcaDePendiente({ computed_status: 'proxima', no_show_at: null })).toBeNull()
  })
})

describe('visitasConFechaPasada', () => {
  // Lo que se escapaba: «pasó el día en el que estaba programada y no se hizo», con la ventana
  // abierta. Para la base es `proxima`, así que ninguna alerta lo decía.
  const hoy = '2026-09-28'
  it('las próximas con la fecha antes de hoy, la más vieja primero; ni hoy, ni futuras, ni cerradas', () => {
    const r = visitasConFechaPasada([
      v({ id: 'ayer', estimated_date: '2026-09-27' }),
      v({ id: 'semana', estimated_date: '2026-09-21' }),
      v({ id: 'hoy', estimated_date: '2026-09-28' }),
      v({ id: 'futura', estimated_date: '2026-10-02' }),
      v({ id: 'cerrada', estimated_date: '2026-09-20', enrollment_status: 'discontinuado' }),
      v({ id: 'sinfecha', estimated_date: null }),
    ], hoy)
    expect(r.map((x) => x.id)).toEqual(['semana', 'ayer'])
  })
  it('no repite a las que ya tienen su propio aviso: vencidas, faltas, hechas', () => {
    const r = visitasConFechaPasada([
      v({ id: 'vencida', estimated_date: '2026-09-10', computed_status: 'ventana_vencida' }),
      v({ id: 'falto', estimated_date: '2026-09-20', computed_status: 'por_reprogramar', no_show_at: '2026-09-20T10:00:00+00:00' }),
      v({ id: 'hecha', estimated_date: '2026-09-20', computed_status: 'completa', real_date: '2026-09-20' }),
    ], hoy)
    expect(r).toEqual([])
  })
})

describe('cierreDeVentana', () => {
  const hoy = '2026-09-28'
  it('cuánto le queda a la ventana, en palabras', () => {
    expect(cierreDeVentana({ window_end: '2026-09-28' }, hoy)).toBe('la ventana cierra hoy')
    expect(cierreDeVentana({ window_end: '2026-09-29' }, hoy)).toBe('la ventana cierra mañana')
    expect(cierreDeVentana({ window_end: '2026-10-01' }, hoy)).toBe('la ventana cierra en 3 días')
  })
  it('sin ventana (VNP, retest) no hay plazo que contar; vencida, es otro aviso', () => {
    expect(cierreDeVentana({ window_end: null }, hoy)).toBeNull()
    expect(cierreDeVentana({ window_end: '2026-09-27' }, hoy)).toBeNull()
  })
})

describe('contadorDeDias', () => {
  // El signo es lo que falla en silencio: al revés, una visita atrasada se leería como futura.
  const dia = '2026-09-28'
  it('le faltan días: positivo, sin alerta', () => {
    expect(contadorDeDias('2026-09-30', dia)).toEqual({ texto: '+2 d', atrasada: false })
    expect(contadorDeDias('2026-10-14', dia)).toEqual({ texto: '+16 d', atrasada: false })
  })
  it('se pasó: negativo con el signo menos tipográfico, y con alerta', () => {
    expect(contadorDeDias('2026-09-23', dia)).toEqual({ texto: '−5 d', atrasada: true })
  })
  it('cruza el cambio de mes sin correrse un día', () => {
    expect(contadorDeDias('2026-10-01', dia)).toEqual({ texto: '+3 d', atrasada: false })
  })
})

describe('agruparPorRetomar', () => {
  // El formato de fecha es el que devuelve PostgREST: con `+00:00`, no `-03:00` (ver el gotcha del
  // test con el dato de la forma equivocada).
  const m = (visit_id: string, procedure_id: string, marked_at: string): MarcaRow =>
    ({ visit_id, procedure_id, procedure_name: procedure_id.toUpperCase(), marked_at })

  it('una fila por visita, la que espera hace más primero, con la marca más vieja como «desde»', () => {
    const r = agruparPorRetomar(
      [m('v1', 'lab', '2026-09-20T13:00:00+00:00'), m('v2', 'ecg', '2026-09-18T13:00:00+00:00'), m('v1', 'hem', '2026-09-19T13:00:00+00:00')],
      [v({ id: 'v1', patient_name: 'Ana' }), v({ id: 'v2', patient_name: 'Beto' })],
    )
    expect(r.map((g) => g.visita.id)).toEqual(['v2', 'v1'])
    expect(r[1].procedimientos.map((x) => x.procedure_id)).toEqual(['hem', 'lab'])
    expect(r[1].desde).toBe('2026-09-19T13:00:00+00:00')
  })
  it('una marca sin su visita (la RLS no la deja ver) no arma fila', () => {
    expect(agruparPorRetomar([m('v9', 'lab', '2026-09-20T13:00:00+00:00')], [])).toEqual([])
  })
  it('una inscripción cerrada no aparece: no se puede descartar y quedaría para siempre', () => {
    expect(agruparPorRetomar([m('v1', 'lab', '2026-09-20T13:00:00+00:00')], [v({ id: 'v1', enrollment_status: 'completado' })])).toEqual([])
  })
})

describe('diasEsperando', () => {
  it('cuenta en días argentinos', () => {
    // 01:30 UTC del 20 es todavía el 19 en Argentina.
    expect(diasEsperando('2026-09-20T01:30:00+00:00', '2026-09-27')).toBe(8)
    expect(diasEsperando('2026-09-27T15:00:00+00:00', '2026-09-27')).toBe(0)
  })
})

describe('pacientesDelEstudio', () => {
  it('uno por inscripción, sin las cerradas, por nombre', () => {
    const r = pacientesDelEstudio([
      v({ id: '1', enrollment_id: 'e2', patient_name: 'Beto' }),
      v({ id: '2', enrollment_id: 'e1', patient_name: 'Ana' }),
      v({ id: '3', enrollment_id: 'e2', patient_name: 'Beto' }),
      v({ id: '4', enrollment_id: 'e3', patient_name: 'Carla', enrollment_status: 'discontinuado' }),
    ])
    expect(r.map((x) => x.enrollment_id)).toEqual(['e1', 'e2'])
  })
})

describe('rotuloDeVisita', () => {
  const x = v({ visit_name: 'V3', patient_name: 'Ana', estimated_date: '2026-09-12' })
  it('desde Visitas nombra al paciente: la lista mezcla a todos los del estudio', () => {
    expect(rotuloDeVisita(x)).toMatch(/^V3 · Ana · /)
  })
  it('desde la ficha no: el paciente ya está fijo arriba y repetirlo es ruido', () => {
    expect(rotuloDeVisita(x, { conPaciente: false })).toMatch(/^V3 · /)
    expect(rotuloDeVisita(x, { conPaciente: false })).not.toContain('Ana')
  })
})
