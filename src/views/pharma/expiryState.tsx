import type { IconName } from '../../components/Icon'
import { addDaysISO } from '../../lib/dates'

/**
 * Estado de vencimiento de un lote/renglón, COMPARTIDO por Pharma (Catálogo de
 * Medicamentos y el detalle de Recepción). Regla del módulo — WCAG 1.4.1: NUNCA
 * color solo. Cada estado lleva forma (ícono) + color + etiqueta (para el
 * aria-label), así un daltónico distingue "por vencer" de "vigente".
 *
 * Un único umbral de "vence pronto" para todo Pharma, para no tener el 30 en dos
 * lugares. Espeja los 30 días de la vista `v_medication_lots_detail` (0041).
 */
export type Estado = 'ok' | 'pronto' | 'vencido'

/** "Vence pronto" = faltan ≤ N días. Fuente única del umbral en el front. */
export const EXPIRY_SOON_DAYS = 30

export const ESTADO_CFG: Record<Estado, { color: string; icon: IconName | null; label: string }> = {
  ok: { color: 'var(--spira-ink)', icon: null, label: 'Vigente' },
  pronto: { color: 'var(--spira-pharma-solid)', icon: 'clock', label: 'Vence pronto' },
  vencido: { color: 'var(--spira-danger)', icon: 'alert', label: 'Vencido' },
}

/**
 * Estado a partir de la fecha CRUDA de vencimiento (ISO 'YYYY-MM-DD'). Lo usa el
 * renglón de recepción, que NO pasa por `v_medication_lots_detail` (esa vista es
 * sobre `medication_lots`; los `reception_items` todavía no son lote). `hoy` en ISO
 * local (`todayISO()`). Sin fecha = 'ok' (una recepción puede no traer vencimiento;
 * no bloquea). Comparación lexicográfica de strings YYYY-MM-DD (segura, sin Date).
 */
export function estadoFromExpiry(iso: string | null, hoy: string): Estado {
  if (!iso) return 'ok'
  if (iso < hoy) return 'vencido'
  return iso <= addDaysISO(hoy, EXPIRY_SOON_DAYS) ? 'pronto' : 'ok'
}
