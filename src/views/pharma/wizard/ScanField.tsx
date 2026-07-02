import type { KeyboardEvent, RefObject } from 'react'
import { Icon } from '../../../components/Icon'

interface Props {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  accentSolid: string
  inputRef: RefObject<HTMLInputElement | null>
}

/**
 * Buscador central de escaneo (lenguaje 2a del handoff), compartido por la rama base y la IP.
 * El borde ámbar va SIEMPRE visible (no es un estado de foco): es la affordance de la acción
 * primaria del paso, que además vive autofocuseada. `0x1f` ≈ 12% de alfa para el halo.
 * Enter y el botón "Buscar" disparan el mismo onSubmit.
 */
export function ScanField({ label, placeholder, value, onChange, onSubmit, accentSolid, inputRef }: Props) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit() } }
  return (
    <div>
      <div className="spira-eyebrow" style={{ marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            autoFocus
            className="spira-mono"
            placeholder={placeholder}
            style={{
              width: '100%', height: 50, padding: '0 48px 0 16px', borderRadius: 12,
              background: 'var(--spira-white)', border: `2px solid ${accentSolid}`,
              boxShadow: `0 0 0 3px ${accentSolid}1f`, color: 'var(--spira-ink)', fontSize: 15,
            }}
          />
          <span style={{ position: 'absolute', right: 15, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <Icon name="barcodeSearch" size={22} color={accentSolid} stroke={1.7} />
          </span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          style={{
            height: 50, padding: '0 22px', border: 'none', borderRadius: 12, background: accentSolid,
            color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14.5, cursor: 'pointer',
          }}
        >
          Buscar
        </button>
      </div>
    </div>
  )
}
