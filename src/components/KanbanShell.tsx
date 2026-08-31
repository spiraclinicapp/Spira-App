import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/** Una columna del tablero: su clave, su rótulo y el color de su punto. */
export interface KanbanColumn<K extends string> {
  key: K
  label: string
  color: string
}

/**
 * El armazón de un tablero kanban: la grilla de columnas, el encabezado con punto y contador, el
 * scroll de cada columna y el vacío explicado. Lo comparten el tablero de Dispensaciones (Farmacia)
 * y el de Reportes pendientes (Coordinación).
 *
 * Lo que NO comparte es la TARJETA, y es a propósito: la de Farmacia habla de medicamentos y
 * unidades, la de Coordinación de pacientes y plataformas. Cada módulo dibuja la suya con
 * `renderCard`. Acá vive sólo el armado, que no lleva significado clínico adentro — que es
 * justamente lo que hace seguro compartirlo.
 *
 * ANCHO DE COLUMNA. El `minmax(220px, 1fr)` no es arbitrario y viene medido del tablero de
 * Farmacia: en un viewport de 1280 con el riel y el panel de submódulos abiertos quedan 956px
 * útiles, y cuatro columnas de 240 más tres gaps de 12 piden 996 — el tablero scrolleaba en
 * horizontal en la resolución más común de laptop. Con 220 de piso entran holgadas y el `1fr` las
 * estira a lo que haya. Por debajo de 220 la tarjeta se vuelve ilegible, y ahí el tablero prefiere
 * scrollear antes que comprimir: una tarjeta apretada es peor que un scroll.
 */
export function KanbanShell<K extends string, T>({
  columns, rows, renderCard, empty, onDropInColumn, accent,
}: {
  columns: readonly KanbanColumn<K>[]
  /** Las filas ya repartidas por columna. */
  rows: Record<K, T[]> | Map<K, T[]>
  renderCard: (item: T, column: K, index: number) => ReactNode
  /** Qué dice una columna vacía. Nunca se deja en blanco: el vacío se explica. */
  empty: string
  /**
   * Habilita soltar tarjetas en una columna. Opcional: el tablero de Farmacia no arrastra —
   * avanza por botón— y sin esta prop no se entera de que la posibilidad existe.
   *
   * El arrastre es SIEMPRE una comodidad encima, nunca el único camino: el nativo del navegador
   * no funciona con teclado ni con el dedo, así que la acción tiene que existir también en un
   * botón de la tarjeta (WCAG 2.1 AA).
   */
  onDropInColumn?: (column: K, e: React.DragEvent) => void
  /** Acento del módulo, para resaltar la columna sobre la que se está por soltar. */
  accent?: string
}) {
  /** Sobre qué columna está el puntero durante un arrastre. Vive acá para que el consumidor no
   *  tenga que llevar estado de presentación que es puro armazón. */
  const [encima, setEncima] = useState<K | null>(null)
  const get = (k: K): T[] => (rows instanceof Map ? rows.get(k) ?? [] : rows[k] ?? [])

  return (
    <div style={{ ...board, gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
      {columns.map((c) => {
        const items = get(c.key)
        const activa = encima === c.key && !!onDropInColumn
        return (
          <section
            key={c.key}
            aria-label={`${c.label}, ${items.length}`}
            style={{
              ...col,
              ...(activa
                ? { borderColor: accent ?? 'var(--spira-primary)', background: 'rgba(46,125,116,.06)' }
                : null),
            }}
            onDragOver={onDropInColumn ? (e) => { e.preventDefault(); setEncima(c.key) } : undefined}
            onDragLeave={onDropInColumn ? () => setEncima((k) => (k === c.key ? null : k)) : undefined}
            /* El evento viaja al consumidor: lo que se arrastró se lee de `dataTransfer` en el
               drop, que es donde el navegador garantiza que el dato está disponible. Guardarlo
               en un estado propio mientras se arrastra sería llevar en React algo que el
               navegador ya lleva, y re-renderizar el tablero decenas de veces por segundo. */
            onDrop={onDropInColumn ? (e) => { e.preventDefault(); setEncima(null); onDropInColumn(c.key, e) } : undefined}
          >
            <header style={colHead}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flex: '0 0 auto' }} />
              <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700, color: 'var(--spira-ink)' }}>
                {c.label}
              </span>
              <span className="spira-mono" style={count}>{items.length}</span>
            </header>

            <div style={colBody}>
              {items.length === 0
                ? <div style={vacio}>{empty}</div>
                : items.map((it, i) => renderCard(it, c.key, i))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const board: CSSProperties = {
  display: 'grid',
  gap: 12,
  flex: 1,
  minHeight: 0,
  overflowX: 'auto',
}

const col: CSSProperties = {
  display: 'flex', flexDirection: 'column', minHeight: 0,
  background: 'var(--spira-white)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  borderRadius: 14,
  transition: 'border-color .14s var(--spira-ease-out), background-color .14s var(--spira-ease-out)',
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

const vacio: CSSProperties = {
  textAlign: 'center', fontSize: 12.5, color: 'var(--spira-muted)', padding: '22px 8px',
}
