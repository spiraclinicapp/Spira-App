import { describe, expect, it } from 'vitest'
import type { ProcedureReportAlertRow } from '../data/reports'
import type { TrackVisitRow, VisitStatus } from '../data/visits'
import { formatAR } from '../lib/dates'
import { GRAVEDAD, SEVERIDAD_TINTA } from '../views/alertSeverity'
import {
  CLASES,
  claseDeAlerta,
  fechaDeReporte,
  fechaDeVisita,
  motivoDeAlerta,
  motivoDeReporte,
  textoDePildora,
  tinte,
  tonoDelPunto,
} from './notificaciones'

/**
 * Las reglas del desplegable de la campana.
 *
 * EL ARCHIVO NACE DE UN BUG QUE ESTUVO EN PRODUCCIÓN Y NADIE VIO. El panel resolvía el rótulo con
 * un ternario —`ventana_vencida`, o si no "Reporte de procedimiento fuera de plazo"— mientras la
 * consulta traía TRES estados de visita. Una visita a la que el paciente no vino se anunciaba como
 * un reporte de procedimiento pendiente. No había error, no había pantalla rota: el panel se veía
 * impecable y mandaba al coordinador a buscar otra cosa.
 *
 * Por eso los tres tests de `motivoDeAlerta` marcados como REGRESIÓN no se negocian: dos de ellos
 * afirman lo que el código viejo hacía mal, y son la prueba de que quedó cerrado.
 *
 * Lo visual del rediseño —la grilla de la caja, la cascada de entrada, el volteo del popover— no
 * está acá a propósito: falla de manera visible y se verifica mirando.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const v = (campos: Partial<TrackVisitRow>) =>
  ({
    kind: 'programada',
    visit_code: 'V1',
    visit_name: null,
    computed_status: 'ventana_vencida',
    window_end: null,
    estimated_date: null,
    ...campos,
  }) as TrackVisitRow

const r = (campos: Partial<ProcedureReportAlertRow> = {}) =>
  ({
    report_name: 'Informe de laboratorio',
    procedure_name: 'Extracción',
    report_due_at: '2026-08-20T13:00:00+00:00',
    ...campos,
  }) as ProcedureReportAlertRow

describe('CLASES', () => {
  it('cubre las cuatro clases que la campana muestra', () => {
    // Las tres de visita salen de GRAVEDAD, así que un grado nuevo se cubre solo. El test lo fija
    // por si alguien las vuelve a escribir a mano.
    for (const nivel of GRAVEDAD) {
      expect(CLASES[nivel], `falta la clase "${nivel}"`).toBeDefined()
    }
    expect(CLASES.reporte).toBeDefined()
    expect(Object.keys(CLASES)).toHaveLength(GRAVEDAD.length + 1)
  })

  it('cada clase tiene ícono, tinta, base y rótulo', () => {
    for (const [clave, estilo] of Object.entries(CLASES)) {
      expect(estilo.icono, `${clave} sin ícono`).toBeTruthy()
      expect(estilo.tinta, `${clave} sin tinta`).toBeTruthy()
      expect(estilo.base, `${clave} sin base`).toBeTruthy()
      expect(estilo.rotulo, `${clave} sin rótulo`).toBeTruthy()
    }
  })

  it('la tinta es siempre un token de la familia que se aclara en oscuro', () => {
    /* La tinta pinta el glifo y el punto de la campana: como color de trazo, un hex crudo no se
       aclara en tema oscuro y desaparece. Es la misma regla que ya cuida `SEVERIDAD_TINTA`. */
    for (const [clave, estilo] of Object.entries(CLASES)) {
      expect(estilo.tinta, `${clave} usa un hex crudo como tinta`).toMatch(
        /^var\(--spira-acc-deep-[a-z]+\)$/,
      )
    }
  })

  it('ningún rótulo de una alerta de VISITA habla de reportes', () => {
    // REGRESIÓN. Es el bug del ternario, mirado desde la tabla en vez de desde la función.
    for (const nivel of GRAVEDAD) {
      expect(CLASES[nivel].rotulo.toLowerCase()).not.toContain('reporte')
    }
  })
})

