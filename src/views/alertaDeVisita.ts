import type { TrackVisitRow } from '../data/visits'
import { formatAR, isoDayAR } from '../lib/dates'
import { turnoCancelado } from '../lib/visits'
import { cierreDeVentana } from './track/retomar'

/* ┌─ Cómo se nombra una alerta de visita en Pendientes, y desde cuándo cuenta ────────────────────┐
   Puro y con test porque las dos reglas fallan en silencio. El renglón decía «Reporte de
   procedimiento fuera de plazo» para todo lo que no fuera ventana vencida —también para un «No vino»,
   desde la 0107—, que es el mismo error que la ficha tenía y se corrigió el 2026-09-28
   (`fichaAlertas.ts`). Y desde la 0161 `por_reprogramar` tiene dos causas: el paciente no vino, o se
   canceló el turno. Un rótulo equivocado no da error: dice otra cosa, con la cara de un dato.
   └────────────────────────────────────────────────────────────────────────────────────────────┘ */

type AlertaDeVisita = Pick<TrackVisitRow,
  'computed_status' | 'window_end' | 'estimated_date' | 'turno_cancelado_at' | 'visit_code' | 'visit_name' | 'kind'>

/**
 * El motivo del renglón de una alerta de visita en Pendientes: qué pasó y con qué visita (`titulo`, el de
 * `visitTitle`). Las cuatro clases: ventana vencida, turno cancelado, no vino y reporte vencido. `hoy` (ISO)
 * es para la urgencia de un turno cancelado: cuánto le queda a la ventana, como en «Se pasó la fecha».
 */
export function motivoDeAlertaDeVisita(a: AlertaDeVisita, titulo: string, hoy: string): string {
  if (a.computed_status === 'ventana_vencida') {
    return `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${titulo}`
  }
  if (a.computed_status === 'por_reprogramar') {
    if (turnoCancelado(a) && a.turno_cancelado_at) {
      const cierre = cierreDeVentana(a, hoy)
      return `Turno cancelado el ${formatAR(isoDayAR(a.turno_cancelado_at))} · ${cierre ?? 'sin fecha nueva'} · ${titulo}`
    }
    return `No vino${a.estimated_date ? ` el ${formatAR(a.estimated_date)}` : ''} · sin fecha nueva · ${titulo}`
  }
  return `Reporte de procedimiento fuera de plazo · ${titulo}`
}

/**
 * Desde cuándo cuenta una alerta de visita, para el filtro de antigüedad de Pendientes. El fin de la
 * ventana o la citación, como siempre; y para un turno cancelado sin ventana (una visita libre del cuadro,
 * 0161), el día en que se canceló: sin eso la fila no tenía fecha y desaparecía con cualquier antigüedad
 * elegida. `null` = no hay de dónde sacarla.
 */
export function fechaDeReferenciaDeAlerta(a: Pick<TrackVisitRow, 'window_end' | 'estimated_date' | 'turno_cancelado_at'>): string | null {
  return a.window_end ?? a.estimated_date ?? (a.turno_cancelado_at ? isoDayAR(a.turno_cancelado_at) : null)
}
