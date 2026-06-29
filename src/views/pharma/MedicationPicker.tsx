import { useMemo, useRef, useState } from 'react'
import { fieldInput } from '../../components/FormField'
import { useMedications } from '../../data/pharma'

interface Props { onPick: (medicationId: string) => void; accent: string }

/**
 * Typeahead sobre el catálogo global de medicamentos.
 * Filtra por nombre de medicamento o principio activo (droga), muestra hasta 8 resultados.
 * Al elegir limpia el input y llama `onPick(id)`. Teclado: Enter elige el primer match,
 * Escape cierra la lista. El parámetro `accent` colorea el fondo hover de cada ítem para que
 * el picker se integre visualmente con el contexto del módulo que lo invoca.
 */
export function MedicationPicker({ onPick, accent }: Props) {
  const meds = useMedications()
  const all = meds.data ?? []
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return all.slice(0, 8)
    return all
      .filter(
        (m) =>
          m.name.toLowerCase().includes(t) ||
          (m.drug?.name?.toLowerCase().includes(t) ?? false),
      )
      .slice(0, 8)
  }, [q, all])

  const pick = (id: string) => {
    onPick(id)
    setQ('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0].id) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Buscar medicamento por nombre o droga…"
        aria-label="Buscar medicamento para agregar a mano"
        style={fieldInput}
      />
      {open && matches.length > 0 && (
        <ul role="listbox" style={listBox}>
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(m.id) }}
                style={itemBtn(accent)}
                /* El hover se aplica vía la clase global spira-picker-item */
                className="spira-picker-item"
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
      {/* Estilos de hover referenciando `accent` como color de fondo al pasar el mouse.
          El <style> es scoped a esta instancia gracias a la clase dinámica generada por
          el atributo `data-accent`. Si el mismo componente se monta dos veces con colores
          distintos cada uno tiene su propio bloque de reglas. */}
      <style>{`
        .spira-picker-item:hover {
          background: ${accent}1a;
        }
      `}</style>
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

const itemBtn = (accent: string): React.CSSProperties => ({
  width: '100%',
  textAlign: 'left',
  border: 'none',
  /* Transparente en reposo; el hover lo maneja la regla CSS dinámica en el <style> de arriba,
     que aplica el `accent` con 10% de opacidad (sufijo hex `1a`). */
  background: 'transparent',
  padding: '10px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  minHeight: 44,
  /* La propiedad custom expone el accent al DOM para posibles extensiones futuras. */
  ['--picker-accent' as string]: accent,
})
