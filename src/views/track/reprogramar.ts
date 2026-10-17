/* ┌─ Qué fecha propone «Reprogramar», y cuándo una fecha cae fuera de la ventana ─────────────────┐
   Vive aparte y puro porque `RescheduleModal` importa la capa de datos (y con ella el cliente de
   Supabase, que vitest no puede cargar), y porque las dos reglas fallan en silencio: una fecha propuesta
   equivocada se guarda con un clic, y un «fuera de ventana» de más hace confirmar algo que no lo es.
   └────────────────────────────────────────────────────────────────────────────────────────────┘ */

/**
 * La fecha con la que abre el modal. La citación, si la visita tiene una; y si tiene el turno cancelado
 * (0161, plan `docs/plan-cancelar-turno.md`), la fecha que tenía, siempre que todavía sea hoy o después: así
 * un clic equivocado en «Cancelar turno» se deshace en dos clics. Una citación vieja que ya pasó no se
 * propone (reprogramar a un día que pasó es casi siempre un error): el campo arranca vacío. `hoy` es ISO.
 */
export function fechaPropuesta(
  v: { estimated_date: string | null; citacion_cancelada?: string | null },
  hoy: string,
): string {
  if (v.estimated_date) return v.estimated_date
  if (v.citacion_cancelada && v.citacion_cancelada >= hoy) return v.citacion_cancelada
  return ''
}

/**
 * ¿La fecha elegida cae fuera de la ventana del protocolo? Sin fecha, NO: `'' < window_start` daba
 * verdadero y el modal pedía confirmar «fuera de ventana» un campo vacío. Comparación de ISO como texto,
 * como `fueraDeVentana` (lib/visits.ts).
 */
export function fueraDeVentanaAlReprogramar(fecha: string, windowStart: string | null, windowEnd: string | null): boolean {
  if (!fecha || windowStart == null || windowEnd == null) return false
  return fecha < windowStart || fecha > windowEnd
}
