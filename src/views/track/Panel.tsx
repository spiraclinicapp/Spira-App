import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/**
 * Card con título e ícono, para las secciones del detalle de visita y del popup de atención médica.
 *
 * `aside` es el hueco a la derecha del rótulo, para el dato que RESUME la sección (el "1/1
 * realizados" de Procedimientos). Va acá y no en el cuerpo: puesto abajo abría una línea propia y
 * empujaba el contenido, que es exactamente el desfasaje que reportó el Director (2026-08-09).
 */
export function Panel({ title, icon, accent, aside, children }: {
  title: string
  icon: IconName
  accent: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-surface)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={15} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14 }}>{title}</span>
        {aside && <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>{aside}</span>}
      </div>
      {children}
    </div>
  )
}
