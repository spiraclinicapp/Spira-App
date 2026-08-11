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
export function Panel({ title, icon, accent, aside, highlight = false, deepAccent, tint, children }: {
  title: string
  icon: IconName
  accent: string
  aside?: ReactNode
  /**
   * Realce de la tarjeta (pedido del Director Médico para Dispensación, 2026-08-09): carta teñida.
   * NO es un borde de acento — eso está prohibido en este sistema.
   *
   * El tinte subió de 6% a 14% el 2026-08-11: **"agregale color a la dispensación"** (Director). Al
   * 6% la tarjeta se leía igual que las neutras de al lado y el realce no cumplía ningún trabajo —
   * teñir por debajo del umbral en el que se nota es lo mismo que no teñir. Al 14% la sección se
   * distingue de un vistazo y las cajas blancas de adentro (renglones, dropzone) ganan profundidad
   * en vez de perderla.
   */
  highlight?: boolean
  /** Acento PROFUNDO para el título sobre el tinte (ver tokens). Obligatorio si `highlight`. */
  deepAccent?: string
  /**
   * Tinte de la carta y del cuadro del ícono, como par de tokens con **un valor por tema**.
   * Obligatorio si `highlight`, por el mismo motivo que `deepAccent`: derivarlo del acento con un
   * alfa (`${accent}24`) funciona en claro y se da vuelta en oscuro, donde teñir con el petróleo
   * deja la tarjeta MÁS APAGADA que las neutras de al lado.
   */
  tint?: { bg: string; chip: string }
  children: ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--spira-line)', borderRadius: 14, padding: '14px 16px',
      background: highlight ? (tint?.bg ?? `${accent}24`) : 'var(--spira-surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {highlight ? (
          <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: 8, background: tint?.chip ?? `${accent}38`, display: 'grid', placeItems: 'center', marginLeft: -2 }}>
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
