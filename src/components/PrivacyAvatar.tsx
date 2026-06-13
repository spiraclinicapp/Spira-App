import type { CSSProperties } from 'react'

/**
 * Iniciales del nombre para el avatar de privacidad: 1 palabra → 2 primeras letras;
 * 2+ palabras → primera de la primera + primera de la última.
 */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface PrivacyAvatarProps {
  /** Nombre completo: NO se muestra como texto, solo en el tooltip (privacidad clínica). */
  fullName: string
  /** Diámetro en px. Default 34. */
  size?: number
  /** Color base del círculo (hex). Default acento Track. El fondo es color + '18'. */
  color?: string
}

/**
 * Avatar de privacidad: muestra solo las iniciales; el nombre real aparece como
 * tooltip nativo al hover (`title`). Patrón consistente en toda la app — el código
 * del paciente es el identificador primario, el nombre queda oculto.
 */
export function PrivacyAvatar({ fullName, size = 34, color = '#2E7D74' }: PrivacyAvatarProps) {
  const style: CSSProperties = {
    width: size, height: size, flex: '0 0 auto', borderRadius: '50%',
    background: color + '18', color,
    display: 'grid', placeItems: 'center',
    fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: Math.round(size * 0.36),
    cursor: 'help', userSelect: 'none',
  }
  return (
    <span style={style} title={fullName} aria-label={fullName}>
      {initials(fullName)}
    </span>
  )
}
