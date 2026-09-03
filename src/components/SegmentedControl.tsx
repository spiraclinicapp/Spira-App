import type { CSSProperties } from 'react'

interface Option<T extends string> { value: T; label: string; disabled?: boolean; badge?: string }
interface Props<T extends string> {
  options: Option<T>[]
  value: T | ''
  onChange: (v: T) => void
  /** Nombre accesible del grupo (ARIA lo exige en un `role="radiogroup"`: sin él el lector anuncia
   *  "grupo" y nada más). Opcional para no romper un consumidor que ya traiga su propio rótulo
   *  visible al lado. */
  label?: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={o.disabled || undefined}
            disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={o.disabled ? 'spira-no-press' : undefined}
            /* El seleccionado se marca con ELEVACIÓN, NUNCA con un borde ni un fondo de color (regla
               dura del proyecto): fondo sólido + sombra, como se levanta cualquier estado "activo"
               en la casa. El no seleccionado queda al ras de la página (fondo transparente, borde
               visible) — así el elegido se lee arriba del resto en los dos temas, sin depender de
               una tinta que en oscuro se invierte (`--spira-white` es más OSCURO que `--spira-paper`
               ahí, así que un teñido semitransparente del seleccionado componía más oscuro que el no
               seleccionado). Pero la elevación SOLA deja fondo-contra-fondo en ~1,1:1 (muy por debajo
               del 3:1 de WCAG 1.4.11: la sombra sostiene poco en oscuro) — así que la señal se
               completa con JERARQUÍA DE TINTA, no con acento: seleccionado en `--spira-ink` (tinta
               fuerte), no seleccionado en `--spira-muted` (gris de texto). Es tipografía, no
               señalización cromática de estado — la regla de la casa reserva el color para
               significado clínico, no para "el mouse está acá", y esto no toca el acento ni depende
               de distinguir colores. Los dos siguen cumpliendo AA 4,5:1 contra su propio fondo (`ink`
               sobre `white` elevado, `muted` sobre `paper` de página) en los dos temas — medido, no
               estimado (claro 14,1:1 y 4,6:1; oscuro 13,8:1 y 7,3:1). `borderColor` va en
               LONGHAND junto a `borderWidth`/`borderStyle` y nunca mezclado con la abreviada `border`
               (gotcha de la casa: React vacía los longhand en el render siguiente y el borde se
               rompe). */
            style={{
              minHeight: 44, padding: '10px 16px', borderRadius: 'var(--spira-radius-md)',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: selected ? 'transparent' : 'var(--spira-line-2)',
              background: selected ? 'var(--spira-white)' : 'transparent',
              boxShadow: selected ? 'var(--spira-shadow-md)' : 'none',
              color: o.disabled ? 'var(--spira-faint)' : selected ? 'var(--spira-ink)' : 'var(--spira-muted)',
              fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
              cursor: o.disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {o.label}
            {o.badge && <span style={badge}>{o.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
const badge: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-muted)', border: '1px solid var(--spira-line-2)', borderRadius: 999, padding: '1px 7px' }
