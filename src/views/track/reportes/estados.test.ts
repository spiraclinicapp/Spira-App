import { describe, expect, it } from 'vitest'
import type { ReportStatusRow } from '../../../data/reportStatus'
import {
  canUntickProcedure, closedBy, contarVencidos, dueLabel, isOverdue, isStage,
  nextStage, porEtapa, prevStage, repartirTablero, visitClosed,
  reporteTitulo,
} from './estados'

/**
 * Reglas del tablero de Reportes pendientes (0090).
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. `visitClosed` decide qué
 * DESAPARECE del tablero — si da true de más, una visita con trabajo pendiente se esfuma y nadie
 * se entera hasta que el monitor la busca. `isOverdue` de menos apaga el contador rojo, que es el
 * único aviso de que un reporte se pasó. `canUntickProcedure` es el espejo del guard de la base:
 * si dice que sí cuando la base va a decir que no, el usuario choca contra un error crudo.
 * En cambio las columnas, los colores y el arrastre fallan de manera visible y se verifican mirando.
 *
 * Todas reciben `now` por parámetro: sin eso, un test de vencimiento pasa hoy y falla mañana.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const AHORA = new Date('2026-08-23T12:00:00Z').getTime()
const h = (n: number) => new Date(AHORA + n * 3_600_000).toISOString()

/** Fila mínima. Sólo se completan los campos que las reglas miran; el resto es relleno estable. */
function row(over: Partial<ReportStatusRow> = {}): ReportStatusRow {
  return {
    visit_id: 'v1', report_definition_id: 'd1', report_name: 'Hematología completa',
    platform: 'labcorp', link: null, eta_hours: 48, notes: null, sort_order: 1,
    procedure_id: 'p1', procedure_name: 'Extracción de sangre', procedure_code: 'HEM',
    procedure_category: 'Laboratorio',
    completed_at: h(-48), completed: true, visita_iniciada: true, procedure_order: 1,
    due_at: h(24), stage: 'pendiente',
    report_status_id: null, updated_at: null, updated_by_name: null,
    protocol_id: 'pr1', patient_id: 'pa1', visit_def_id: 'vd1',
    protocol_code: 'ACT18301', patient_code: 'ACT18301-004', patient_name: 'Herrera, Marisol',
    visit_code: 'V3', visit_name: 'Randomización', visit_sort_order: 3, history_count: 0,
    coordinator_id: null, coordinator_name: null,
    ...over,
  }
}

describe('etapas', () => {
  it('reconoce las tres del check de la base', () => {
    for (const s of ['pendiente', 'descargado', 'evolucionado']) expect(isStage(s)).toBe(true)
    expect(isStage('archivado')).toBe(false)
    expect(isStage(null)).toBe(false)
  })

  it('avanza y retrocede de a una', () => {
    expect(nextStage('pendiente')).toBe('descargado')
    expect(nextStage('descargado')).toBe('evolucionado')
    expect(prevStage('evolucionado')).toBe('descargado')
    expect(prevStage('descargado')).toBe('pendiente')
  })

  it('los bordes no se pasan', () => {
    // Sin esto, el botón de avanzar seguiría dibujándose en la última columna y el de retroceder
    // en la primera: dos botones que no pueden hacer nada.
    expect(nextStage('evolucionado')).toBeNull()
    expect(prevStage('pendiente')).toBeNull()
  })
})

