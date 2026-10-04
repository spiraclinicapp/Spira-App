import { describe, expect, it } from 'vitest'
import {
  agruparPorVisita, aplicarEtapas, ANT_DESPUES, ANT_SEMANA, ANT_VENCIDOS, claveReporte,
  ESTADO_DESCARGADO, ESTADO_SIN_DESCARGAR, filtrar, opcionesDeFiltro, plazoDeVisita,
  resumenPorEstudio, textoPlazo, totales,
} from './porPaciente'
import type { FilaReporte, Filtros } from './porPaciente'
import type { ReportStage } from './estados'

/**
 * Reglas de «Reportes pendientes» por paciente (plan `docs/plan-reportes-pendientes.md`).
 *
 * POR QUÉ ESTAS: todas fallan EN SILENCIO. Agrupar mal hace desaparecer una visita; un plazo mal
 * calculado pinta de ámbar algo vencido; un filtro con Y donde va O vacía la tabla. Lo visual
 * (colores, alturas, el despliegue) se verifica mirando.
 *
 * LAS FECHAS VAN CON OFFSET `-03:00` Y `now` SE PASA FIJO, porque CI corre en UTC: a las 22:30 de
 * Argentina ya es el día siguiente en UTC, y un test que arma la fecha sin offset pasa en esta máquina
 * y miente en la PR (ya pasó una vez).
 */

/** Las 12:00 del 2026-10-03 en Argentina. */
const AHORA = new Date('2026-10-03T12:00:00-03:00').getTime()
/** Las 22:30 del mismo día en Argentina: en UTC ya es el 4. */
const NOCHE = new Date('2026-10-03T22:30:00-03:00').getTime()
const ar = (diaHora: string) => new Date(`${diaHora}-03:00`).toISOString()

function fila(over: Partial<FilaReporte> = {}): FilaReporte {
  return {
    visit_id: 'v1', report_definition_id: 'd1', report_name: 'Espirometría Pre',
    procedure_name: 'Espirometría', platform: 'iqvia', link: null,
    completed: true, due_at: ar('2026-10-10T09:00:00'), stage: 'pendiente',
    sort_order: 1, procedure_order: 1,
    protocol_id: 'pr1', protocol_code: 'ACT18301', patient_id: 'pa1', patient_code: '222714',
    patient_name: 'Calderón, María Julieta', visit_code: 'V17', visit_name: null,
    visit_kind: 'programada', coordinator_id: null,
    ...over,
  }
}

/** Agrupa sin overlay (base = actuales). */
const agrupar = (rows: FilaReporte[], now = AHORA) => agruparPorVisita(rows, rows, now)

const SIN_FILTROS: Filtros = { estado: [], informe: [], antiguedad: [], buscar: '' }

describe('agruparPorVisita', () => {
  it('una fila por visita, con todos sus reportes tildados en el orden del cronograma', () => {
    const out = agrupar([
      fila({ report_definition_id: 'd2', report_name: 'Sangre', procedure_order: 2 }),
      fila({ report_definition_id: 'd1', report_name: 'Espirometría Pre', procedure_order: 1 }),
      fila({ visit_id: 'v2', patient_id: 'pa2', patient_name: 'Muñoz, Andrés' }),
    ])
    expect(out).toHaveLength(2)
    const v1 = out.find((v) => v.visitId === 'v1')!
    expect(v1.reportes.map((r) => r.report_name)).toEqual(['Espirometría Pre', 'Sangre'])
  })

  it('los reportes sin tildar no son fila, y una visita sin nada tildado pendiente no aparece', () => {
    /* Tildados todos evolucionados + uno sin tildar: el trabajo que falta es TILDAR, y eso es «Sin
       marcar» de Pendientes. Acá no hay nada para descargar. */
    const out = agrupar([
      fila({ stage: 'evolucionado' }),
      fila({ report_definition_id: 'd2', completed: false, due_at: null }),
    ])
    expect(out).toEqual([])
  })

  it('el sin tildar no cuenta en el conteo de una visita que sí está en juego', () => {
    const [v] = agrupar([fila(), fila({ report_definition_id: 'd2', completed: false })])
    expect(v.reportes).toHaveLength(1)
    expect(v.conteo).toEqual({ sinDescargar: 1, descargados: 0, evolucionados: 0 })
  })

  it('una visita toda evolucionada en el servidor no aparece', () => {
    expect(agrupar([fila({ stage: 'evolucionado' }), fila({ report_definition_id: 'd2', stage: 'evolucionado' })])).toEqual([])
  })

  it('…pero si se evolucionó EN ESTA SESIÓN sigue a la vista, diciendo «Todo evolucionado», y en su lugar', () => {
    const base = [
      fila({ visit_id: 'v1', due_at: ar('2026-09-01T09:00:00') }), // la más vencida: primera
      fila({ visit_id: 'v2', patient_id: 'pa2', patient_name: 'Abril, Ana', due_at: ar('2026-09-20T09:00:00') }),
    ]
    const overlay = new Map<string, ReportStage>([[claveReporte(base[0]), 'evolucionado']])
    const out = agruparPorVisita(base, aplicarEtapas(base, overlay), AHORA)
    expect(out.map((v) => v.visitId)).toEqual(['v1', 'v2'])
    expect(out[0].plazo.tipo).toBe('listo')
    expect(textoPlazo(out[0].plazo)).toBe('Todo evolucionado')
    expect(textoPlazo(out[0].plazo, true)).toBe('Listo')
  })

  it('una etapa que este front no conoce se lee como sin descargar', () => {
    const [v] = agrupar([fila({ stage: 'archivado' })])
    expect(v.conteo.sinDescargar).toBe(1)
  })

  it('sin filas, sin visitas', () => {
    expect(agrupar([])).toEqual([])
  })

  it('rotula las sueltas por su tipo', () => {
    const [v] = agrupar([fila({ visit_code: null, visit_name: null, visit_kind: 'retest' })])
    expect(v.visitLabel).toBe('Retest')
  })
})

