import { Icon } from '../../components/Icon'
import type { TrackVisitRow } from '../../data/visits'
import { dotVisual, visitStateLabel } from '../../lib/visits'
import { dotColor } from '../visitStates'

/**
 * Pelotita de una visita: dice en qué punto del recorrido operativo está (dotVisual), y NADA MÁS.
 *   · agendada (sin atender: agendada / por llegar / concurrió) → GRIS, contorno, vacía
 *   · en_curso (atendida, con pendientes)                         → CONTORNO verde con un punto adentro
 *   · completa (cerrada y sin pendientes)                         → RELLENO verde con un check
 * `isToday` agranda + halo (resalta la actual, sin cambiar el estado).
 *
 * NO LLEVA NÚMERO (Director, 2026-09-14). Llevaba el conteo cronológico de todas las visitas del
 * paciente, sueltas incluidas: la V6 salía con un "11" adentro y el ojo lo lee como "visita 11 del
 * protocolo", que no existe. Cuál visita es lo dice el rótulo que va SIEMPRE al lado —abajo en la
 * línea de tiempo, a la derecha en el cronograma—, así que el número sólo podía repetirlo o
 * contradecirlo. Se eligió esto por sobre poner el número de protocolo porque ese número habría que
 * sacarlo de `visit_code`, que es texto libre por protocolo ("EOT", "FU1", "D1" no tienen número).
 *
 * La marca de adentro no es decorado: antes el estado se distinguía SÓLO por color (gris / contorno
 * / relleno del mismo verde), y el check y el punto son la segunda señal que pide WCAG 1.4.1.
 */
export function VisitDot({ visit, today, size = 28, isToday = false, accent }: {
  visit: TrackVisitRow
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
  const estado = visitStateLabel(visit, today)

  const background = filled ? color : agendada ? 'var(--spira-surface)' : 'var(--spira-white)'
  const border = filled ? 'none' : agendada ? '1.5px solid var(--spira-line-2)' : `2px solid ${color}`

  return (
    <span
      role="img"
      aria-label={estado}
      title={estado}
      style={{
        width: sz, height: sz, flex: '0 0 auto', borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        background, border,
        boxShadow: isToday ? `0 0 0 4px ${color}1F` : 'none',
      }}
    >
      {filled && <Icon name="check" size={Math.round(sz * 0.5)} stroke={3} color="var(--spira-on-accent)" />}
      {dv === 'en_curso' && <span style={{ width: Math.round(sz * 0.3), height: Math.round(sz * 0.3), borderRadius: '50%', background: color }} />}
    </span>
  )
}
