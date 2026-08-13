import { describe, expect, it } from 'vitest'
import {
  contextoDeEtapa, datosDelPaciente, estaConcretada, etapaProgreso, marcaDeEtapa,
  medicoDeVisita, puedeEditarCoordinador, puedeEditarFechaReal, puedeEditarMedico,
} from './visitHeaderRules'
import { desvioDias, fueraDeVentana } from '../../lib/visits'

/**
 * Las reglas del encabezado de la visita.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Que el riel se llene al 75 % en vez
 * de al 50 % se ve mirando la pantalla; que `puedeEditarFechaReal` devuelva `true` de más, no —
 * la pantalla queda impecable y la visita termina marcada como atendida sin que nadie la haya
 * atendido, con la ruta dos etapas adelante. Lo mismo con `desvioDias`: un signo invertido
 * muestra "+3 d" cuando el paciente vino tres días ANTES, y eso es un desvío de protocolo leído
 * al revés. `desvioDias` y `fueraDeVentana` viven en `lib/visits.ts` desde hace meses **sin un
 * solo test**; el rediseño las asciende a dos pastillas visibles del encabezado, así que entran acá.
 *
 * Sin base y sin navegador: son funciones puras sobre una fila.
 */

/** Fila mínima: cada test pisa solo los campos que le importan. */
type Fila = Parameters<typeof datosDelPaciente>[0] &
  Parameters<typeof marcaDeEtapa>[0] &
  Parameters<typeof puedeEditarFechaReal>[0] &
  Parameters<typeof medicoDeVisita>[0]

function fila(over: Partial<Fila> = {}): Fila {
  return {
    operational_stage: 'por_llegar',
    real_date: null,
    arrived_at: null,
    ready_at: null,
    treating_physician: null,
    sex: null,
    birth_date: null,
    fertility: null,
    ...over,
  }
}

describe('candados por etapa', () => {
  it('concretada es fin de atención y ninguna otra etapa', () => {
    expect(estaConcretada(fila({ operational_stage: 'fin_atencion' }))).toBe(true)
    for (const s of ['por_llegar', 'concurrio_al_centro', 'inicio_atencion'] as const) {
      expect(estaConcretada(fila({ operational_stage: s }))).toBe(false)
    }
  })

  it('médico y coordinador se editan hasta que la visita se concreta', () => {
    const enCurso = fila({ operational_stage: 'inicio_atencion' })
    const cerrada = fila({ operational_stage: 'fin_atencion' })
    expect(puedeEditarMedico(enCurso)).toBe(true)
    expect(puedeEditarMedico(cerrada)).toBe(false)
    expect(puedeEditarCoordinador(enCurso)).toBe(true)
    expect(puedeEditarCoordinador(cerrada)).toBe(false)
  })
})

describe('puedeEditarFechaReal — "corregir sí, crear no"', () => {
  it('sin fecha real NO se edita: crearla desde el campo saltaría dos etapas', () => {
    expect(puedeEditarFechaReal(fila({ real_date: null }))).toBe(false)
  })

  it('con fecha real SÍ se edita: corregirla no mueve la ruta', () => {
    expect(puedeEditarFechaReal(fila({ real_date: '2026-08-14' }))).toBe(true)
  })

  it('la fecha real cargada habilita la edición en TODAS las etapas que la implican', () => {
    // real_date no nula ⇒ la vista ya derivó inicio_atencion o fin_atencion (0069). En las dos
    // el campo se edita: es la corrección de un dato, no un avance de etapa.
    for (const s of ['inicio_atencion', 'fin_atencion'] as const) {
      expect(puedeEditarFechaReal(fila({ real_date: '2026-08-14', operational_stage: s }))).toBe(true)
    }
  })
})

describe('medicoDeVisita', () => {
  it('devuelve el nombre ya coalescido por la vista (0079)', () => {
    expect(medicoDeVisita(fila({ treating_physician: 'Dra. Sosa' }))).toBe('Dra. Sosa')
  })

  it('null y cadena en blanco son lo mismo: sin médico', () => {
    expect(medicoDeVisita(fila({ treating_physician: null }))).toBeNull()
    expect(medicoDeVisita(fila({ treating_physician: '   ' }))).toBeNull()
  })

  it('recorta los espacios en vez de pintar un nombre con aire alrededor', () => {
    expect(medicoDeVisita(fila({ treating_physician: '  Dr. Pérez ' }))).toBe('Dr. Pérez')
  })
})

describe('etapaProgreso', () => {
  it('el riel se llena 25/50/75/100 y la fracción cuenta desde 1', () => {
    expect(etapaProgreso('por_llegar')).toEqual({ paso: 1, total: 4, pct: 25 })
    expect(etapaProgreso('concurrio_al_centro')).toEqual({ paso: 2, total: 4, pct: 50 })
    expect(etapaProgreso('inicio_atencion')).toEqual({ paso: 3, total: 4, pct: 75 })
    expect(etapaProgreso('fin_atencion')).toEqual({ paso: 4, total: 4, pct: 100 })
  })

  it('una etapa desconocida no rompe la barra', () => {
    // Puede llegar de una fila vieja en caché si el enum cambia (ya pasó con la 0068).
    const r = etapaProgreso('etapa_que_no_existe' as never)
    expect(r.paso).toBe(1)
    expect(Number.isFinite(r.pct)).toBe(true)
  })
})

