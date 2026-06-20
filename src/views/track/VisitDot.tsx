import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual } from '../../lib/visits'
import { DOT_VISUALS } from '../visitStates'

/**
 * Pelotita de estado de una visita. El estado visual lo deriva dotVisual(visit)
 * (= función de real_date + left_at + computed_status). `isToday` la agranda y le
 * suma el halo (ortogonal al estado). `number` es el V#/contenido cuando no va check.
 */
export function VisitDot({ visit, number, size = 28, isToday = false }: {
  visit: TrackVisitRow
  number: ReactNode
  size?: number
  isToday?: boolean
}) {
  const dv = dotVisual(visit)
  const color = DOT_VISUALS[dv].color
  const sz = isToday ? size + 4 : size
  const checkSz = Math.round(sz * 0.5)

  let background = 'var(--spira-surface)'
  let border = '1.5px solid var(--spira-line-2)'
  let content: ReactNode = <span style={{ color: 'var(--spira-faint)' }}>{number}</span>

  if (dv === 'completa' || dv === 'item_vencido') {
    background = color; border = 'none'
    content = <Icon name="check" size={checkSz} color="#fff" stroke={3} />
  } else if (dv === 'terminada') {
    background = 'var(--spira-white)'; border = `2px solid ${color}`
    content = <Icon name="check" size={checkSz} color={color} stroke={3} />
  } else if (dv === 'en_curso') {
    background = color + '24'; border = `2px solid ${color}`
    content = <span style={{ color }}>{number}</span>
  } else if (dv === 'ventana_vencida') {
    background = 'var(--spira-white)'; border = `2px solid ${color}`
    content = <span style={{ color }}>{number}</span>
  }
  // else: agendada → defaults (surface + line-2 + número faint)

  return (
    <span
      title={DOT_VISUALS[dv].label}
      style={{
        width: sz, height: sz, flex: '0 0 auto', borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--spira-font-display)', fontWeight: 700,
        fontSize: isToday ? 14 : 12.5,
        background, border,
        boxShadow: isToday ? `0 0 0 4px ${color}1F` : 'none',
      }}
    >
      {content}
    </span>
  )
}
