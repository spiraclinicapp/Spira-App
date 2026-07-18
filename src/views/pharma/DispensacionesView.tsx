import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { FilterDropdown } from '../../components/FilterDropdown'
import { DateNavButton } from '../../components/DateNavButton'
import { Icon } from '../../components/Icon'
import { Toast } from '../../components/Toast'
import {
  useDispensationBoard,
  columnOf,
  startDispensationPreparation,
  markDispensationReady,
  deliverDispensation,
  activeDispensation,
} from '../../data/pharma'
import type { BoardColumn, DispensationRequestRow } from '../../data/pharma'
import { KanbanBoard, KanbanSkeleton } from './dispensaciones/KanbanBoard'
import { DispensacionDrawer } from './dispensaciones/DispensacionDrawer'
import { useAuth } from '../../lib/auth'
import { todayISO } from '../../lib/dates'
import type { ViewProps } from '../types'

const ALL = 'all'

/**
 * Tablero de dispensación de Pharma. Cuatro columnas por estado y un cajón lateral que resuelve
 * cada solicitud sin sacar a la farmacéutica del contexto — pensado para alto volumen diario.
 *
 * El filtro de fecha NO se aplica parejo (ver useDispensationBoard): las columnas activas muestran
 * todo lo pendiente sin importar el día, porque una solicitud de ayer sin atender tiene que seguir
 * a la vista. Solo Listas y Entregadas se acotan al día elegido.
 */
export function DispensacionesView({ module, setHeader }: ViewProps) {
  const { hasMinRole } = useAuth()
  const canOperate = hasMinRole('pharma', 'operator')

  const [day, setDay] = useState(todayISO())
  const [proto, setProto] = useState(ALL)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const q = useDispensationBoard(day)
  const all = useMemo(() => q.data ?? [], [q.data])

  // Protocolos presentes hoy, con su cuenta. Sale de los datos, no de una lista fija: si no hay
  // nada de un protocolo, no tiene sentido ofrecerlo como filtro.
  const protoOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of all) {
      const code = r.visit?.enrollment?.protocol?.code
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return [
      { value: ALL, label: 'Todos los protocolos', count: all.length },
      ...[...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, n]) => ({ value: code, label: code, count: n })),
    ]
  }, [all])

  // Búsqueda + protocolo, agrupado por columna.
  const byColumn = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<BoardColumn, DispensationRequestRow[]>()
    for (const r of all) {
      const col = columnOf(r)
      if (!col) continue
      if (proto !== ALL && r.visit?.enrollment?.protocol?.code !== proto) continue
      if (needle) {
        const hay = [
          activeDispensation(r)?.dispensation_code ?? '',
          r.visit?.enrollment?.patient?.code ?? '',
          r.visit?.enrollment?.protocol?.code ?? '',
          ...r.items.map((i) => i.medication?.name ?? ''),
        ].join(' ').toLowerCase()
        if (!hay.includes(needle)) continue
      }
      const list = map.get(col)
      if (list) list.push(r)
      else map.set(col, [r])
    }
    return map
  }, [all, proto, query])

  const visibles = useMemo(() => [...byColumn.values()].reduce((n, l) => n + l.length, 0), [byColumn])
  const open = openId ? all.find((r) => r.id === openId) ?? null : null

  // El encabezado del shell aloja los filtros (el H1 y el breadcrumb los pone el shell).
  useEffect(() => {
    setHeader?.({
      content: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterDropdown
            accent={module.accentSolid}
            value={proto}
            onChange={setProto}
            options={protoOptions}
            menuLabel="Protocolo"
          />
          <DateNavButton accent={module.accentSolid} date={day} onChange={setDay} />
        </div>
      ),
    })
    return () => setHeader?.(null)
  }, [setHeader, module.accentSolid, proto, protoOptions, day])

  /** Avance de estado desde el CTA de la card, sin abrir el cajón. */
  const advance = async (r: DispensationRequestRow, column: BoardColumn) => {
    setBusyId(r.id)
    setErr(null)
    if (column === 'solicitada') {
      const res = await startDispensationPreparation(r.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      setOpenId(r.id)          // preparar = abrir el cajón y ponerse a escanear
      return
    }
    if (column === 'preparando') {
      // Si falta escanear, el CTA dice "Continuar": abre el cajón en vez de intentar avanzar.
      const pendientes = r.items.filter((i) => i.scanned_at === null).length
      if (pendientes > 0) { setBusyId(null); setOpenId(r.id); return }
      const res = await markDispensationReady(r.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      setToast(`${res.dispensationCode ?? 'Dispensación'} lista · comprobante N° ${res.correlative} generado`)
      return
    }
    if (column === 'lista') {
      const disp = activeDispensation(r)
      if (!disp) { setBusyId(null); return }
      const res = await deliverDispensation(disp.id)
      setBusyId(null)
      if (res.error) { setErr(res.error); return }
      q.refetch()
      setToast(`${disp.dispensation_code ?? 'Dispensación'} entregada`)
    }
  }

  return (
    // El shell da `padding: 16px 26px 0` al contenido, o sea aire a los lados pero nada abajo: el
    // tablero llegaba pegado al borde inferior. Los mismos 26px abajo cierran la caja y dejan
    // respirar el papel, igual que a los costados.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 14, paddingBottom: 26, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '0 0 auto' }}>
        <div style={searchWrap}>
          <Icon name="search" size={17} color="var(--spira-faint)" />
          <input
            className="spira-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar dispensación…"
            aria-label="Buscar por código, paciente, protocolo o medicamento"
            style={searchInput}
          />
        </div>
      </div>

      {err && (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>{err}</span>
        </div>
      )}

      {q.loading && all.length === 0 ? (
        <KanbanSkeleton />
      ) : q.error ? (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>No pudimos cargar el tablero de dispensación.</span>
        </div>
      ) : visibles === 0 ? (
        <EmptyState
          accent={module.accent}
          icon="box"
          title={query.trim() || proto !== ALL ? 'Sin resultados' : 'Sin dispensaciones'}
          description={
            query.trim() || proto !== ALL
              ? 'Probá con otro término o quitá el filtro de protocolo.'
              : 'Cuando Coordinación solicite una dispensación desde una visita, aparece acá.'
          }
        />
      ) : (
        <KanbanBoard
          rows={byColumn}
          busyId={busyId}
          canOperate={canOperate}
          onOpen={(r) => setOpenId(r.id)}
          onAdvance={advance}
        />
      )}

      {open && (
        <DispensacionDrawer
          r={open}
          onClose={() => setOpenId(null)}
          onChanged={() => q.refetch()}
          onToast={setToast}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, width: 300, height: 42,
  padding: '0 15px', borderRadius: 999, background: 'var(--spira-white)',
  border: '1px solid var(--spira-line-2)',
}

const searchInput: CSSProperties = {
  flex: 1, border: 'none', outline: 'none', background: 'transparent',
  fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)', minWidth: 0,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', fontSize: 13,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 10, padding: '10px 13px',
}
