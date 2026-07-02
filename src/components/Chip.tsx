import type { CSSProperties } from 'react'

interface ChipProps {
  label: string
  selected: boolean
  onClick: () => void
  /** Acento sólido del módulo (hex): tiñe fondo/texto/borde del chip seleccionado.
      Los sufijos hex '24'/'59' son ~14%/35% de alfa — los valores del handoff. */
  accent: string
  /** true = chip independiente que se prende/apaga (aria-pressed); false/omitido = opción
      excluyente de un grupo (role=radio + aria-checked; el caller pone role=radiogroup). */
  toggle?: boolean
}

/**
 * Chip de filtro del handoff de Recepción (píldora clickeable, alto 34).
 * La semántica ARIA depende del uso: excluyente dentro de un radiogroup (tipo de
 * recepción, filtros de stock) o toggle suelto (rango 7/30 días) — un radio no se
 * destilda clickeándolo, así que el toggle NO puede ser role=radio.
 */
export function Chip({ label, selected, onClick, accent, toggle }: ChipProps) {
  const aria = toggle
    ? { 'aria-pressed': selected }
    : { role: 'radio' as const, 'aria-checked': selected }
  return (
    <button
      type="button"
      {...aria}
      onClick={onClick}
      style={{
        ...chip,
        ...(selected
          ? { background: accent + '24', color: accent, border: `1px solid ${accent}59` }
          : { background: 'var(--spira-white)', color: 'var(--spira-muted)', border: '1px solid var(--spira-line-2)' }),
      }}
    >
      {label}
    </button>
  )
}

const chip: CSSProperties = {
  height: 34, display: 'inline-flex', alignItems: 'center', padding: '0 14px',
  borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', whiteSpace: 'nowrap',
}