describe('vencimiento', () => {
  it('un reporte sin plazo NO vence nunca', () => {
    expect(isOverdue(row({ due_at: null }), AHORA)).toBe(false)
    expect(dueLabel(row({ due_at: null }), AHORA).texto).toBe('Sin plazo')
  })

  it('el borde exacto todavía no está vencido', () => {
    // Con now === due_at el plazo se cumple recién en el instante siguiente. Pintarlo de rojo
    // justo al vencer se lee como error de cálculo.
    expect(isOverdue(row({ due_at: new Date(AHORA).toISOString() }), AHORA)).toBe(false)
    expect(isOverdue(row({ due_at: new Date(AHORA - 1).toISOString() }), AHORA)).toBe(true)
  })

  it('sólo vence lo que sigue pendiente', () => {
    // EL caso que importa: una vez descargado, el plazo dejó de correr. Contarlo como vencido
    // inflaría el contador rojo del encabezado con trabajo que YA se hizo.
    const vencido = { due_at: h(-10) }
    expect(isOverdue(row({ ...vencido, stage: 'pendiente' }), AHORA)).toBe(true)
    expect(isOverdue(row({ ...vencido, stage: 'descargado' }), AHORA)).toBe(false)
    expect(isOverdue(row({ ...vencido, stage: 'evolucionado' }), AHORA)).toBe(false)
  })

  it('dice cuánto falta, en días o en horas', () => {
    expect(dueLabel(row({ due_at: h(72) }), AHORA).texto).toBe('Vence en 3 días')
    expect(dueLabel(row({ due_at: h(24) }), AHORA).texto).toBe('Vence en 1 día')
    expect(dueLabel(row({ due_at: h(19) }), AHORA).texto).toBe('Vence en 19 h')
  })

  it('dice cuánto hace que venció', () => {
    expect(dueLabel(row({ due_at: h(-50) }), AHORA).texto).toBe('Vencido hace 2 días')
    expect(dueLabel(row({ due_at: h(-3) }), AHORA).texto).toBe('Vencido hace 3 h')
  })

  it('el sublímite de una hora se dice, no se redondea a cero', () => {
    // "Vence en 0 h" no le dice nada a nadie.
    expect(dueLabel(row({ due_at: new Date(AHORA + 60_000).toISOString() }), AHORA).texto).toBe('Vence en menos de 1 h')
    expect(dueLabel(row({ due_at: new Date(AHORA - 60_000).toISOString() }), AHORA).texto).toBe('Vencido hace menos de 1 h')
  })

  it('el rojo del texto acompaña sólo a lo vencido y pendiente', () => {
    expect(dueLabel(row({ due_at: h(-10), stage: 'pendiente' }), AHORA).overdue).toBe(true)
    expect(dueLabel(row({ due_at: h(-10), stage: 'descargado' }), AHORA).overdue).toBe(false)
    expect(dueLabel(row({ due_at: h(10) }), AHORA).overdue).toBe(false)
  })

  it('cuenta los vencidos del encabezado', () => {
    const rows = [
      row({ report_definition_id: 'a', due_at: h(-1) }),
      row({ report_definition_id: 'b', due_at: h(-99) }),
      row({ report_definition_id: 'c', due_at: h(5) }),
      row({ report_definition_id: 'd', due_at: h(-99), stage: 'descargado' }),
      row({ report_definition_id: 'e', due_at: null }),
    ]
    expect(contarVencidos(rows, AHORA)).toBe(2)
  })
})

