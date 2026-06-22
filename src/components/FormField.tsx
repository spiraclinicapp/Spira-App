import type { CSSProperties, ReactNode } from 'react'

/** Estilo base de input/select de formulario, alineado con Login (alto 44, radio 10, borde line-2). */
export const fieldInput: CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
}

/** Estilo del texto de label de formulario (sentence case, muted). Exportado para reusarlo en
    filas de label custom (p. ej. el login, donde el label comparte renglón con "olvidé clave"). */
export const fieldLabelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }

interface FormFieldProps {
  label: string
  children: ReactNode
}

/** Label en columna (sentence case, color muted) + el control que se le pase. */
export function FormField({ label, children }: FormFieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}