describe('plazoDeVisita', () => {
  it('lo manda el vencimiento MÁS TEMPRANO entre lo sin descargar', () => {
    const p = plazoDeVisita([
      fila({ due_at: ar('2026-10-09T09:00:00') }),
      fila({ report_definition_id: 'd2', due_at: ar('2026-10-05T09:00:00') }),
      // Descargado: su plazo ya no corre, aunque sea el más temprano.
      fila({ report_definition_id: 'd3', due_at: ar('2026-10-04T09:00:00'), stage: 'descargado' }),
    ], AHORA)
    expect(p).toMatchObject({ tipo: 'pronto', dias: 2 })
    expect(textoPlazo(p)).toBe('Vence en 2 días')
  })

  it('si lo único que falta está descargado, no está vencido: falta evolucionar (D3)', () => {
    const p = plazoDeVisita([fila({ due_at: ar('2026-09-01T09:00:00'), stage: 'descargado' })], AHORA)
    expect(p.tipo).toBe('falta-evolucionar')
    expect(textoPlazo(p)).toBe('Falta evolucionar')
  })

  it('sin plazo definido dice «Sin plazo»', () => {
    expect(plazoDeVisita([fila({ due_at: null })], AHORA).tipo).toBe('sin-plazo')
  })

  it('los cuatro tramos', () => {
    const tipo = (due: string) => plazoDeVisita([fila({ due_at: ar(due) })], AHORA)
    expect(tipo('2026-09-28T09:00:00')).toMatchObject({ tipo: 'vencido', dias: 5 })
    expect(tipo('2026-10-03T18:00:00')).toMatchObject({ tipo: 'hoy', dias: 0 })
    expect(tipo('2026-10-06T09:00:00')).toMatchObject({ tipo: 'pronto', dias: 3 })
    expect(tipo('2026-10-07T09:00:00')).toMatchObject({ tipo: 'lejos', dias: 4 })
    expect(textoPlazo(tipo('2026-09-28T09:00:00'), true)).toBe('Vencido hace 5 d')
    expect(textoPlazo(tipo('2026-10-03T18:00:00'))).toBe('Vence hoy')
  })

  it('el borde exacto no vence (como `isOverdue`)', () => {
    expect(plazoDeVisita([fila({ due_at: new Date(AHORA).toISOString() })], AHORA).tipo).toBe('hoy')
  })

  it('vencido se decide por INSTANTE: vence hoy 09:00, mirado 22:30 AR → vencido (10A)', () => {
    /* Con el día calendario esto daba «Vence hoy» mientras el modal decía «Vencido hace 13 h». Y a
       las 22:30 AR, UTC ya está en el día siguiente: si el día se tomara de UTC daría «hace 1 día». */
    const p = plazoDeVisita([fila({ due_at: ar('2026-10-03T09:00:00') })], NOCHE)
    expect(p).toMatchObject({ tipo: 'vencido', dias: 0 })
    expect(textoPlazo(p)).toBe('Venció hoy')
  })

  it('vence mañana 09:00, mirado 22:30 AR → «Vence en 1 día», no «hoy»', () => {
    expect(plazoDeVisita([fila({ due_at: ar('2026-10-04T09:00:00') })], NOCHE)).toMatchObject({ tipo: 'pronto', dias: 1 })
  })
})