describe('cierre de visita', () => {
  it('una visita SIN reportes no está cerrada', () => {
    // Devolver true acá la haría aparecer en "Visitas cerradas · alerta finalizada" sin que nunca
    // hubiera habido nada que cerrar. Es la trampa del caso vacío.
    expect(visitClosed([])).toBe(false)
  })

  it('con uno solo sin evolucionar, no está cerrada', () => {
    expect(visitClosed([
      row({ report_definition_id: 'a', stage: 'evolucionado' }),
      row({ report_definition_id: 'b', stage: 'descargado' }),
    ])).toBe(false)
    expect(visitClosed([
      row({ report_definition_id: 'a', stage: 'evolucionado' }),
      row({ report_definition_id: 'b', stage: 'pendiente' }),
    ])).toBe(false)
  })

  it('con todos evolucionados, sí', () => {
    expect(visitClosed([
      row({ report_definition_id: 'a', stage: 'evolucionado' }),
      row({ report_definition_id: 'b', stage: 'evolucionado' }),
    ])).toBe(true)
  })

  it('un procedimiento SIN REALIZAR impide cerrar, aunque el resto esté evolucionado', () => {
    // EL bug que esta forma de la vista viene a arreglar. Si la vista sólo emitiera reportes de
    // procedimientos ya realizados, acá se vería un único reporte evolucionado y la visita se
    // cerraría sola, llevándose del tablero un procedimiento que todavía no se hizo.
    expect(visitClosed([
      row({ report_definition_id: 'a', stage: 'evolucionado', completed: true }),
      row({ report_definition_id: 'b', stage: 'pendiente', completed: false, due_at: null, completed_at: null }),
    ])).toBe(false)
  })

  it('el cierre lo firma el ÚLTIMO movimiento', () => {
    // Es el que la terminó de cerrar; atribuirlo a otro sería falsear la traza.
    const cierre = closedBy([
      row({ report_definition_id: 'a', stage: 'evolucionado', updated_at: h(-5), updated_by_name: 'Rocío Paz' }),
      row({ report_definition_id: 'b', stage: 'evolucionado', updated_at: h(-1), updated_by_name: 'Federico Razquin' }),
    ])
    expect(cierre).toEqual({ nombre: 'Federico Razquin', cuando: h(-1) })
  })

  it('sin cerrar no hay firma', () => {
    expect(closedBy([row({ stage: 'descargado', updated_at: h(-1), updated_by_name: 'Rocío Paz' })])).toBeNull()
  })
})

describe('reparto del tablero', () => {
  const cerrada = (visitId: string, cuando: string) => [
    row({ visit_id: visitId, report_definition_id: visitId + 'a', stage: 'evolucionado', updated_at: cuando, updated_by_name: 'Rocío Paz' }),
    row({ visit_id: visitId, report_definition_id: visitId + 'b', stage: 'evolucionado', updated_at: cuando, updated_by_name: 'Rocío Paz' }),
  ]

  it('un reporte cuyo procedimiento no se realizó NO ocupa columna', () => {
    // Su lugar es el desglose del modal de visita, con el aviso de que se habilita al marcarlo.
    // En el tablero sería una tarjeta con un vencimiento que todavía no empezó a correr.
    const { enJuego } = repartirTablero([
      row({ visit_id: 'v', report_definition_id: 'hecho', completed: true }),
      row({ visit_id: 'v', report_definition_id: 'sin-hacer', completed: false, due_at: null, completed_at: null }),
    ], AHORA)
    expect(enJuego.map((r) => r.report_definition_id)).toEqual(['hecho'])
  })

  it('la visita cerrada sale de las columnas y entra a la lista de abajo', () => {
    const { enJuego, cerradas } = repartirTablero([
      ...cerrada('v-cerrada', h(-2)),
      row({ visit_id: 'v-abierta', stage: 'pendiente' }),
    ], AHORA)
    expect(enJuego.map((r) => r.visit_id)).toEqual(['v-abierta'])
    expect(cerradas.map((c) => c.visitId)).toEqual(['v-cerrada'])
    expect(cerradas[0].cierre?.nombre).toBe('Rocío Paz')
  })

  it('las cerradas hace más de una semana no se listan, pero se CUENTAN', () => {
    // Contarlas es lo que permite decir "y 12 más" en vez de dar a entender que no hubo ninguna.
    const { cerradas, cerradasOcultas } = repartirTablero([
      ...cerrada('reciente', h(-24)),
      ...cerrada('vieja', h(-24 * 30)),
    ], AHORA)
    expect(cerradas.map((c) => c.visitId)).toEqual(['reciente'])
    expect(cerradasOcultas).toBe(1)
  })

  it('las cerradas se ordenan de la más reciente a la más vieja', () => {
    const { cerradas } = repartirTablero([
      ...cerrada('anteayer', h(-48)),
      ...cerrada('hoy', h(-1)),
      ...cerrada('ayer', h(-24)),
    ], AHORA)
    expect(cerradas.map((c) => c.visitId)).toEqual(['hoy', 'ayer', 'anteayer'])
  })

  it('una visita cerrada sin fecha se cuenta como oculta, no se muestra a medias', () => {
    // Mostrarla diría "cerrada por Equipo · —", que no informa nada.
    const { cerradas, cerradasOcultas } = repartirTablero([
      row({ visit_id: 'sin-fecha', stage: 'evolucionado', updated_at: null }),
    ], AHORA)
    expect(cerradas).toHaveLength(0)
    expect(cerradasOcultas).toBe(1)
  })
})

