import { describe, expect, it } from 'vitest'
import {
  contextoDeEtapa, datosDelPaciente, estaConcretada, etapaProgreso, fechaSegunProtocolo,
  horaDeAtencion, marcaDeEtapa, opcionesDeCoordinador,
  medicoDeVisita, puedeEditarCoordinador, muestraFechaReal, puedeEditarMedico,
} from './visitHeaderRules'
import { desvioDias, fueraDeVentana } from '../../lib/visits'

/**
 * Las reglas del encabezado de la visita.
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Que el riel se llene al 75 % en vez
 * de al 50 % se ve mirando la pantalla; que `muestraFechaReal` devuelva `true` de más, no —
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
  Parameters<typeof muestraFechaReal>[0] &
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

describe('muestraFechaReal — el interruptor citación / fecha real', () => {
  it('sin fecha real NO se edita: crearla desde el campo saltaría dos etapas', () => {
    expect(muestraFechaReal(fila({ real_date: null }))).toBe(false)
  })

  it('con fecha real SÍ se edita: corregirla no mueve la ruta', () => {
    expect(muestraFechaReal(fila({ real_date: '2026-08-14' }))).toBe(true)
  })

  it('la fecha real cargada habilita la edición en TODAS las etapas que la implican', () => {
    // real_date no nula ⇒ la vista ya derivó inicio_atencion o fin_atencion (0069). En las dos
    // el campo se edita: es la corrección de un dato, no un avance de etapa.
    for (const s of ['inicio_atencion', 'fin_atencion'] as const) {
      expect(muestraFechaReal(fila({ real_date: '2026-08-14', operational_stage: s }))).toBe(true)
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

describe('horaDeAtencion · el sello del inicio de atención (0102)', () => {
  // 16:31 hora argentina = 19:31 UTC. Se escribe en UTC a propósito: es como llega el
  // timestamptz de la base, y es lo que hace fallar a cualquier implementación que recorte el ISO.
  const selloTarde = '2026-08-29T19:31:00Z'

  it('devuelve la hora cuando el sello es del mismo día que la fecha real', () => {
    expect(horaDeAtencion({ real_date: '2026-08-29', attended_at: selloTarde })).toBe('16:31')
  })

  it('sin sello no inventa hora: las visitas anteriores a la 0102 muestran solo la fecha', () => {
    expect(horaDeAtencion({ real_date: '2026-08-29', attended_at: null })).toBeNull()
  })

  it('sin fecha real no hay nada que acompañar', () => {
    expect(horaDeAtencion({ real_date: null, attended_at: selloTarde })).toBeNull()
  })

  it('si CORRIGIERON la fecha real, el sello deja de mostrarse', () => {
    // Éste es el caso que falla en silencio: la pantalla se ve impecable y la hora que muestra
    // pertenece a otro día. "14/08/2026 16:31" sería una hora que ese día no pasó.
    expect(horaDeAtencion({ real_date: '2026-08-14', attended_at: selloTarde })).toBeNull()
  })

  it('una atención de la TARDE no se compara contra el día UTC', () => {
    // 21:45 hora argentina del 29 = 00:45 UTC del 30. Recortando el ISO (slice(0,10)) el día
    // saldría '2026-08-30', no coincidiría con real_date y la hora desaparecería justo en las
    // atenciones de la tarde — sin ningún error a la vista.
    const nocturno = '2026-08-30T00:45:00Z'
    expect(horaDeAtencion({ real_date: '2026-08-29', attended_at: nocturno })).toBe('21:45')
    expect(nocturno.slice(0, 10)).toBe('2026-08-30')   // el valor que NO hay que usar
  })
})

describe('fechaSegunProtocolo · lo que manda el cronograma', () => {
  /** Visita del cronograma: randomizada el 20/05, con offset de 84 días → 12/08. */
  const prog = (over: Record<string, unknown> = {}) => ({
    kind: 'programada' as const,
    date_mode: 'automatica' as const,
    offset_days: 84,
    enrollment_randomization_date: '2026-05-20',
    ...over,
  })

  it('ancla en la RANDOMIZACIÓN, no en el enrolamiento', () => {
    // El generador vigente (0022) inserta el cronograma con randomization_date + offset_days.
    // La versión de la 0003 usaba enrollment_date y quedó superada: derivar desde ahí daría una
    // fecha plausible y equivocada en toda visita de tratamiento.
    expect(fechaSegunProtocolo(prog())).toBe('2026-08-12')
  })

  it('una visita SUELTA no tiene fecha de protocolo', () => {
    // Firma, screening y randomización se crean de a una; el protocolo no les fija fecha.
    for (const kind of ['firma', 'screening', 'randomizacion']) {
      expect(fechaSegunProtocolo(prog({ kind }))).toBeNull()
    }
  })

  it('agenda libre tampoco: su offset es una referencia, no una fecha mandada', () => {
    expect(fechaSegunProtocolo(prog({ date_mode: 'libre' }))).toBeNull()
  })

  it('sin randomización o sin offset no hay cuenta que hacer', () => {
    expect(fechaSegunProtocolo(prog({ enrollment_randomization_date: null }))).toBeNull()
    expect(fechaSegunProtocolo(prog({ offset_days: null }))).toBeNull()
  })

  it('un offset de 0 SÍ da fecha: es el día de la randomización, no un dato ausente', () => {
    // El caso que rompe cualquier guard escrito con `if (!offset_days)`.
    expect(fechaSegunProtocolo(prog({ offset_days: 0 }))).toBe('2026-05-20')
  })

  it('cruza el fin de mes sin correrse', () => {
    expect(fechaSegunProtocolo(prog({ enrollment_randomization_date: '2026-01-31', offset_days: 29 }))).toBe('2026-03-01')
  })
})

