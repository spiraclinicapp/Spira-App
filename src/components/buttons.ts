import type { CSSProperties } from 'react'

/** Botón secundario (contorno cálido, fondo blanco). Reutilizable entre vistas y formularios. */
export const btnOutline: CSSProperties = {
  height: 40, padding: '0 16px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 14, cursor: 'pointer',
}

/** Botón primario con el relleno sólido del módulo (texto papel sobre acento). */
export function btnPrimary(accentSolid: string): CSSProperties {
  return {
    height: 40, padding: '0 16px', border: 'none', borderRadius: 10, background: accentSolid,
    color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
    cursor: 'pointer',
  }
}