describe('contextoDeEtapa', () => {
  it('reproduce las tres frases del mock', () => {
    expect(contextoDeEtapa('por_llegar')).toBe('la marca la hace Recepción')
    expect(contextoDeEtapa('concurrio_al_centro')).toBe('sigue inicio de atención')
    expect(contextoDeEtapa('fin_atencion')).toBe('ruta completa')
  })

  it('la etapa siguiente sale del orden real, no de un mapa escrito a mano', () => {
    expect(contextoDeEtapa('inicio_atencion')).toBe('sigue fin de atención')
  })
})

describe('marcaDeEtapa', () => {
  it('concurrió muestra la hora de llegada y el fin, la de cierre', () => {
    const f = fila({
      operational_stage: 'concurrio_al_centro',
      arrived_at: '2026-08-14T13:31:00Z',
      ready_at: '2026-08-14T14:20:00Z',
    })
    expect(marcaDeEtapa(f)).toBe('2026-08-14T13:31:00Z')
    expect(marcaDeEtapa({ ...f, operational_stage: 'fin_atencion' })).toBe('2026-08-14T14:20:00Z')
  })

  it('inicio de atención NO tiene hora: real_date es un date, no un timestamp', () => {
    // El mock dibuja una hora ahí. El dato no existe (ver TODOS.md); se muestra la etapa sin
    // hora antes que inventar una. Si algún día aparece la marca propia, este test se cae y avisa.
    const f = fila({ operational_stage: 'inicio_atencion', real_date: '2026-08-14', arrived_at: '2026-08-14T13:31:00Z' })
    expect(marcaDeEtapa(f)).toBeNull()
  })

  it('por llegar no tiene ninguna marca todavía', () => {
    expect(marcaDeEtapa(fila({ operational_stage: 'por_llegar' }))).toBeNull()
  })
})

describe('datosDelPaciente', () => {
  it('arma las cuatro celdas con las etiquetas del handoff, en orden', () => {
    const d = datosDelPaciente(fila({ sex: 'F', birth_date: '1972-03-02', fertility: 'no_fertil' }))
    expect(d.map((x) => x.k)).toEqual(['Sexo', 'Edad', 'F. nacimiento', 'Fértil'])
    expect(d[0].v).toBe('Femenino')
    expect(d[2].v).toBe('02/03/1972')
    expect(d[3].v).toBe('No fértil')
  })

  it('"Fértil" ausente NO deja hueco: la celda no existe', () => {
    // Checklist de QA del handoff. Devolver la celda vacía dejaría un espacio fantasma en la rejilla.
    const d = datosDelPaciente(fila({ sex: 'M', birth_date: '1980-01-01', fertility: null }))
    expect(d.map((x) => x.k)).toEqual(['Sexo', 'Edad', 'F. nacimiento'])
  })

  it('sin ningún dato devuelve la lista vacía, no celdas con guiones', () => {
    expect(datosDelPaciente(fila())).toEqual([])
  })

  it('un valor fuera del catálogo se muestra crudo en vez de desaparecer', () => {
    const d = datosDelPaciente(fila({ sex: 'X' }))
    expect(d).toEqual([{ k: 'Sexo', v: 'X' }])
  })
})

describe('desvío y ventana (sin test desde que existen, ahora visibles en el encabezado)', () => {
  it('el signo del desvío dice si vino después o antes', () => {
    expect(desvioDias('2026-08-11', '2026-08-14')).toBe(3)   // vino 3 días DESPUÉS → "+3 d"
    expect(desvioDias('2026-08-14', '2026-08-11')).toBe(-3)  // vino 3 días ANTES  → "−3 d"
    expect(desvioDias('2026-08-14', '2026-08-14')).toBe(0)
  })

  it('sin las dos fechas no hay desvío que mostrar', () => {
    expect(desvioDias(null, '2026-08-14')).toBeNull()
    expect(desvioDias('2026-08-14', null)).toBeNull()
  })

  it('la ventana es inclusiva en los dos extremos', () => {
    expect(fueraDeVentana('2026-08-10', '2026-08-10', '2026-08-14')).toBe(false)
    expect(fueraDeVentana('2026-08-14', '2026-08-10', '2026-08-14')).toBe(false)
    expect(fueraDeVentana('2026-08-09', '2026-08-10', '2026-08-14')).toBe(true)
    expect(fueraDeVentana('2026-08-15', '2026-08-10', '2026-08-14')).toBe(true)
  })

  it('una visita suelta (sin ventana) nunca está fuera de ventana', () => {
    // kind <> programada no tiene definición → window_start/end nulos. Sin ventana no hay desvío
    // de protocolo que señalar: pintar la pastilla roja ahí sería inventar un hallazgo.
    expect(fueraDeVentana('2026-08-15', null, null)).toBe(false)
    expect(fueraDeVentana('2026-08-15', '2026-08-10', null)).toBe(false)
  })
})
