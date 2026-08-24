import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { Chip } from '../../components/Chip'
import { Toast } from '../../components/Toast'
import { btnOutline } from '../../components/buttons'
import { MultiFilterMenu } from '../../components/MultiFilterMenu'
import type { MultiFilterOption } from '../../components/MultiFilterMenu'
import { DateRangeField } from '../../components/DateRangeField'
import { useAuth } from '../../lib/auth'
import { codecs, listOf } from '../../lib/router'
import { useUrlState } from '../../lib/useUrlState'
import { addDaysISO, groupByDay, todayISO, yearsFromTodayISO } from '../../lib/dates'
import { useProtocols } from '../../data/protocols'
import { useReceptions, useMedications, verifyReception, voidReception, TECHO_RECEPCIONES } from '../../data/pharma'
import type { ReceptionRow, ReceptionKind, ReceptionStatus } from '../../data/pharma'
import { ReceptionWizard } from './ReceptionWizard'
import { ReceptionCard } from './recepcion/ReceptionCard'
import { ConfirmarVerificacion } from './recepcion/ConfirmarVerificacion'
import { AnularRecepcion, esAnulable } from './recepcion/AnularRecepcion'
import type { AnulableReceptionRow } from './recepcion/AnularRecepcion'
import { KIND_CHIP } from './recepcion/ambitos'
import { coincideBusqueda, totalesDelDia } from './recepcion/derivados'
import type { ViewProps } from '../types'

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

  /* CINCO FILTROS, TODOS DEL MISMO PALO. Antes esta toolbar tenía tres dialectos conviviendo
     —chips excluyentes para estado, chips radio para ámbito, y un panel "Más filtros" con campos
     de formulario— y el panel escondía justo los dos que más se usan. Ahora son menús
     multi-selección iguales a los del resto de la app (vacío = todos) más el rango de fechas de
     Reportes, y el panel desapareció. */
  /* `listOf` y no `codecs.list` con un cast: un cast compila pero miente —`?estado=inventado`
     entraría tipado y válido sin caer al default—; `listOf` valida cada elemento contra el enum.
     Los valores exactos de `ReceptionStatus`/`ReceptionKind` salen de su definición en
     `src/data/pharma/receptions.ts` (líneas 6 y 9). */
  const [fEstados, setFEstados] = useUrlState<ReceptionStatus[]>('estado', [], {
    codec: listOf(['pendiente', 'verificada', 'anulada'] as const),
  })
  const [fTipos, setFTipos] = useUrlState<ReceptionKind[]>('tipo', [], {
    codec: listOf(['protocolo', 'investigacion', 'ambulatoria'] as const),
  })
  const [fMeds, setFMeds] = useUrlState<string[]>('medicamento', [], { codec: codecs.list })
  const [fProtoSel, setFProtoSel] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [q, setQ] = useUrlState('buscar', '')
  /** Rango de fechas; ambos vacíos = sin filtro (la lista arranca mostrando todo). */
  const [desde, setDesde] = useUrlState('desde', '')
  const [hasta, setHasta] = useUrlState('hasta', '')

  /* Los presets 7/30 no son estado propio: ESCRIBEN el rango, y su estado "activo" se deduce de
     él. Guardarlos aparte permitía que el chip dijera "7 días" mientras el calendario mostraba
     otra cosa — que es lo que pasaba antes, cuando eran dos filtros que se acumulaban. */
  const rangoPreset = (n: 7 | 30) => ({ desde: addDaysISO(todayISO(), -(n - 1)), hasta: todayISO() })
  const presetActivo = (n: 7 | 30) => { const r = rangoPreset(n); return desde === r.desde && hasta === r.hasta }
  const togglePreset = (n: 7 | 30) => {
    setHighlightId(null)
    if (presetActivo(n)) { setDesde(''); setHasta(''); return }
    const r = rangoPreset(n)
    setDesde(r.desde); setHasta(r.hasta)
  }

  // Definido acá arriba (no después del return temprano del wizard): onCreated lo captura.
  const limpiarFiltros = () => {
    setFEstados([]); setFTipos([]); setFMeds([]); setFProtoSel([]); setDesde(''); setHasta('')
  }

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

  // El tipo filtra server-side (el resto es client-side sobre lo traído): hay techo de filas, y
  // filtrando en memoria "solo ambulatorias" podría no encontrar ninguna por haber traído 500 de
  // protocolo. Ver el comentario de useReceptions.
  const receptions = useReceptions(fTipos, null)

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
    return (receptions.data ?? []).filter((r) => {
      if (fEstados.length > 0 && !fEstados.includes(r.status)) return false
      if (!coincideBusqueda(r, q)) return false
      if (fProtoSel.length > 0 && !fProtoSel.includes(r.protocol_id ?? '')) return false
      if (fMeds.length > 0 && !r.items.some((it) => fMeds.includes(it.medication_id))) return false
      if (desde && r.reception_date < desde) return false
      if (hasta && r.reception_date > hasta) return false
      return true
    })
  }, [receptions.data, fEstados, q, fProtoSel, fMeds, desde, hasta])

  const groups = useMemo(() => groupByDay(rows, (r) => r.reception_date), [rows])
  /* Cuenta VALORES elegidos, como el "Limpiar N" de Visitas; el rango cuenta como uno solo aunque
     sean dos fechas. La búsqueda no entra: tiene su propio campo y se ve. */
  const nFiltros = fEstados.length + fTipos.length + fMeds.length + fProtoSel.length + (desde || hasta ? 1 : 0)
  const hayFiltros = !!q.trim() || nFiltros > 0

  // Cuando el wizard termina, volvemos a la cola y resaltamos la recepción recién creada.
  if (creating) {
    return (
      <ReceptionWizard
        accentSolid={accentSolid}
        // Igual que con el protocolo: el wizard hereda el tipo solo si hay UNO filtrado.
        initialTipo={fTipos.length === 1 ? fTipos[0] : 'protocolo'}
        // Solo si hay UN protocolo filtrado: con varios elegidos no hay uno "en contexto" y
        // adivinar cuál sembraría el wizard con un dato que nadie pidió.
        initialProtocolId={fProtoSel.length === 1 ? fProtoSel[0] : ''}
        onClose={() => setCreating(false)}
        // Al crear: resetear TODOS los filtros para que la recepción nueva nunca quede oculta por
        // un filtro activo y el highlight de 5 s se vea.
        onCreated={(id) => {
          setCreating(false); setQ(''); limpiarFiltros(); setHighlightId(id); receptions.refetch()
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
  // Las opciones se definen ANTES del toolbar a propósito: el JSX de abajo las usa y un `const`
  // declarado después quedaría en zona muerta (ReferenceError al renderizar, no error de compilación).
  const protoOptions: MultiFilterOption[] = (protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))
  const medOptions: MultiFilterOption[] = (catalog.data ?? []).map((m) => ({ value: m.id, label: m.name }))
  /* Los tipos van SIN conteo: el tipo filtra en la BASE, así que apenas elegís uno los otros dos
     valdrían 0 y el menú diría que no existen. */
  const tipoOptions: MultiFilterOption[] = (Object.keys(KIND_CHIP) as ReceptionKind[])
    .map((k) => ({ value: k, label: KIND_CHIP[k].label }))
  /* El estado SÍ lleva conteo: filtra en memoria, así que cuenta sobre todo lo cargado. Si hay un
     tipo elegido, cuenta dentro de ese universo — que es el que se está mirando. */
  const estadoOptions: MultiFilterOption[] = (['pendiente', 'verificada', 'anulada'] as ReceptionStatus[])
    .map((s) => ({
      value: s,
      label: s === 'pendiente' ? 'Pendientes' : s === 'verificada' ? 'Verificadas' : 'Anuladas',
      count: receptions.data ? receptions.data.filter((r) => r.status === s).length : null,
    }))
  const toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {/* Buscador con la misma caja que el resto de los controles de la fila (38 de alto, radio 10):
          quedaba una píldora de 40 entre botones rectangulares de 38. Con la lupa como hermana flex
          y no como capa absoluta, además, no puede taparla el levante del foco. */}
      <div style={searchWrap}>
        <Icon name="search" size={15} color="var(--spira-faint)" />
        <input
          className="spira-bare-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Folio, medicamento, EAN o lote…"
          aria-label="Buscar recepción por folio, medicamento, código, lote o protocolo"
          style={searchInput}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" style={searchClear}>
            <Icon name="x" size={13} color="var(--spira-faint)" />
          </button>
        )}
      </div>

      <MultiFilterMenu
        accent={accentSolid}
        label="Estado"
        icon="filter"
        options={estadoOptions}
        selected={fEstados}
        onChange={(next) => { setFEstados(next as ReceptionStatus[]); setHighlightId(null) }}
      />
      <MultiFilterMenu
        accent={accentSolid}
        label="Medicamento"
        icon="pill"
        options={medOptions}
        selected={fMeds}
        onChange={(next) => { setFMeds(next); setHighlightId(null) }}
        searchPlaceholder="Buscar medicamento…"
      />
      <MultiFilterMenu
        accent={accentSolid}
        label="Tipo"
        icon="clipboardCheck"
        options={tipoOptions}
        selected={fTipos}
        onChange={(next) => { setFTipos(next as ReceptionKind[]); setHighlightId(null) }}
      />
      {/* Protocolo va pegado a Tipo: los dos dicen de dónde viene la recepción, y separados por
          media fila el par se leía como dos cosas distintas. */}
      <MultiFilterMenu
        accent={accentSolid}
        label="Protocolo"
        icon="file"
        options={protoOptions}
        selected={fProtoSel}
        onChange={(next) => { setFProtoSel(next); setHighlightId(null) }}
        searchPlaceholder="Buscar protocolo…"
      />

      <span style={separador} />

      {/* Los presets NO son un eje aparte del rango: escriben el mismo desde/hasta que el
          calendario, así que lo que muestra el selector es siempre lo que se está aplicando.
          Antes eran dos filtros distintos que se acumulaban en silencio. */}
      <div style={{ display: 'flex', gap: 7 }}>
        <Chip toggle label="7 días" selected={presetActivo(7)} onClick={() => togglePreset(7)} accent={accentSolid} />
        <Chip toggle label="30 días" selected={presetActivo(30)} onClick={() => togglePreset(30)} accent={accentSolid} />
      </div>
      <DateRangeField
        accent={accentSolid}
        desde={desde}
        hasta={hasta}
        onChange={(d, h) => { setDesde(d); setHasta(h); setHighlightId(null) }}
        max={yearsFromTodayISO(2)}
        aniosAtras={10}
        placeholder="Todas las fechas"
        ariaLabel="Filtrar las recepciones por rango de fechas"
      />

      {nFiltros > 0 && (
        <button type="button" onClick={limpiarFiltros} style={clearBtn}>
          <Icon name="x" size={13} color="var(--spira-muted)" /> Limpiar {nFiltros}
        </button>
      )}
    </div>
  )

  if (receptions.loading) {
    return (
      <div style={wrap}>
        {toolbar}
        <EmptyState accent={accent} icon={submodule.icon} title="Cargando…" description="Un momento." />
      </div>
    )
  }
  if (receptions.error) {
    return (
      <div style={wrap}>
        {toolbar}
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar las recepciones.</div>
        <button onClick={() => receptions.refetch()} style={btnOutline}>Reintentar</button>
      </div>
    )
  }

  return (
    <div style={wrap}>
      {toolbar}

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
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 38, width: 250, padding: '0 12px',
  borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
}
const searchInput: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13,
}
const searchClear: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }
/** "Limpiar N": mismo botón fantasma que en Visitas y Stock. */
const clearBtn: CSSProperties = {
  height: 38, padding: '0 12px', borderRadius: 10, border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600,
  fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
}

// Barra del día: fecha, una regla que ocupa el espacio libre, y el conteo a la derecha.
const daybar: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 11, padding: '0 2px 10px' }
const fechaDia: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14, color: 'var(--spira-ink)' }
const regla: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line-2)', opacity: 0.7 }
const conteoDia: CSSProperties = { fontSize: 12, color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }
