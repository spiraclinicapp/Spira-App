import type { ProcedimientoElegible } from './retomar'

/**
 * Una lista de casillas de procedimientos, sin preselección propia: quien la usa decide qué viene
 * tildado. La comparten el aviso al finalizar, «Dejar para otro día», «Continuar pendientes» y el
 * retest (v0145) — cuatro modales que eligen procedimientos igual y tienen que verse igual.
 */
export function CasillasDeProcedimientos({ items, elegidos, onChange, accent }: {
  items: readonly ProcedimientoElegible[]
  elegidos: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  accent: string
}) {
  const alternar = (id: string) => {
    const next = new Set(elegidos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((p) => (
        <label key={p.procedure_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: 'pointer' }}>
          <input type="checkbox" checked={elegidos.has(p.procedure_id)} onChange={() => alternar(p.procedure_id)} style={{ accentColor: accent }} />
          {p.name}
        </label>
      ))}
    </div>
  )
}