describe('orden', () => {
  it('vencido (el más viejo primero) → hoy → pronto → más adelante → falta evolucionar → sin plazo', () => {
    const v = (id: string, over: Partial<FilaReporte>) =>
      fila({ visit_id: id, patient_id: id, patient_name: `Paciente ${id}`, ...over })
    const out = agrupar([
      v('sinplazo', { due_at: null }),
      v('evol', { stage: 'descargado' }),
      v('lejos', { due_at: ar('2026-10-20T09:00:00') }),
      v('vencido-nuevo', { due_at: ar('2026-10-01T09:00:00') }),
      v('pronto', { due_at: ar('2026-10-05T09:00:00') }),
      v('hoy', { due_at: ar('2026-10-03T20:00:00') }),
      v('vencido-viejo', { due_at: ar('2026-07-01T09:00:00') }),
    ])
    expect(out.map((x) => x.visitId)).toEqual(['vencido-viejo', 'vencido-nuevo', 'hoy', 'pronto', 'lejos', 'evol', 'sinplazo'])
  })

  it('marcar descargado lo único vencido NO manda la fila al fondo mientras se la mira', () => {
    const base = [
      fila({ visit_id: 'a', patient_id: 'a', patient_name: 'A', due_at: ar('2026-09-01T09:00:00') }),
      fila({ visit_id: 'b', patient_id: 'b', patient_name: 'B', due_at: ar('2026-10-05T09:00:00') }),
    ]
    const overlay = new Map<string, ReportStage>([[claveReporte(base[0]), 'descargado']])
    const out = agruparPorVisita(base, aplicarEtapas(base, overlay), AHORA)
    expect(out.map((x) => x.visitId)).toEqual(['a', 'b'])
    expect(out[0].plazo.tipo).toBe('falta-evolucionar')
  })
})

describe('conteo y totales', () => {
  it('cuenta por etapa', () => {
    const [v] = agrupar([
      fila(),
      fila({ report_definition_id: 'd2', stage: 'descargado' }),
      fila({ report_definition_id: 'd3', stage: 'evolucionado' }),
    ])
    expect(v.conteo).toEqual({ sinDescargar: 1, descargados: 1, evolucionados: 1 })
  })

  it('pacientes DISTINTOS: el mismo paciente en dos visitas es uno', () => {
    const vs = agrupar([fila({ visit_id: 'v1' }), fila({ visit_id: 'v2', visit_code: 'V18' })])
    expect(totales(vs)).toEqual({ pendientes: 2, pacientes: 1 })
  })
})

describe('resumenPorEstudio', () => {
  it('pendientes, pacientes y vencidos cuentan bien; vencidos son PACIENTES', () => {
    const [e] = resumenPorEstudio(agrupar([
      fila({ visit_id: 'v1', due_at: ar('2026-09-01T09:00:00') }),
      fila({ visit_id: 'v1', report_definition_id: 'd2', due_at: ar('2026-09-01T09:00:00') }),
      fila({ visit_id: 'v1', report_definition_id: 'd3', stage: 'descargado' }),
      fila({ visit_id: 'v2', due_at: ar('2026-09-02T09:00:00') }), // mismo paciente, otra visita vencida
      fila({ visit_id: 'v3', patient_id: 'pa2', stage: 'evolucionado' }),
      fila({ visit_id: 'v3', patient_id: 'pa2', report_definition_id: 'd2' }),
    ]))
    expect(e).toMatchObject({ pendientes: 5, pacientes: 2, vencidos: 1 })
    expect(e.barra).toEqual({ vencidosSinDescargar: 3, sinDescargar: 1, descargados: 1, evolucionados: 1 })
  })

  it('no depende de los filtros: se calcula sobre la lista sin filtrar, y la evolucionada recién conserva su tarjeta', () => {
    const base = [fila({ protocol_id: 'solo', protocol_code: 'TEST-QA' })]
    const overlay = new Map<string, ReportStage>([[claveReporte(base[0]), 'evolucionado']])
    const vs = agruparPorVisita(base, aplicarEtapas(base, overlay), AHORA)
    expect(resumenPorEstudio(vs).map((e) => [e.code, e.pendientes])).toEqual([['TEST-QA', 0]])
  })

  it('primero el estudio con pacientes vencidos', () => {
    const out = resumenPorEstudio(agrupar([
      fila({ visit_id: 'a', protocol_id: 'p-a', protocol_code: 'AAA' }),
      fila({ visit_id: 'a', protocol_id: 'p-a', protocol_code: 'AAA', report_definition_id: 'd2' }),
      fila({ visit_id: 'b', protocol_id: 'p-b', protocol_code: 'BBB', due_at: ar('2026-09-01T09:00:00') }),
    ]))
    expect(out.map((e) => e.code)).toEqual(['BBB', 'AAA'])
  })
})

