import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { Chip } from '../../components/Chip'
import { Toast } from '../../components/Toast'
import { btnOutline } from '../../components/buttons'
import { fieldLabelStyle } from '../../components/FormField'
import { SearchableSelect } from '../../components/SearchableSelect'
import { DateField } from '../../components/DateField'
import { useAuth } from '../../lib/auth'
import { addDaysISO, groupByDay, todayISO, yearsFromTodayISO } from '../../lib/dates'
import { useProtocols } from '../../data/protocols'
import { useReceptions, useMedications, verifyReception, voidReception, TECHO_RECEPCIONES } from '../../data/pharma'
import type { ReceptionRow, ReceptionKind } from '../../data/pharma'
import { ReceptionWizard } from './ReceptionWizard'
import { ReceptionCard } from './recepcion/ReceptionCard'
import { ConfirmarVerificacion } from './recepcion/ConfirmarVerificacion'
import { AnularRecepcion, esAnulable } from './recepcion/AnularRecepcion'
import type { AnulableReceptionRow } from './recepcion/AnularRecepcion'
import { KIND_CHIP } from './recepcion/ambitos'
import { coincideBusqueda, totalesDelDia } from './recepcion/derivados'
import type { ViewProps } from '../types'

/** Filtro de ámbito de la lista: los tres o todos juntos. */
type ChipFilter = 'todas' | ReceptionKind

/**
 * Pharma → Recepción. Lista TRANSVERSAL de recepciones: todas las de todos los ámbitos,
 * agrupadas por día, con búsqueda + filtros + alta por wizard. El protocolo es un filtro más,
 * no un gate (Pharma es central: ve todo por RLS). Migraciones 0032+0035+0037+0085.
 *
 * DOS EJES DE FILTRO, NO UNO. El handoff "2c" proponía un solo grupo de chips mezclando estado y
 * ámbito (Todas / Pendientes / Protocolo / Ambulatoria), lo que vuelve imposible pedir "las
 * pendientes de protocolo" —la consulta más frecuente de esta pantalla— y de paso borraba
 * Investigación. Acá el estado es un toggle aparte y el ámbito conserva sus cuatro opciones.
 */
