import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual } from '../../lib/visits'
import { DOT_LABELS, dotColor } from '../visitStates'

/**
 * Pelotita de estado de una visita. El estado lo deriva dotVisual(visit) (de real_date +
 * left_at + computed_status). El COLOR del ciclo es el VERDE DE LA MARCA (`accent`):
 *   · agendada      → contorno gris (pendiente)
 *   · en_curso      → contorno verde, SIN rellenar (se está atendiendo)
 *   · terminada     → contorno verde con check (se retiró, checklist pendiente)
 *   · completa      → RELLENO verde + check blanco (checklist 100 %)
 *   · item/ventana  → contorno ámbar/rojo (alertas)
 * Solo "completa" se rellena; el resto es contorno. `isToday` resalta la actual con el verde
 * de la marca + halo (ortogonal al estado).
 */
export function VisitDot({ visit, number, size = 28, isToday = false, accent }: {
  visit: TrackVisitRow
  number: ReactNode
  size?: number
  isToday?: boolean
  accent: string
}) {
  const dv = dotVisual(visit)
  const color = dotColor(dv, accent)
  const sz = isToday ? size + 4 : size
  const check = dv === 'completa' || dv === 'terminada' || dv === 'item_vencido'

  let background: string
  let border: string
  let contentColor: string
  if (dv === 'completa') {
    // Único estado RELLENO: verde de la marca, check blanco.
    background = color
    border = 'none'
    contentColor = '#fff'
  } else if (dv === 'agendada' && !isToday) {
    // Pendiente y neutra: contorno gris claro, número tenue.
    background = 'var(--spira-surface)'
    border = '1.5px solid var(--spira-line-2)'
    contentColor = 'var(--spira-faint)'
  } else {
    // En curso / terminada / alertas / la actual: CONTORNO (sin rellenar) del color.
    // La actual (isToday) se resalta con el verde de la marca aunque siga agendada.
    const ring = isToday ? accent : color
    background = 'var(--spira-white)'
    border = `2px solid ${ring}`
    contentColor = ring
  }

  return (
    <span
      title={DOT_LABELS[dv]}
      style={{
        width: sz, height: sz, flex: '0 0 auto', borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--spira-font-display)', fontWeight: 700,
        fontSize: isToday ? 14 : 12.5,
        background, border,
        boxShadow: isToday ? `0 0 0 4px ${accent}1F` : 'none',
      }}
    >
      {check
        ? <Icon name="check" size={Math.round(sz * 0.5)} color={contentColor} stroke={3} />
        : <span style={{ color: contentColor }}>{number}</span>}
    </span>
  )
}
