import { describe, expect, it } from 'vitest'
// Se importa el MODELO y no `alertDismissals.ts`: aquel arrastra el cliente de Supabase, que lee
// `window` al cargarse. Estas reglas son comparación de cadenas y no necesitan nada de eso.
import type { TrackVisitRow } from './visits'
import type { AlertDismissalRow } from './alertDismissalModel'
import {
  descarteListo,
  DISMISS_REASONS,
  isReportAlertDismissed,
  isVisitAlertDismissed,
  MOTIVO_OTRO,
} from './alertDismissalModel'

/**
 * Los dos predicados de "esta alerta está archivada" (0070 / 0092).
 *
 * Es exactamente lo que este repo testea: reglas que, si quedan al revés, NO SE VEN. Un descarte
 * que silencia de más no deja rastro en pantalla —la alerta simplemente no aparece—, y en un
 * sistema auditable un vencimiento oculto es el peor resultado posible. Lo visual (el panel de
 * descartadas, los rótulos) se verifica mirando.
 *
 * El caso que da nombre al archivo es el de la 0092: hasta entonces `isReportAlertDismissed`
 * matcheaba sólo por `completion_id` e IGNORABA el ancla, así que un descarte tapaba ese reporte
 * para siempre — incluso después de destildar y volver a tildar el procedimiento, que produce un
 * vencimiento nuevo. Las de visita ya comparaban su huella desde la 0070.
 */

const VISITA = '11111111-1111-1111-1111-111111111111'
const OTRA_VISITA = '22222222-2222-2222-2222-222222222222'
const DEF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DEF_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const VENCE = '2026-08-20T13:00:00+00:00'
const VENCE_OTRO = '2026-08-27T13:00:00+00:00'

function descarte(over: Partial<AlertDismissalRow> = {}): AlertDismissalRow {
  return {
    id: 'd1',
    kind: 'reporte_procedimiento',
    visit_id: VISITA,
    report_definition_id: DEF_A,
    completion_id: null,
    status: null,
    anchor: VENCE,
    reason: 'resuelta_fuera_del_sistema',
    detail: null,
    dismissed_by: 'u1',
    dismissed_by_name: 'Ana',
    dismissed_by_role: 'Coordinadora',
    dismissed_at: '2026-08-20T14:00:00+00:00',
    ...over,
  }
}

function alerta(over: Partial<{ visit_id: string; report_definition_id: string; report_due_at: string }> = {}) {
  return { visit_id: VISITA, report_definition_id: DEF_A, report_due_at: VENCE, ...over }
}

describe('isReportAlertDismissed', () => {
  it('silencia el reporte que se descartó, con su mismo vencimiento', () => {
    expect(isReportAlertDismissed([descarte()], alerta())).toBe(true)
  })

  it('NO silencia si el vencimiento cambió: es una alerta nueva', () => {
    // El caso real: se destilda el procedimiento y se vuelve a tildar, así que `completed_at` —y
    // con él el plazo— es otro. Antes de la 0092 esto devolvía true y el vencimiento nuevo quedaba
    // oculto para siempre.
    expect(isReportAlertDismissed([descarte()], alerta({ report_due_at: VENCE_OTRO }))).toBe(false)
  })

  it('NO silencia a los reportes hermanos del mismo procedimiento', () => {
    // Desde la 0089 un procedimiento puede deber varios reportes (uno por plataforma). Descartar
    // el de un portal no puede apagar el del otro.
    expect(isReportAlertDismissed([descarte()], alerta({ report_definition_id: DEF_B }))).toBe(false)
  })

  it('NO silencia el mismo reporte en OTRA visita', () => {
    // `report_definition_id` es del estudio, no de la visita: sin el visit_id en la clave, un
    // descarte apagaría ese reporte en todos los pacientes del protocolo.
    expect(isReportAlertDismissed([descarte()], alerta({ visit_id: OTRA_VISITA }))).toBe(false)
  })

  it('ignora los descartes de visita y los de reporte sin identidad nueva', () => {
    const visita = descarte({ kind: 'visita', report_definition_id: null })
    // Un descarte de la 0070 sin migrar: la clase es la correcta pero no dice QUÉ reporte.
    const viejo = descarte({ report_definition_id: null, completion_id: 'c1' })
    expect(isReportAlertDismissed([visita, viejo], alerta())).toBe(false)
  })

  it('compara por instante y no por texto: el mismo momento escrito distinto matchea', () => {
    // Postgres puede devolver el mismo timestamptz como `+00:00` o como `Z`.
    expect(isReportAlertDismissed([descarte({ anchor: '2026-08-20T13:00:00Z' })], alerta())).toBe(true)
  })
})

