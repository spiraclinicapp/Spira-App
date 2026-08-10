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
export function Panel({ title, icon, accent, aside, highlight = false, deepAccent, children }: {
  title: string
  icon: IconName
  accent: string
  aside?: ReactNode
  /**
   * Realce de la tarjeta (pedido del Director Médico para Dispensación, 2026-08-09): carta teñida.
   * NO es un borde de acento — eso está prohibido en este sistema. Se apaga cuando la sección no
   * tiene nada que hacer: una tarjeta sin trabajo no debería llamar la atención.
   */
  highlight?: boolean
  /** Acento PROFUNDO para el título sobre el tinte (ver tokens). Obligatorio si `highlight`. */
  deepAccent?: string
  children: ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--spira-line)', borderRadius: 14, padding: '14px 16px',
      background: highlight ? `${accent}0F` : 'var(--spira-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {highlight ? (
          <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: 8, background: `${accent}21`, display: 'grid', placeItems: 'center', marginLeft: -2 }}>
            <Icon name={icon} size={15} color={accent} />
          </span>
        ) : (
          <Icon name={icon} size={15} color={accent} />
        )}
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: highlight ? deepAccent : undefined }}>{title}</span>
        {aside && <span style={{ marginLeft: 'auto', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>{aside}</span>}
      </div>
      {children}
    </div>
  )
}