describe('filtrar', () => {
  const vs = agrupar([
    fila({ visit_id: 'sin', patient_id: 's', patient_name: 'Sin Desc', due_at: ar('2026-09-01T09:00:00') }),
    fila({ visit_id: 'des', patient_id: 'd', patient_name: 'Desc Argado', patient_code: '104-0019', stage: 'descargado', report_name: 'ECG' }),
    fila({ visit_id: 'sem', patient_id: 'w', patient_name: 'Benítez, Semana', due_at: ar('2026-10-10T09:00:00') }),
    fila({ visit_id: 'des2', patient_id: 'x', patient_name: 'Después', due_at: ar('2026-10-11T09:00:00') }),
  ])
  const ids = (f: Partial<Filtros>) => filtrar(vs, { ...SIN_FILTROS, ...f }).map((v) => v.visitId)

  it('sin filtros pasan todas', () => {
    expect(ids({})).toEqual(vs.map((v) => v.visitId))
  })

  it('O dentro de un filtro, Y entre filtros', () => {
    expect(ids({ estado: [ESTADO_SIN_DESCARGAR, ESTADO_DESCARGADO] })).toHaveLength(4)
    expect(ids({ estado: [ESTADO_DESCARGADO] })).toEqual(['des'])
    expect(ids({ estado: [ESTADO_SIN_DESCARGAR], antiguedad: [ANT_VENCIDOS] })).toEqual(['sin'])
  })

  it('Antigüedad: «en 7 días» incluye el día 7 y «más adelante» empieza en el 8', () => {
    expect(ids({ antiguedad: [ANT_SEMANA] })).toEqual(['sem'])
    expect(ids({ antiguedad: [ANT_DESPUES] })).toEqual(['des2'])
    // «Falta evolucionar» no tiene plazo corriendo: no cae en ningún rango.
    expect(ids({ antiguedad: [ANT_VENCIDOS, ANT_SEMANA, ANT_DESPUES] })).not.toContain('des')
  })

  it('Informe mira sólo reportes PENDIENTES', () => {
    expect(ids({ informe: ['ECG'] })).toEqual(['des'])
  })

  it('busca sin tildes por nombre o por IVRS', () => {
    expect(ids({ buscar: 'benitez' })).toEqual(['sem'])
    expect(ids({ buscar: '104-0019' })).toEqual(['des'])
  })

  it('las opciones de Informe son los tipos presentes, con su cantidad', () => {
    const o = opcionesDeFiltro(vs)
    expect(o.informe).toEqual([
      { value: 'ECG', label: 'ECG', count: 1 },
      { value: 'Espirometría Pre', label: 'Espirometría Pre', count: 3 },
    ])
    expect(o.antiguedad.map((x) => x.count)).toEqual([1, 1, 1])
  })
})

describe('aplicarEtapas', () => {
  it('cambia sólo la fila movida; las demás salen con la misma referencia', () => {
    const rows = [fila(), fila({ report_definition_id: 'd2' })]
    const out = aplicarEtapas(rows, new Map([[claveReporte(rows[1]), 'descargado' as ReportStage]]))
    expect(out[0]).toBe(rows[0])
    expect(out[1]).not.toBe(rows[1])
    expect(out[1].stage).toBe('descargado')
    expect(rows[1].stage).toBe('pendiente')
  })

  it('sin overlay devuelve el mismo arreglo', () => {
    const rows = [fila()]
    expect(aplicarEtapas(rows, new Map())).toBe(rows)
  })
})
