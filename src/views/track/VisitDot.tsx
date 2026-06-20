import type { ReactNode } from 'react'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual, visitStateLabel } from '../../lib/visits'
import { dotColor } from '../visitStates'

/**
 * Pelotita de una visita: muestra el NÚMERO de visita (conteo de cuántas veces vino) y refleja
 * el recorrido operativo con el color/relleno (dotVisual):
 *   · agendada (sin atender: agendada / por llegar / en el sitio) → GRIS, contorno
 *   · en_curso (atendida, checklist pendiente: atendido / listo / fuera) → CONTORNO verde marca
 *   · completa (checklist 100 %) → RELLENO verde marca
 * `isToday` agranda + halo (resalta la actual, sin cambiar el color del estado).
 */
export function VisitDot({ visit, number, today, size = 28, isToday = false, accent }: {
  visit: TrackVisitRow
  number: ReactNode
  today: string
  size?: number
  isToday?: boolean
  accent: string
}) {
  const dv = dotVisual(visit)
  const color = dotColor(dv, accent) // gris (#7C8C87) o verde de la marca
  const sz = isToday ? size + 4 : size
  const filled = dv === 'completa'
  const agendada = dv === 'agendada'

  const background = filled ? color : agendada ? 'var(--spira-surface)' : 'var(--spira-white)'
  const border = filled ? 'none' : agendada ? '1.5px solid var(--spira-line-2)' : `2px solid ${color}`
  const contentColor = filled ? '#fff' : agendada ? 'var(--spira-faint)' : color

  return (
    <span
      title={visitStateLabel(visit, today)}
      style={{
        width: sz, height: sz, flex: '0 0 auto', borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--spira-font-display)', fontWeight: 700,
        fontSize: isToday ? 14 : 12.5,
        background, border, color: contentColor,
        boxShadow: isToday ? `0 0 0 4px ${color}1F` : 'none',
      }}
    >
      {number}
    </span>
  )
}
