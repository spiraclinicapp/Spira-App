import type { CSSProperties } from 'react'

interface ChipProps {
  label: string
  selected: boolean
  onClick: () => void
  /** Acento sólido del módulo (hex): tiñe fondo/texto/borde del chip seleccionado. Se aclara según
      el tema antes de usarse (ver `tono` abajo); en claro queda tal cual. */
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
  /**
   * EL ACENTO, ACLARADO SEGÚN EL TEMA. El chip elegido pintaba su texto con el acento crudo, y en
   * tema oscuro eso es un pozo: el petróleo #0F5F57 sobre la superficie #212121 daba 1,98:1 —menos
   * de la mitad del 4,5 que pide AA para 13px/600—, o sea el estado "elegido" era el ilegible.
   *
   * No se arregla con un token por color porque el acento llega como HEX CRUDO desde el registro de
   * módulos (#0F5F57 Farmacia y Coordinación, #5C8A5A Lab, #3A6B8C Contable): hay que operar sobre
   * lo que venga. `--spira-aclarado-acento` vale 0% en claro —el acento queda intacto, ni un pixel
   * cambia— y 55% en oscuro, que es la regla que los `--spira-acc-deep-*` ya escriben a mano.
   *
   * Los porcentajes 14/35 son los mismos sufijos hex '24'/'59' del handoff, ahora calculados sobre
   * el tono ya corregido para que el tinte y el borde acompañen al texto en vez de quedarse atrás.
   */
  const tono = `color-mix(in oklab, ${accent}, white var(--spira-aclarado-acento))`
  return (
    <button
      type="button"
      {...aria}
      onClick={onClick}
      style={{
        ...chip,
        ...(selected
          ? {
              background: `color-mix(in srgb, ${tono} 14%, transparent)`,
              color: tono,
              border: `1px solid color-mix(in srgb, ${tono} 35%, transparent)`,
            }
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
