import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { FilterDropdown } from '../../components/FilterDropdown'
import { DateNavButton } from '../../components/DateNavButton'
import { Icon } from '../../components/Icon'
import { Toast } from '../../components/Toast'
import {
  useDispensationBoard,
  useDispensationHistory,
  columnOf,
  startDispensationPreparation,
  markDispensationReady,
  deliverDispensation,
  activeDispensation,
} from '../../data/pharma'
import type { BoardColumn, DispensationRequestRow } from '../../data/pharma'
import { readyBlockedReason } from './dispensaciones/estados'
import { KanbanBoard } from './dispensaciones/KanbanBoard'
import { DispensacionDrawer } from './dispensaciones/DispensacionDrawer'
import { NuevaDispensacionDrawer } from './dispensaciones/NuevaDispensacionDrawer'
import { HistorialPorDias } from './dispensaciones/HistorialPorDias'
import { btnOutline } from '../../components/buttons'
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
  const [vista, setVista] = useState<'tablero' | 'historial'>('tablero')
  const [pagina, setPagina] = useState(0)
  const [acumuladas, setAcumuladas] = useState<DispensationRequestRow[]>([])
  /** Última página ya volcada en `acumuladas`, para no aplicarla dos veces. */
  const aplicadaRef = useRef(-1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const q = useDispensationBoard(day)
  const all = useMemo(() => q.data ?? [], [q.data])

  // El historial no FILTRA por fecha (sigue mostrando todos los días, como pide el handoff): la
  // fecha mueve el punto de partida de la lista, que arranca ahí y avanza hacia atrás.
  const h = useDispensationHistory({
    page: pagina,
    protocolCode: proto !== ALL ? proto : null,
    patientCode: query,
    enabled: vista === 'historial',
    fromDay: day,
  })

  // Las páginas se acumulan; cambiar de filtro reinicia la pila (si no, "Cargar más" mezclaría
  // resultados de dos búsquedas distintas).
  // `day` entra acá porque en el historial mueve el punto de partida: sin reiniciar, "Cargar más"
  // seguiría paginando desde la fecha anterior.
  useEffect(() => {
    setPagina(0)
    setAcumuladas([])
    aplicadaRef.current = -1
  }, [proto, query, vista, day])

  /**
   * Acumulación de páginas, con dos guardas que no son paranoia:
   *
   * 1 · `d.page !== pagina` — al apretar "Cargar más", `pagina` sube antes de que llegue la
   *     respuesta, así que el efecto corre una vez con los datos de la página ANTERIOR todavía en
   *     mano. Sin esta guarda se concatenaban de nuevo y 4 registros se veían como 6.
   * 2 · `aplicadaRef` — evita re-aplicar la misma página si el efecto vuelve a correr por otra
   *     razón (un refetch, por ejemplo).
   */
  useEffect(() => {
    const d = h.data
    if (!d || d.page !== pagina || aplicadaRef.current === d.page) return
    aplicadaRef.current = d.page
    setAcumuladas((prev) => (d.page === 0 ? d.rows : [...prev, ...d.rows]))
  }, [h.data, pagina])

  /**
   * Protocolos presentes hoy. Sale de los datos, no de una lista fija: si no hay nada de un
   * protocolo, no tiene sentido ofrecerlo como filtro.
   *
   * Sin contadores: el número contaba SOLICITUDES, pero al lado de "Todos los protocolos" se leía
   * como cantidad de protocolos. Un dato que hay que interpretar dos veces no ayuda, y el tablero
   * ya lleva el contador real en la cabecera de cada columna.
   */
  const protoOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const r of all) {
      const code = r.protocol?.code
      if (code) codes.add(code)
    }
    return [
      { value: ALL, label: 'Todos los protocolos' },
      ...[...codes].sort((a, b) => a.localeCompare(b)).map((code) => ({ value: code, label: code })),
    ]
  }, [all])

  // Búsqueda + protocolo, agrupado por columna.
  const byColumn = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const map = new Map<BoardColumn, DispensationRequestRow[]>()
    for (const r of all) {
      const col = columnOf(r)
      if (!col) continue
      if (proto !== ALL && r.protocol?.code !== proto) continue
      if (needle) {
        const hay = [
          activeDispensation(r)?.dispensation_code ?? '',
          r.enrollment?.patient?.code ?? '',
          r.protocol?.code ?? '',
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
  /**
   * La fila abierta puede venir de cualquiera de las dos vistas, así que se busca en las dos. El
   * tablero solo tiene los cuatro estados vivos: una rechazada o cancelada existe únicamente en el
   * historial, y buscarla solo en `all` dejaba el cajón sin abrir al clickearla ahí.
   */
  const open = openId
    ? all.find((r) => r.id === openId) ?? acumuladas.find((r) => r.id === openId) ?? null
    : null

  /**
   * La acción primaria va en la fila del título (donde el shell la alinea con el H1); los tres
   * controles de la vista viven juntos en la toolbar de abajo. Antes el toggle colgaba en una
   * columna pegada al botón: quedaba fuera de la línea de los filtros y con otra altura.
   */
  useEffect(() => {
    // Un viewer no debería ver un botón que no puede usar.
    setHeader?.(
      canOperate
        ? { actions: [{ key: 'nueva', label: 'Nueva dispensación', icon: 'plus', onClick: () => setCreando(true), primary: true }] }
        : null,
    )
    return () => setHeader?.(null)
  }, [setHeader, canOperate])

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
      // Si falta algo, el CTA dice "Continuar": abre el cajón en vez de intentar avanzar.
      //
      // Pregunta `readyBlockedReason` y NO cuenta escaneos pendientes a mano, que era lo que hacía
      // antes: desde que existe el IP, lo que falta puede ser la CONSTANCIA y no un escaneo, y un
      // pedido de IP solo no tiene ningún renglón — con la cuenta a mano daba cero pendientes, el
      // tablero intentaba marcarlo lista y el servidor lo rechazaba con un error crudo, salteando
      // el bloqueo que el cajón sí aplica. Una sola regla, en `estados.ts`, para las dos pantallas.
      if (readyBlockedReason(r)) { setBusyId(null); setOpenId(r.id); return }
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
      // Con IP la entrega NO se resuelve de un clic desde el tablero: hay que declarar cuántos kits
      // salieron, y ese número descuenta stock y no se corrige nunca más. Entregar desde acá salteaba
      // el campo y el pop-up enteros —los dos viven en el cajón— y mandaba la entrega sin kits. Se
      // abre el cajón, que es donde se declara.
      if (r.includes_ip) { setBusyId(null); setOpenId(r.id); return }
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
            /* El alcance de la búsqueda cambia con la vista y el placeholder lo dice: en el tablero
               son pocas filas ya cargadas y se puede filtrar por todo; en el historial la consulta
               va a Postgres por código de paciente, y prometer más sería mentir sobre por qué algo
               "no aparece". */
            placeholder={vista === 'historial' ? 'Buscar por código de paciente…' : 'Buscar dispensación…'}
            aria-label={
              vista === 'historial'
                ? 'Buscar en el historial por código de paciente'
                : 'Buscar por código, paciente, protocolo o medicamento'
            }
            style={searchInput}
          />
        </div>

        {/* Empuja los controles al margen derecho, como en el mock. */}
        <div style={{ flex: 1 }} />

        <FilterDropdown
          accent={module.accentSolid}
          value={proto}
          onChange={setProto}
          options={protoOptions}
          menuLabel="Protocolo"
        />
        {/* La fecha vive en las DOS vistas. En el tablero elige el día que se muestra; en el
            historial mueve el punto de partida de la lista (ver useDispensationHistory). */}
        <DateNavButton accent={module.accentSolid} date={day} onChange={setDay} />
        <button
          type="button"
          onClick={() => setVista((v) => (v === 'tablero' ? 'historial' : 'tablero'))}
          style={{
            ...btnOutline,
            // 38 y no los 40 de btnOutline: FilterDropdown y DateNavButton miden 38, y dos píxeles
            // de diferencia bastan para que la fila se vea desalineada. Mismo padding y radio que
            // ellos, por lo mismo.
            height: 38,
            padding: '0 13px',
            display: 'flex', alignItems: 'center', gap: 8,
            ...(vista === 'historial'
              ? { background: 'var(--spira-ink)', color: 'var(--spira-paper)', borderColor: 'var(--spira-ink)' }
              : null),
          }}
        >
          <Icon name={vista === 'historial' ? 'dashboard' : 'list'} size={16} color="currentColor" />
          {vista === 'historial' ? 'Ver tablero' : 'Historial'}
        </button>
      </div>

      {err && (
        <div style={errBox} role="alert">
          <Icon name="alertCircle" size={15} />
          <span>{err}</span>
        </div>
      )}

      {vista === 'historial' ? (
        h.loading && acumuladas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '10px 2px' }}>Cargando historial…</div>
        ) : h.error ? (
          <div style={errBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>No pudimos cargar el historial.</span>
          </div>
        ) : acumuladas.length === 0 ? (
          <EmptyState
            accent={module.accent}
            icon="list"
            title={query.trim() || proto !== ALL ? 'Sin resultados' : 'Sin dispensaciones hasta esa fecha'}
            description={
              query.trim() || proto !== ALL
                ? 'Probá con otro código de paciente, quitá el filtro de protocolo o movete a una fecha más reciente.'
                : 'El historial arranca en la fecha elegida y va hacia atrás. Movete a una fecha más reciente para ver actividad.'
            }
          />
        ) : (
          <HistorialPorDias
            rows={acumuladas}
            hasMore={h.data?.hasMore ?? false}
            loading={h.loading}
            onOpen={(r) => setOpenId(r.id)}
            onMore={() => setPagina((p) => p + 1)}
          />
        )
      ) : q.loading && all.length === 0 ? (
        /* Carga inicial (solo cuando NO hay filas: useSupabaseQuery mantiene las viejas en un
           refetch). Antes acá iba un esqueleto de cards vacías, y en una app clínica leía como
           "el tablero se rompió" en vez de "esperá": tarjetas sin texto, sin movimiento, en el
           mismo lugar donde después hay dispensaciones reales. Se dice con palabras, igual que
           el resto de la app (DESIGN.md: EmptyState cubre vacío / cargando / sin acceso). */
        <EmptyState
          accent={module.accent}
          icon="box"
          title="Cargando el tablero…"
          description="Un momento."
        />
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

      {creando && (
        <NuevaDispensacionDrawer
          onClose={() => setCreando(false)}
          onCreated={(id) => {
            // Nace y se toma en el mismo gesto: se cierra el alta y se abre su cajón de
            // preparación, que es donde la farmacéutica ya está por ponerse a escanear.
            setCreando(false)
            q.refetch()
            void startDispensationPreparation(id).then(() => { q.refetch(); setOpenId(id) })
            setToast('Dispensación creada · escaneá para prepararla')
          }}
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