export function RecepcionView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  const protocols = useProtocols()
  const catalog = useMedications() // para el filtro "Medicamento" (desplegable, sin texto libre)

  const [chip, setChip] = useState<ChipFilter>('todas')
  /** Eje de estado. Dos chips excluyentes; 'todas' es "ninguno tildado". */
  const [estado, setEstado] = useState<'todas' | 'pendientes' | 'anuladas'>('todas')
  const [q, setQ] = useState('')
  const [days, setDays] = useState<7 | 30 | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [fProtocol, setFProtocol] = useState('')
  const [fMedId, setFMedId] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')

  // Definido acá arriba (no después del return temprano del wizard): onCreated lo captura.
  const clearMore = () => { setFProtocol(''); setFMedId(''); setFDesde(''); setFHasta('') }

  const [creating, setCreating] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<ReceptionRow | null>(null)
  const [anulando, setAnulando] = useState<AnulableReceptionRow | null>(null)
  /** Error del intento de anular. Vive aparte de `errorPorId` porque se muestra DENTRO del modal,
   *  que queda abierto: el bloqueo típico ("del lote quedan 2 y esta ingresó 5") no se arregla
   *  reintentando, se lee y se decide otra cosa. */
  const [errorAnular, setErrorAnular] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  /** Error de verificación POR recepción: se muestra en la banda de su card, no en el tope. */
  const [errorPorId, setErrorPorId] = useState<Record<string, string>>({})

  // El chip de ámbito filtra server-side (el resto es client-side sobre lo traído).
  const receptions = useReceptions(chip === 'todas' ? null : chip, null)

  // Auto-limpia el highlight tras 5 s para no dejar el resaltado indefinidamente.
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 5000)
    return () => clearTimeout(t)
  }, [highlightId])

  // Encabezado contextual del shell: "Nueva recepción" arriba a la derecha (gating leader),
  // y la miga "Nueva recepción" mientras el wizard está abierto.
  useEffect(() => {
    if (!setHeader) return
    if (creating) {
      setHeader({ crumbs: [{ label: 'Nueva recepción' }] })
    } else {
      setHeader(canManage
        ? { actions: [{ key: 'nueva', label: 'Nueva recepción', icon: 'plus', primary: true, onClick: () => setCreating(true) }] }
        : null)
    }
    return () => setHeader(null)
  }, [setHeader, creating, canManage])

  const rows = useMemo(() => {
    const desdeRango = days ? addDaysISO(todayISO(), -(days - 1)) : null
    return (receptions.data ?? []).filter((r) => {
      if (estado === 'pendientes' && r.status !== 'pendiente') return false
      if (estado === 'anuladas' && r.status !== 'anulada') return false
      if (!coincideBusqueda(r, q)) return false
      if (desdeRango && r.reception_date < desdeRango) return false
      if (fProtocol && r.protocol_id !== fProtocol) return false
      if (fMedId && !r.items.some((it) => it.medication_id === fMedId)) return false
      if (fDesde && r.reception_date < fDesde) return false
      if (fHasta && r.reception_date > fHasta) return false
      return true
    })
  }, [receptions.data, estado, q, days, fProtocol, fMedId, fDesde, fHasta])

  const groups = useMemo(() => groupByDay(rows, (r) => r.reception_date), [rows])
  const moreCount = [fProtocol, fMedId, fDesde, fHasta].filter(Boolean).length
  const hayFiltros = !!q.trim() || days !== null || moreCount > 0 || chip !== 'todas' || estado !== 'todas'

  // Cuando el wizard termina, volvemos a la cola y resaltamos la recepción recién creada.
  if (creating) {
    return (
      <ReceptionWizard
        accentSolid={accentSolid}
        initialTipo={chip === 'todas' ? 'protocolo' : chip}
        initialProtocolId={fProtocol}
        onClose={() => setCreating(false)}
        // Al crear: resetear TODOS los filtros para que la recepción nueva nunca quede oculta por
        // un filtro activo y el highlight de 5 s se vea.
        onCreated={(id) => {
          setCreating(false); setChip('todas'); setEstado('todas'); setQ('')
          setDays(null); clearMore(); setHighlightId(id); receptions.refetch()
        }}
      />
    )
  }

  /** Paso 2 de la verificación: el usuario ya confirmó en el modal. */
  const confirmarVerificacion = async () => {
    const r = confirmando
    if (!r) return
    setBusyId(r.id)
    const res = await verifyReception(r.id)
    setBusyId(null)
    if (res.error) {
      // El error se guarda contra SU recepción y el modal se cierra: el mensaje va a aparecer en
      // la banda de esa card, que es donde el usuario está mirando.
      setErrorPorId((prev) => ({ ...prev, [r.id]: res.error! }))
      setConfirmando(null)
      return
    }
    setErrorPorId((prev) => { const n = { ...prev }; delete n[r.id]; return n })
    setConfirmando(null)
    receptions.refetch()
    setToast(`Recepción Nº ${r.folio} ingresada a stock`)
  }

  /** Paso 2 de la anulación: el usuario ya eligió motivo y confirmó. */
  const confirmarAnulacion = async (reason: string) => {
    const r = anulando
    if (!r) return
    setBusyId(r.id)
    const res = await voidReception(r.id, reason)
    setBusyId(null)
    if (res.error) { setErrorAnular(res.error); return }
    // Si la recepción venía de un intento fallido de verificar, ese error ya no aplica.
    setErrorPorId((prev) => { const n = { ...prev }; delete n[r.id]; return n })
    setAnulando(null)
    setErrorAnular(null)
    receptions.refetch()
    setToast(`Recepción Nº ${r.folio} anulada`)
  }

  // ── Toolbar (siempre visible, también en loading/error/vacío) ────────────────
  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={searchWrap}>
        <span style={{ position: 'absolute', left: 13, display: 'grid', placeItems: 'center' }}>
          <Icon name="search" size={16} color="var(--spira-faint)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por folio, medicamento, EAN, lote…"
          aria-label="Buscar recepción por folio, medicamento, código, lote o protocolo"
          className="spira-search-input"
          style={searchInput}
        />
      </div>

      {/* Eje 1: estado. Dos toggles excluyentes (ninguno = todas), como el rango 7/30 de la
          derecha. Un radiogroup con su propio "Todas" quedaría al lado del "Todas" del ámbito. */}
      <div style={{ display: 'flex', gap: 7 }}>
        <Chip
          toggle
          label="Pendientes"
          selected={estado === 'pendientes'}
          onClick={() => { setEstado((v) => (v === 'pendientes' ? 'todas' : 'pendientes')); setHighlightId(null) }}
          accent={accentSolid}
        />
        <Chip
          toggle
          label="Anuladas"
          selected={estado === 'anuladas'}
          onClick={() => { setEstado((v) => (v === 'anuladas' ? 'todas' : 'anuladas')); setHighlightId(null) }}
          accent={accentSolid}
        />
      </div>
      <span style={separador} />

      {/* Eje 2: ámbito. */}
      <div role="radiogroup" aria-label="Ámbito de la recepción" style={{ display: 'flex', gap: 7 }}>
        <Chip label="Todas" selected={chip === 'todas'} onClick={() => { setChip('todas'); setHighlightId(null) }} accent={accentSolid} />
        {(Object.keys(KIND_CHIP) as ReceptionKind[]).map((k) => (
          <Chip key={k} label={KIND_CHIP[k].label} selected={chip === k} onClick={() => { setChip(k); setHighlightId(null) }} accent={accentSolid} />
        ))}
      </div>
      <span style={separador} />

      <div style={{ display: 'flex', gap: 7 }}>
        {/* Rango como toggles (se destildan al re-clickear) — no son radios. */}
        <Chip toggle label="7 días" selected={days === 7} onClick={() => setDays(days === 7 ? null : 7)} accent={accentSolid} />
        <Chip toggle label="30 días" selected={days === 30} onClick={() => setDays(days === 30 ? null : 30)} accent={accentSolid} />
      </div>

      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        aria-expanded={moreOpen}
        style={{ ...btnOutline, height: 36, fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}
      >
        <Icon name="sliders" size={15} color="var(--spira-muted)" /> Más filtros{moreCount > 0 ? ` · ${moreCount}` : ''}
      </button>
    </div>
  )

  const protocolOptions = [
    { value: 'all', label: 'Todos' },
    ...(protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]
  const medOptions = [
    { value: 'all', label: 'Todos' },
    ...(catalog.data ?? []).map((m) => ({ value: m.id, label: m.name })),
  ]

  const morePanel = moreOpen ? (
    <div style={panel}>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Protocolo</span>
        <SearchableSelect
          value={fProtocol || 'all'}
          onChange={(v) => setFProtocol(v === 'all' ? '' : v)}
          options={protocolOptions}
          placeholder="Todos"
          searchPlaceholder="Buscar protocolo…"
          entity="protocolo"
          menuWidth="auto"  // opciones (código — nombre) más largas que el campo
        />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Medicamento</span>
        <SearchableSelect
          value={fMedId || 'all'}
          onChange={(v) => setFMedId(v === 'all' ? '' : v)}
          options={medOptions}
          placeholder="Todos"
          searchPlaceholder="Buscar medicamento…"
          entity="medicamento"
          menuWidth="auto"
        />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Desde</span>
        <DateField value={fDesde} onChange={setFDesde} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
      </label>
      <label style={filterField}>
        <span style={fieldLabelStyle}>Hasta</span>
        <DateField value={fHasta} onChange={setFHasta} min={yearsFromTodayISO(-10)} max={yearsFromTodayISO(2)} />
      </label>
      <button type="button" onClick={clearMore} style={{ ...btnOutline, height: 38, alignSelf: 'flex-end' }}>Limpiar</button>
    </div>
  ) : null

  if (receptions.loading) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
      </div>
    )
  }
  if (receptions.error) {
    return (
      <div style={wrap}>
        {toolbar}
        {morePanel}
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar las recepciones.</div>
        <button onClick={() => receptions.refetch()} style={btnOutline}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {toolbar}
      {morePanel}

      {/* La lista llegó recortada: los totales por día dirían menos de lo que hubo. */}
      {receptions.truncado && (
        <div style={avisoBox} role="status">
          <Icon name="alertCircle" size={16} color="var(--spira-warn)" />
          <span>
            Hay más de {TECHO_RECEPCIONES} recepciones y la lista muestra las más recientes.
            Acotá por fecha o por ámbito para que los totales de cada día sean del período completo.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={hayFiltros ? 'Nada con esos filtros' : 'Sin recepciones'}
          description={hayFiltros
            ? 'Ninguna recepción coincide con la búsqueda o los filtros activos.'
            : 'Cuando llegue medicación, cargá la recepción y verificala para ingresar el stock.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {groups.map((g) => (
            <section key={g.date} aria-label={g.label}>
              <div style={daybar}>
                <span style={fechaDia}>{g.label}</span>
                <span style={regla} />
                <span style={conteoDia}>{totalesDelDia(g.items)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                {g.items.map((r) => (
                  <ReceptionCard
                    key={r.id}
                    r={r}
                    canManage={canManage}
                    busy={busyId === r.id}
                    highlight={r.id === highlightId}
                    error={errorPorId[r.id] ?? null}
                    onVerify={() => setConfirmando(r)}
                    onAnular={() => {
                      // Guard real, no cosmético: el botón que dispara esto ya está gateado por
                      // `!anulada` en ReceptionCard, pero es ACÁ donde se lo demuestra al
                      // compilador — `anulando` es `AnulableReceptionRow`, y `esAnulable` es el
                      // único paso legítimo (sin `cast`) para llegar a ese tipo desde `r`.
                      if (!esAnulable(r)) return
                      setErrorAnular(null)
                      setAnulando(r)
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {confirmando && (
        <ConfirmarVerificacion
          r={confirmando}
          busy={busyId === confirmando.id}
          onCancel={() => setConfirmando(null)}
          onConfirmar={confirmarVerificacion}
        />
      )}

      {anulando && (
        <AnularRecepcion
          r={anulando}
          busy={busyId === anulando.id}
          error={errorAnular}
          onCancel={() => { setAnulando(null); setErrorAnular(null) }}
          onConfirmar={confirmarAnulacion}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
const avisoBox: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--spira-ink-soft)', background: 'rgba(176,130,63,.10)', borderRadius: 10, padding: '11px 14px', lineHeight: 1.5 }
const separador: CSSProperties = { width: 1, height: 24, background: 'var(--spira-line)', flex: '0 0 auto' }
const searchWrap: CSSProperties = { position: 'relative', flex: 1, minWidth: 230, maxWidth: 340, display: 'flex', alignItems: 'center' }
const searchInput: CSSProperties = {
  width: '100%', height: 40, padding: '0 13px 0 38px', borderRadius: 999,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', boxShadow: 'var(--spira-shadow-sm)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13.5,
}
const panel: CSSProperties = {
  display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
  border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '12px 14px',
}
const filterField: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }

// Barra del día: fecha, una regla que ocupa el espacio libre, y el conteo a la derecha.
const daybar: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 11, padding: '0 2px 10px' }
const fechaDia: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--spira-ink)' }
const regla: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line-2)', opacity: 0.7 }
const conteoDia: CSSProperties = { fontSize: 12, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }
