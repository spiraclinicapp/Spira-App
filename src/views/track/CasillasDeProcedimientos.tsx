import type { CSSProperties } from 'react'
import type { ProcedimientoElegible } from './retomar'

/**
 * Una lista de casillas de procedimientos, sin preselección propia: quien la usa decide qué viene
 * tildado. La comparten el aviso al finalizar, «Dejar para otro día», «Continuar pendientes», el
 * retest (v0145) y «Pedir retest» del botón de etapa — cinco modales que eligen procedimientos igual.
 *
 * `variante="lista"` es la del popup «Pedir retest» (handoff `design_handoff_boton_etapa` §3): filas con
 * borde y casillas de 18 px. Vive acá y no en una copia, para que el día que los otros cuatro adopten
 * ese aspecto sea cambiarles una prop.
 */
export function CasillasDeProcedimientos({ items, elegidos, onChange, accent, variante = 'simple' }: {
  items: readonly ProcedimientoElegible[]
  elegidos: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  accent: string
  variante?: 'simple' | 'lista'
}) {
  const alternar = (id: string) => {
    const next = new Set(elegidos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  const lista = variante === 'lista'
  return (
    <div style={lista ? cajaLista : { display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((p, i) => (
        <label
          key={p.procedure_id}
          className={lista ? 'spira-casilla-fila' : undefined}
          style={lista ? { ...filaLista, borderTop: i === 0 ? 'none' : '1px solid var(--spira-line)' } : filaSimple}
        >
          <input
            type="checkbox"
            checked={elegidos.has(p.procedure_id)}
            onChange={() => alternar(p.procedure_id)}
            style={lista ? { width: 18, height: 18, margin: 0, flex: '0 0 auto', accentColor: accent } : { accentColor: accent }}
          />
          {p.name}
        </label>
      ))}
    </div>
  )
}

const filaSimple: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: 'pointer',
}
const cajaLista: CSSProperties = {
  display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
}
const filaLista: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', fontSize: 13.5, fontWeight: 600,
  color: 'var(--spira-ink)', cursor: 'pointer',
}
