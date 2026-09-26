import { useMemo } from 'react'
import { useEstudioProcedimientos } from '../../data/protocolProcedures'

/**
 * Casillas con los procedimientos DEL ESTUDIO, agrupados por categoría. Es una lista cerrada, sin
 * texto libre (regla del Director: valores preestablecidos contra errores de tipeo). Sólo los del
 * estudio, porque de `protocol_procedures` cuelgan los reportes: uno del catálogo global no traería
 * ninguno, y el servidor lo rechaza igual.
 *
 * `bloqueados` = no se pueden destildar (ya están marcados como realizados en la visita).
 */
export function SelectorProcedimientos({ protocolId, value, onChange, bloqueados, accent }: {
  protocolId: string
  value: readonly string[]
  onChange: (ids: string[]) => void
  bloqueados?: ReadonlySet<string>
  accent: string
}) {
  const q = useEstudioProcedimientos(protocolId)
  const grupos = useMemo(() => {
    const porCategoria = new Map<string, { procedure_id: string; name: string }[]>()
    for (const p of q.data ?? []) {
      const categoria = p.category?.trim() || 'Otros'
      const lista = porCategoria.get(categoria) ?? []
      lista.push({ procedure_id: p.procedure_id, name: p.name })
      porCategoria.set(categoria, lista)
    }
    return [...porCategoria.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([categoria, procs]) => ({ categoria, procs: procs.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  }, [q.data])

  const elegidos = new Set(value)
  const alternar = (id: string) => {
    if (bloqueados?.has(id)) return
    const next = new Set(elegidos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  const aviso = { fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45, padding: '2px 0' } as const
  if (q.error) return <div style={{ ...aviso, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos: {q.error}</div>
  if (q.loading && !q.data) return <div style={aviso}>Cargando procedimientos del estudio…</div>
  if (grupos.length === 0) {
    return <div style={aviso}>Este estudio todavía no tiene procedimientos cargados. Se cargan en «Procedimientos» del protocolo.</div>
  }

  return (
    <div style={{ maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grupos.map(({ categoria, procs }) => (
        <div key={categoria}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--spira-muted)', marginBottom: 4 }}>
            {categoria}
          </div>
          {procs.map((p) => {
            const bloqueado = bloqueados?.has(p.procedure_id) ?? false
            return (
              <label
                key={p.procedure_id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13.5, color: 'var(--spira-ink)', cursor: bloqueado ? 'default' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={elegidos.has(p.procedure_id)}
                  disabled={bloqueado}
                  onChange={() => alternar(p.procedure_id)}
                  style={{ accentColor: accent }}
                />
                {p.name}
                {bloqueado && <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>· realizado</span>}
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}
