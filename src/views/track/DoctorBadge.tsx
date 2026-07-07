import { Icon } from '../../components/Icon'
import type { DayVisitRow } from '../../data/dayVisits'

/**
 * Badge del estado médico de la visita, reusado en la fila de "Visitas del día" y en la
 * cabecera del detalle (`VisitDetail`). Se apoya en los campos que YA existen en la vista
 * (`wants_doctor`, `doctor_seen_at`, migraciones 0023/0031) — sin base nueva. El *motivo*
 * de la derivación queda para más adelante (necesita tabla nueva).
 *
 * No hay `stethoscope` en el set de íconos → se reusa `users` (mismo criterio que la fila
 * vieja). `accent` (hex del módulo) tiñe el estado "esperando"; el "visto" va en verde.
 */
export function DoctorBadge({ visit, accent }: {
  visit: Pick<DayVisitRow, 'wants_doctor' | 'doctor_seen_at'>
  accent: string
}) {
  if (!visit.wants_doctor && !visit.doctor_seen_at) return null
  const seen = visit.doctor_seen_at != null
  const bg = seen ? '#5C8A5A22' : accent + '18'
  const fg = seen ? 'var(--spira-good)' : accent
  return (
    <span
      title={seen ? 'Atendido por el médico' : 'En la cola del médico'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px',
        borderRadius: 'var(--spira-radius-pill)', background: bg, color: fg,
        fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
      }}
    >
      <Icon name="users" size={13} color={fg} />
      {seen ? 'Visto por médico' : 'Esperando médico'}
      {seen && <Icon name="check" size={13} color={fg} stroke={2.4} />}
    </span>
  )
}