describe('tinte', () => {
  it('funciona con un token, que es donde la concatenación fallaba', () => {
    /* EL BUG QUE ESTA FUNCIÓN EXISTE PARA MATAR: el panel hacía `'var(--spira-primary)' + '18'`,
       que produce `"var(--spira-primary)18"`. Es CSS inválido, se descarta sin avisar y el cuadrado
       queda transparente. Estuvo así en producción. */
    expect(tinte('var(--spira-primary)', 9)).toBe(
      'color-mix(in srgb, var(--spira-primary) 9%, transparent)',
    )
  })

  it('funciona igual con un hex crudo', () => {
    // La mitad que SÍ andaba concatenando ('#A6483B' + '18' es un hex de 8 dígitos válido), y por
    // eso el bug era invisible: las filas de visita se veían bien y las de reporte no.
    expect(tinte('#A6483B', 9)).toBe('color-mix(in srgb, #A6483B 9%, transparent)')
  })

  it('nunca devuelve el color con el alpha pegado', () => {
    for (const color of ['var(--spira-primary)', '#A6483B']) {
      expect(tinte(color, 9)).not.toBe(`${color}18`)
      expect(tinte(color, 9)).toContain('color-mix')
    }
  })
})

describe('CLASES vs claseDeAlerta', () => {
  it('un estado inesperado siempre encuentra una clase con la que pintarse', () => {
    /* La regla de caer de grado vive en `alertSeverity` (y se testea allá); lo que se fija ACÁ es
       que la tabla de la campana cubra lo que esa regla devuelve. Si las dos se separaran, un
       `CLASES[undefined].tinta` desmonta el árbol y deja el topbar en blanco en TODOS los módulos
       a la vez — la campana vive en el shell. */
    for (const s of ['completa', 'proxima', 'futura', 'realizada'] as VisitStatus[]) {
      expect(CLASES[claseDeAlerta(s)], `sin clase para "${s}"`).toBeDefined()
    }
    for (const nivel of GRAVEDAD) expect(CLASES[claseDeAlerta(nivel)]).toBe(CLASES[nivel])
  })
})

describe('motivoDeAlerta', () => {
  it('REGRESIÓN · "ventana vencida" dice ventana vencida', () => {
    const texto = motivoDeAlerta(v({ computed_status: 'ventana_vencida', window_end: '2026-07-02' }))
    expect(texto).toContain('Ventana vencida')
    expect(texto).toContain('V1')
  })

  it('REGRESIÓN · "no vino" NO se anuncia como un reporte', () => {
    /* El bug exacto: el ternario mandaba este caso a "Reporte de procedimiento fuera de plazo". El
       coordinador leía que faltaba un informe cuando lo que pasó es que el paciente no se presentó. */
    const texto = motivoDeAlerta(
      v({ computed_status: 'por_reprogramar', estimated_date: '2026-07-02' }),
    )
    expect(texto.toLowerCase()).not.toContain('reporte')
    expect(texto).toContain('No vino')
  })

  it('REGRESIÓN · "pendiente vencido" NO se anuncia como un reporte', () => {
    const texto = motivoDeAlerta(v({ computed_status: 'item_vencido', window_end: '2026-07-02' }))
    expect(texto.toLowerCase()).not.toContain('reporte')
    expect(texto).toContain('Pendiente vencido')
  })

  it('un estado inesperado dice SU rótulo, no el del grado al que cayó', () => {
    /* Bajar de grado es para poder pintar la caja. El texto es otra cosa: `VISIT_STATES` tiene
       rótulo para los ocho estados, así que no hace falta inventar ni tomar prestado. */
    const texto = motivoDeAlerta(v({ computed_status: 'completa' }))
    expect(texto).toContain('Completa')
    expect(texto).not.toContain('Pendiente vencido')
  })

  it('sin fecha no arrastra un "el" colgado', () => {
    const texto = motivoDeAlerta(v({ computed_status: 'item_vencido', window_end: null }))
    expect(texto).toBe('V1 — Pendiente vencido')
    expect(texto.trimEnd()).not.toMatch(/\bel$/)
  })
})