describe('isVisitAlertDismissed', () => {
  const visita: Pick<TrackVisitRow, 'id' | 'computed_status' | 'window_end' | 'estimated_date'> =
    { id: VISITA, computed_status: 'ventana_vencida', window_end: '2026-08-20', estimated_date: '2026-08-13' }
  const dv = (over: Partial<AlertDismissalRow> = {}) =>
    descarte({
      kind: 'visita',
      report_definition_id: null,
      status: 'ventana_vencida',
      anchor: '2026-08-20T00:00:00+00:00',
      ...over,
    })

  it('silencia la visita con el mismo estado y la misma ventana', () => {
    expect(isVisitAlertDismissed([dv()], visita)).toBe(true)
  })

  it('NO silencia si la visita se reprogramó (ventana nueva)', () => {
    expect(isVisitAlertDismissed([dv()], { ...visita, window_end: '2026-09-10' })).toBe(false)
  })

  it('NO silencia si la visita cambió de estado', () => {
    expect(isVisitAlertDismissed([dv()], { ...visita, computed_status: 'item_vencido' })).toBe(false)
  })

  it('sin ventana, la huella es -infinity', () => {
    const sinFecha: Pick<TrackVisitRow, 'id' | 'computed_status' | 'window_end' | 'estimated_date'> =
      { id: VISITA, computed_status: 'item_vencido', window_end: null, estimated_date: null }
    expect(isVisitAlertDismissed([dv({ status: 'item_vencido', anchor: '-infinity' })], sinFecha)).toBe(true)
    expect(isVisitAlertDismissed([dv({ status: 'item_vencido' })], sinFecha)).toBe(false)
  })

  /* ── El ancla POR ESTADO (0107) ──────────────────────────────────────────────────────────────
     Es el cambio que más silenciosamente puede fallar de toda la pieza: comparar contra el campo
     equivocado SILENCIA DE MÁS, y una alerta que no aparece no deja rastro en pantalla.

     Un "no vino" existe justamente porque la ventana TODAVÍA NO venció, así que su `window_end`
     está en el FUTURO y no describe nada de lo que se archivó. Lo que define esa condición es a qué
     cita no vino el paciente: `estimated_date`.

     Los cuatro cruces (estado × campo) están abajo, y el que prueba la regla es el tercero: con la
     versión vieja —anclada siempre en `window_end`— ese caso daba `true` y silenciaba una alerta
     que no correspondía. */
  const noVino: Pick<TrackVisitRow, 'id' | 'computed_status' | 'window_end' | 'estimated_date'> =
    { id: VISITA, computed_status: 'por_reprogramar', window_end: '2026-09-30', estimated_date: '2026-08-13' }
  const dnv = (over: Partial<AlertDismissalRow> = {}) =>
    dv({ status: 'por_reprogramar', anchor: '2026-08-13T00:00:00+00:00', ...over })

  it('"no vino": silencia con la MISMA fecha citada', () => {
    expect(isVisitAlertDismissed([dnv()], noVino)).toBe(true)
  })

  it('"no vino": NO silencia si la visita se reagendó (fecha citada nueva)', () => {
    expect(isVisitAlertDismissed([dnv()], { ...noVino, estimated_date: '2026-09-01' })).toBe(false)
  })

  it('"no vino": el ancla NO es la ventana — un descarte anclado ahí no aplica', () => {
    // Con la regla vieja esto daba true: comparaba window_end (2026-09-30) contra el ancla.
    expect(isVisitAlertDismissed([dnv({ anchor: '2026-09-30T00:00:00+00:00' })], noVino)).toBe(false)
  })

  it('"ventana vencida": el ancla sigue siendo la VENTANA, no la fecha citada', () => {
    // Retrocompatibilidad: todos los descartes ya guardados son de esta clase.
    expect(isVisitAlertDismissed([dv()], visita)).toBe(true)
    expect(isVisitAlertDismissed([dv({ anchor: '2026-08-13T00:00:00+00:00' })], visita)).toBe(false)
  })

  /* La consecuencia buscada de D3: al vencer la ventana el estado cambia, la huella deja de
     coincidir y la alerta VUELVE, ahora en rojo. La situación empeoró. */
  it('un "no vino" descartado REAPARECE cuando su ventana vence', () => {
    expect(isVisitAlertDismissed([dnv()], { ...noVino, computed_status: 'ventana_vencida' })).toBe(false)
  })

  it('"no vino" sin fecha citada: la huella es -infinity', () => {
    const sinCita = { ...noVino, estimated_date: null }
    expect(isVisitAlertDismissed([dnv({ anchor: '-infinity' })], sinCita)).toBe(true)
    expect(isVisitAlertDismissed([dnv()], sinCita)).toBe(false)
  })
})

