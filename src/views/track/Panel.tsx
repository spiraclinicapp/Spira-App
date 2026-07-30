import type { ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'

/** Card con título e ícono, para las secciones del detalle de visita y del popup de atención médica. */
export function Panel({ title, icon, accent, children }: { title: string; icon: IconName; accent: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-surface)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon name={icon} size={15} color={accent} />
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
