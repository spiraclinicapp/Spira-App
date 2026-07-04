import { useEffect, useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../components/FormField'
import { useMedications } from '../../data/pharma'

interface Props { onPick: (medicationId: string) => void; accent: string; autoFocus?: boolean }

/**
 * Typeahead sobre el catálogo global de medicamentos, para la recepción.
 * El desplegable se abre recién al escribir (sin texto no muestra nada, para no listar medicamentos
 * al azar) y filtra por nombre o principio activo (droga) sobre TODO el catálogo.
 * Al elegir limpia el input y llama `onPick(id)`. Teclado: Enter elige el primer match,
 * Escape cierra la lista. El parámetro `accent` colorea el fondo hover de cada ítem para que
 * el picker se integre visualmente con el contexto del módulo que lo invoca.
 */
export function MedicationPicker({ onPick, accent, autoFocus }: Props) {
  const meds = useMedications()
  const all = meds.data ?? []
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

  const query = q.trim()
  const matches = useMemo(() => {
    const t = query.toLowerCase()
    if (!t) return []
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(t) ||
        (m.drug?.name?.toLowerCase().includes(t) ?? false),
    )
  }, [query, all])

  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className="spira-search-input"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0].id) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Buscar medicamento por nombre o droga…"
        aria-label="Buscar medicamento para agregar a mano"
        style={fieldInput}
      />
      {open && query === '' && (
        <div style={hintBox}>Escribí el nombre o la droga para buscar en el catálogo.</div>
      )}
      {open && query !== '' && matches.length === 0 && (
        <div style={hintBox}>Sin resultados para «{query}».</div>
      )}
      {open && matches.length > 0 && (
        <ul role="listbox" style={listBox}>
          {matches.map((m, idx) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(m.id) }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={itemBtn(hoveredIdx === idx ? accent : null)}
              >
                <span style={{ fontWeight: 600, color: 'var(--spira-ink)' }}>{m.name}</span>
                {m.drug && (
                  <span style={{ color: 'var(--spira-muted)' }}> · {m.drug.name}</span>
                )}
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

const hintBox: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 20,
  background: 'var(--spira-white)',
  border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-md)',
  boxShadow: 'var(--spira-shadow-md)',
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--spira-muted)',
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