describe('fechaDeVisita', () => {
  it('"ventana vencida" muestra el fin de la ventana', () => {
    // Se compara contra el helper y no contra un literal: la regla que se testea es QUÉ COLUMNA se
    // elige. El formato lo decide una preferencia del usuario y no es asunto de este módulo.
    expect(fechaDeVisita(v({ computed_status: 'ventana_vencida', window_end: '2026-07-02' }))).toBe(
      formatAR('2026-07-02'),
    )
  })

  it('sin ventana cae a la fecha estimada', () => {
    expect(
      fechaDeVisita(v({ computed_status: 'item_vencido', window_end: null, estimated_date: '2026-06-15' })),
    ).toBe(formatAR('2026-06-15'))
  })

  it('"no vino" usa la fecha CITADA aunque tenga ventana', () => {
    /* Espeja a `anclaDeLaVisita`. "No vino" existe porque la ventana TODAVÍA NO venció: mostrarla
       diría lo contrario de lo que pasó. Lo que define el caso es a qué cita no vino el paciente. */
    const noVino = v({
      computed_status: 'por_reprogramar',
      estimated_date: '2026-07-02',
      window_end: '2026-09-30',
    })
    expect(fechaDeVisita(noVino)).toBe(formatAR('2026-07-02'))
    expect(fechaDeVisita(noVino)).not.toBe(formatAR('2026-09-30'))
  })

  it('sin ninguna fecha devuelve null, para que la caja dibuje el guion', () => {
    expect(fechaDeVisita(v({ window_end: null, estimated_date: null }))).toBeNull()
  })
})

describe('fechaDeReporte', () => {
  it('no devuelve basura con un timestamptz', () => {
    /* `report_due_at` es timestamptz y `formatAR` espera `YYYY-MM-DD`: parte por guiones, así que un
       timestamp le sale como `18T21:16:38.446+00:00/07/2026`. Ya pasó en el comprobante de
       dispensación. Este test caza la regresión sin atarse al formato. */
    const texto = fechaDeReporte(r()) ?? ''
    expect(texto).not.toContain('T')
    expect(texto).not.toContain(':')
    expect(texto).not.toContain('+00')
    expect(texto.length).toBeGreaterThan(0)
  })

  it('sin vencimiento devuelve null', () => {
    expect(fechaDeReporte(r({ report_due_at: null as unknown as string }))).toBeNull()
  })
})

describe('motivoDeReporte', () => {
  it('nombra el reporte y su procedimiento', () => {
    expect(motivoDeReporte(r())).toBe('Reporte pendiente — Informe de laboratorio · Extracción')
  })
})

describe('tonoDelPunto', () => {
  const alerta = (s: VisitStatus) => ({ computed_status: s })

  it('sin nada no se dibuja', () => {
    expect(tonoDelPunto([], [])).toBeNull()
  })

  it('con una ventana vencida va en rojo', () => {
    expect(tonoDelPunto([alerta('ventana_vencida')], [])).toBe(SEVERIDAD_TINTA.ventana_vencida)
  })

  it('sólo "no vino" va en su propio grado, no en rojo', () => {
    expect(tonoDelPunto([alerta('por_reprogramar')], [])).toBe(SEVERIDAD_TINTA.por_reprogramar)
  })

  it('sólo pendientes vencidos NO pinta la campana de rojo', () => {
    /* El handoff pide el punto fijo en --danger. Con esto la campana gritaría rojo todos los días y
       el día que se venza una ventana de verdad no diría nada distinto: se gasta la señal. */
    expect(tonoDelPunto([alerta('item_vencido')], [])).not.toBe(SEVERIDAD_TINTA.ventana_vencida)
  })

  it('sólo reportes pendientes: el punto SE DIBUJA, en el verde de su tipo', () => {
    /* El caso que `severidadMaxima` no conoce —los reportes vienen de otra consulta y no tienen
       computed_status— y que sin este fallback dejaría la campana muda mientras la píldora del
       panel dice "3 pendientes". */
    expect(tonoDelPunto([], [r(), r(), r()])).toBe(CLASES.reporte.tinta)
  })

  it('con las dos clases manda la visita, que es la que tiene grados', () => {
    expect(tonoDelPunto([alerta('ventana_vencida')], [r()])).toBe(SEVERIDAD_TINTA.ventana_vencida)
  })
})

describe('textoDePildora', () => {
  it('en singular no dice "1 pendientes"', () => {
    expect(textoDePildora(1)).toBe('1 pendiente')
  })

  it('en plural lleva el número adelante', () => {
    expect(textoDePildora(5)).toBe('5 pendientes')
    expect(textoDePildora(43)).toBe('43 pendientes')
  })

  it('en cero no dice nada', () => {
    // La píldora no se dibuja sin alertas; si alguien se olvidara de ocultarla, "0 pendientes"
    // anuncia trabajo donde no hay.
    expect(textoDePildora(0)).toBe('')
  })
})