/* ── ¿Se puede confirmar este descarte? ───────────────────────────────────────────────────────
   La regla la comparten DOS pantallas que archivan la misma alerta con el mismo RPC: el modal de
   Pendientes y el popover de la campana. Vive en un solo lugar desde el plan de la campana
   (`docs/plan-campana-notificaciones.md`, D6) justamente porque su modo de falla es mudo: una copia
   con la condición al revés deja archivar sin explicación, y el motivo es lo único que se lee
   después en la auditoría. */
describe('descarteListo', () => {
  it('sin motivo elegido, no', () => {
    expect(descarteListo('', '')).toBe(false)
    // Ni siquiera con explicación: el motivo es de catálogo y el texto libre no lo reemplaza.
    expect(descarteListo('', 'la resolvimos por teléfono')).toBe(false)
  })

  it('un motivo de catálogo que no es "Otro" alcanza solo', () => {
    expect(descarteListo('resuelta_fuera_del_sistema', '')).toBe(true)
    expect(descarteListo('visita_reprogramada', '')).toBe(true)
    expect(descarteListo('no_aplica', '')).toBe(true)
    expect(descarteListo('cargada_por_error', '')).toBe(true)
  })

  it('"Otro" sin explicación, no', () => {
    expect(descarteListo(MOTIVO_OTRO, '')).toBe(false)
  })

  it('"Otro" con espacios en blanco tampoco: es el mismo vacío disfrazado', () => {
    /* El caso que un `!detail` pelado deja pasar. Una explicación de tres espacios llega al
       `audit_log` como una explicación, y no lo es. */
    expect(descarteListo(MOTIVO_OTRO, '   ')).toBe(false)
    expect(descarteListo(MOTIVO_OTRO, '\n\t ')).toBe(false)
  })

  it('"Otro" con explicación, sí', () => {
    expect(descarteListo(MOTIVO_OTRO, 'el paciente avisó por WhatsApp')).toBe(true)
    // Con espacios alrededor sigue habiendo texto: se recorta para juzgar, no para guardar.
    expect(descarteListo(MOTIVO_OTRO, '  ya vino  ')).toBe(true)
  })

  it('el catálogo incluye el motivo que exige explicación', () => {
    /* Fija el vínculo entre la constante y el catálogo: si alguien renombra el valor en
       `DISMISS_REASONS` y se olvida de `MOTIVO_OTRO`, la explicación deja de ser obligatoria en
       silencio —el `check` de la 0070 seguiría rechazándolo, pero recién contra la base. */
    expect(DISMISS_REASONS.some((r) => r.value === MOTIVO_OTRO)).toBe(true)
  })
})
