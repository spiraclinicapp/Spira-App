import { useEffect, useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../components/FormField'
import { useDrugs } from '../../data/pharma'

interface Props {
  accent: string
  onPick: (drugId: string, drugName: string) => void
  placeholder?: string
}

/**
 * Typeahead sobre el catálogo de drogas (principio activo). Espeja MedicationPicker pero sobre
 * `drugs`: usado para etiquetar la droga de un kit de etiqueta abierta. Sin texto libre de destino:
 * solo elige de la lista. Enter elige el primero; Escape / click-afuera cierran.
 */
export function DrugPicker({ accent, onPick, placeholder }: Props) {
  const drugs = useDrugs()
  const all = drugs.data ?? []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cerrar el desplegable al clickear afuera (Escape también cierra).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return all.slice(0, 8)
    return all.filter((d) => d.name.toLowerCase().includes(t)).slice(0, 8)
  }, [q, all])

  const pick = (id: string, name: string) => {
    onPick(id, name)
    setQ('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className="spira-search-input"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0].id, matches[0].name) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder ?? 'Buscar droga (principio activo)…'}
        aria-label="Buscar droga por nombre"
        style={fieldInput}
      />
      {open && matches.length > 0 && (
        <ul role="listbox" style={listBox}>
          {matches.map((d, idx) => (
            <li key={d.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(d.id, d.name) }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={itemBtn(hoveredIdx === idx ? accent : null)}
              >
                <span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{d.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const listBox: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 20,
  listStyle: 'none',
  margin: 0,
  padding: 4,
  background: 'var(--spira-white)',
  border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-md)',
  boxShadow: 'var(--spira-shadow-md)',
  maxHeight: 280,
  overflow: 'auto',
}

const itemBtn = (accent: string | null): React.CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  border: 'none',
  /* Transparente en reposo; cuando `accent` no es null el ítem está bajo el cursor
     y se pinta con el color del módulo al 10% de opacidad (sufijo hex `1a`). */
  background: accent ? `${accent}1a` : 'transparent',
  padding: '10px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  minHeight: 44,
})