describe('columnas', () => {
  it('reparte cada fila en su columna', () => {
    const cols = porEtapa([
      row({ report_definition_id: 'a', stage: 'pendiente' }),
      row({ report_definition_id: 'b', stage: 'descargado' }),
      row({ report_definition_id: 'c', stage: 'evolucionado' }),
      row({ report_definition_id: 'd', stage: 'pendiente' }),
    ])
    expect(cols.pendiente).toHaveLength(2)
    expect(cols.descargado).toHaveLength(1)
    expect(cols.evolucionado).toHaveLength(1)
  })

  it('una etapa desconocida no rompe el tablero ni se cuela en una columna', () => {
    // El front puede leer un schema más nuevo que él. Que se pierda una tarjeta es malo; que la
    // pantalla explote es peor.
    const cols = porEtapa([row({ stage: 'archivado' })])
    expect(cols.pendiente.length + cols.descargado.length + cols.evolucionado.length).toBe(0)
  })
})

describe('guard del destilde', () => {
  it('con todo en pendiente, se puede destildar', () => {
    expect(canUntickProcedure([row({ stage: 'pendiente' })])).toEqual({ puede: true, avanzados: 0 })
  })

  it('sin reportes, se puede destildar', () => {
    expect(canUntickProcedure([])).toEqual({ puede: true, avanzados: 0 })
  })

  it('con alguno avanzado, NO — y dice cuántos', () => {
    // El número va al mensaje: "tiene 2 reportes ya avanzados" es accionable, "no se puede" no.
    const r = canUntickProcedure([
      row({ report_definition_id: 'a', stage: 'descargado' }),
      row({ report_definition_id: 'b', stage: 'evolucionado' }),
      row({ report_definition_id: 'c', stage: 'pendiente' }),
    ])
    expect(r).toEqual({ puede: false, avanzados: 2 })
  })
})

describe('reporteTitulo', () => {
  /* La regla es "iguales", no "contiene a", y ese matiz es todo el test: en una misma visita puede
     haber DOS reportes del mismo procedimiento —uno llamado "ECG" y otro "Electrocardiograma
     (ECG)"—, y colapsar por "contiene" los dejaría con el mismo rótulo, indistinguibles en
     pantalla. Redundante se puede leer; ambiguo, no. */
  it('colapsa cuando el reporte y el procedimiento son el mismo texto', () => {
    expect(reporteTitulo('Electrocardiograma (ECG)', 'Electrocardiograma (ECG)')).toBe('Electrocardiograma (ECG)')
  })

  it('colapsa con diferencias de mayúsculas o espacios', () => {
    expect(reporteTitulo(' Holter ', 'holter')).toBe('Holter')
  })

  it('NO colapsa cuando el procedimiento sólo CONTIENE al reporte', () => {
    expect(reporteTitulo('ECG', 'Electrocardiograma (ECG)')).toBe('ECG de Electrocardiograma (ECG)')
  })

  it('compone normalmente cuando son distintos', () => {
    expect(reporteTitulo('Informe del cardiólogo', 'Ergometría')).toBe('Informe del cardiólogo de Ergometría')
  })
})