describe('opcionesDeCoordinador · el chip tiene que poder nombrar lo que ya está asignado', () => {
  const DEL_PROTO = [{ id: 'u-lau', full_name: 'Lautaro Molina' }]

  it('sin coordinador asignado, sólo el protocolo', () => {
    const o = opcionesDeCoordinador({ coordinator_id: null, coordinator_name: null }, DEL_PROTO)
    expect(o.map((x) => x.value)).toEqual(['', 'u-lau'])
  })

  it('el asignado que SÍ es del protocolo no se duplica', () => {
    const o = opcionesDeCoordinador({ coordinator_id: 'u-lau', coordinator_name: 'Lautaro Molina' }, DEL_PROTO)
    expect(o.filter((x) => x.value === 'u-lau')).toHaveLength(1)
  })

  it('el asignado que NO es del protocolo se agrega con su nombre sellado', () => {
    // El bug del 2026-08-30: desde la 0102 la marca de atención sella a quien apriete, sin validar
    // contra protocol_coordinators. Sin esta opción el desplegable no encontraba su propio valor y
    // caía al placeholder: "Asignar coordinador" sobre una visita que ya tenía coordinador.
    const o = opcionesDeCoordinador({ coordinator_id: 'u-ger', coordinator_name: 'Spira Clinic' }, DEL_PROTO)
    expect(o.some((x) => x.value === 'u-ger' && x.label === 'Spira Clinic')).toBe(true)
  })

  it('sin nombre sellado (filas anteriores a la 0065) etiqueta genérico, nunca vacío', () => {
    // Una opción sin texto devolvería el chip al placeholder, que es el bug otra vez.
    const o = opcionesDeCoordinador({ coordinator_id: 'u-viejo', coordinator_name: null }, DEL_PROTO)
    expect(o.find((x) => x.value === 'u-viejo')?.label).toBe('Coordinador asignado')
  })

  it('sin coordinadores en el protocolo igual puede nombrar al asignado', () => {
    const o = opcionesDeCoordinador({ coordinator_id: 'u-ger', coordinator_name: 'Spira Clinic' }, [])
    expect(o.map((x) => x.label)).toEqual(['— Sin asignar —', 'Spira Clinic'])
  })
})
