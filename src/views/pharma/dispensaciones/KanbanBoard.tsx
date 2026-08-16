import type { CSSProperties } from 'react'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { COLUMN_META, COLUMN_ORDER } from './estados'
import { KanbanCard } from './KanbanCard'

/**
 * Las cuatro columnas. Cada una scrollea sola; la página no scrollea (alto fijo).
 *
 * Ancho: `minmax(220px, 1fr)`. El 220 no es arbitrario: en un viewport de 1280 con el riel y el
 * panel de submódulos abiertos quedan 956px útiles, y cuatro columnas de 240 + 3 gaps de 12 piden
 * 996 — el tablero scrolleaba en horizontal en la resolución más común de laptop. Con 220 de piso
 * entran holgadas (916) y el `1fr` las estira a 230 reales.
 *
 * Por debajo de 220 la card sí se vuelve ilegible, y ahí el tablero prefiere scrollear antes que
 * comprimir: una card apretada es peor que un scroll.
 */
export function KanbanBoard({ rows, busyId, canOperate, onOpen, onAdvance }: {
  rows: Map<BoardColumn, DispensationRequestRow[]>
  busyId: string | null
  canOperate: boolean
  onOpen: (r: DispensationRequestRow) => void
  onAdvance: (r: DispensationRequestRow, column: BoardColumn) => void
}) {
  return (
    <div style={board}>
      {COLUMN_ORDER.map((key) => {
        const meta = COLUMN_META[key]
        const items = rows.get(key) ?? []
        return (
          <section key={key} style={col} aria-label={`${meta.label}, ${items.length}`}>
            <header style={colHead}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flex: '0 0 auto' }} />
              <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)' }}>
                {meta.label}
              </span>
              <span className="spira-mono" style={count}>{items.length}</span>
            </header>

            <div style={colBody}>
              {items.length === 0 ? (
                <div style={empty}>Sin dispensaciones</div>
              ) : (
                items.map((r) => (
                  <KanbanCard
                    key={r.id}
                    r={r}
                    column={key}
                    canOperate={canOperate}
                    busy={busyId === r.id}
                    onOpen={() => onOpen(r)}
                    onAdvance={() => onAdvance(r, key)}
                  />
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const board: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))',
  gap: 12,
  flex: 1,
  minHeight: 0,
  overflowX: 'auto',
}

const col: CSSProperties = {
  display: 'flex', flexDirection: 'column', minHeight: 0,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14,
}

const colHead: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px 11px', flex: '0 0 auto',
}

const count: CSSProperties = {
  marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', borderRadius: 999, padding: '2px 9px', minWidth: 24, textAlign: 'center',
}

const colBody: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, padding: 11, overflowY: 'auto', flex: 1,
  background: 'var(--spira-surface)', borderRadius: '0 0 13px 13px',
}

const empty: CSSProperties = {
  textAlign: 'center', fontSize: 12.5, color: 'var(--spira-faint)', padding: '22px 8px',
}
