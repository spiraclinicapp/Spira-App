import type { CSSProperties } from 'react'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { COLUMN_META, COLUMN_ORDER } from './estados'
import { KanbanCard } from './KanbanCard'

/**
 * Las cuatro columnas. Cada una scrollea sola; la página no scrollea (alto fijo).
 *
 * Ancho: `minmax(240px, 1fr)`. Por debajo de 240px la card se vuelve ilegible (los nombres de
 * medicamento ya ocupan tres líneas a 1280px), así que el tablero prefiere scrollear en horizontal
 * antes que comprimir. Una card apretada es peor que un scroll.
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

/** Esqueleto de carga: mantiene la forma del tablero para que no salte al llegar los datos. */
export function KanbanSkeleton() {
  return (
    <div style={board} aria-hidden="true">
      {COLUMN_ORDER.map((key) => (
        <section key={key} style={col}>
          <header style={colHead}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLUMN_META[key].color }} />
            <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)' }}>
              {COLUMN_META[key].label}
            </span>
          </header>
          <div style={colBody}>
            {[0, 1].map((i) => (
              <div key={i} style={{ height: i === 0 ? 132 : 108, borderRadius: 12, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', opacity: 0.55 }} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const board: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))',
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
