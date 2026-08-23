import { KanbanShell } from '../../../components/KanbanShell'
import type { BoardColumn, DispensationRequestRow } from '../../../data/pharma'
import { COLUMN_META, COLUMN_ORDER } from './estados'
import { KanbanCard } from './KanbanCard'

/**
 * Las cuatro columnas del tablero de Dispensaciones.
 *
 * El armado (grilla, encabezado con punto y contador, scroll por columna, vacío explicado) se mudó
 * a `components/KanbanShell` cuando Coordinación estrenó su propio tablero de reportes: son el
 * mismo armazón y dejarlos duplicados garantizaba que se separaran visualmente en el primer ajuste
 * que se le hiciera a uno solo. Lo que NO se comparte es la tarjeta: la de acá habla de
 * medicamentos y unidades.
 *
 * Este tablero NO arrastra —avanza por el CTA de la tarjeta—, así que no le pasa `onDropInColumn`
 * y el armazón ni se entera de que soltar es posible.
 */
export function KanbanBoard({ rows, busyId, canOperate, onOpen, onAdvance }: {
  rows: Map<BoardColumn, DispensationRequestRow[]>
  busyId: string | null
  canOperate: boolean
  onOpen: (r: DispensationRequestRow) => void
  onAdvance: (r: DispensationRequestRow, column: BoardColumn) => void
}) {
  return (
    <KanbanShell
      columns={COLUMN_ORDER.map((k) => ({ key: k, label: COLUMN_META[k].label, color: COLUMN_META[k].color }))}
      rows={rows}
      empty="Sin dispensaciones"
      renderCard={(r, column) => (
        <KanbanCard
          key={r.id}
          r={r}
          column={column}
          canOperate={canOperate}
          busy={busyId === r.id}
          onOpen={() => onOpen(r)}
          onAdvance={() => onAdvance(r, column)}
        />
      )}
    />
  )
}
