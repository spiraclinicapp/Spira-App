import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { FilterDropdown } from '../../components/FilterDropdown'
import type { FilterOption } from '../../components/FilterDropdown'
import { MultiFilterMenu } from '../../components/MultiFilterMenu'
import type { MultiFilterOption } from '../../components/MultiFilterMenu'
import { btnOutline } from '../../components/buttons'
import { useAuth } from '../../lib/auth'
import { codecs, oneOf, resolveCode } from '../../lib/router'
import { useUrlPath, useUrlState } from '../../lib/useUrlState'
import { useProtocols } from '../../data/protocols'
import type { ProtocolRow } from '../../data/protocols'
import { protocolStatusLabel, protocolStatusVar } from '../protocolStatus'
import {
  useProtocolLots,
  useAmbulatoriaLots,
  useIpStockAll,
  useMedications,
  useMedicationCodes,
} from '../../data/pharma'
import type { LotDetailRow, MedicationRow } from '../../data/pharma'
import { NewMedicationForm } from './NewMedicationForm'
import { AdjustStockModal } from './AdjustStockModal'
import { CodigoModal } from './CodigoModal'
import { DeleteMedicationModal } from './DeleteMedicationModal'
import { Toast } from '../../components/Toast'
import { NotFoundView } from '../../shell/NotFoundView'
import type { ViewProps } from '../types'
import { ESTADO_CFG } from './expiryState'
import type { Estado } from './expiryState'
import {
  claveDePlegado,
  construirGrupos,
  contarGrupos,
  esPlegable,
  estadoDe,
  estadoDelGrupo,
  etiquetaLotes,
  matchTexto,
  nivelDeCantidad,
  nivelDelGrupo,
  stockTotal,
  vencimientoDelGrupo,
} from './stock/agrupacion'
import type { EstadoFilter, GrupoVisible, Nivel } from './stock/agrupacion'

type Apartado = 'menu' | 'protocolo' | 'ambulatoria' | 'catalogo'

/** Apartados que ocupan un segmento del path. 'menu' NO está: es la AUSENCIA de segmento, igual que
    `/coordinacion/pacientes` sin código es la grilla — nunca se escribe `/stock/menu`. */
const APARTADOS_SEGMENTO: readonly Apartado[] = ['protocolo', 'ambulatoria', 'catalogo']

/** Claves de los filtros de ESTA vista (los `useUrlState` que quedan más abajo): se conservan al
    abrir o cerrar un apartado, para que `setPath` —que por default DESCARTA todo el query— no se
    los lleve puestos. */
const FILTROS_STOCK = ['estado', 'buscar', 'protocolo']

/**
 * El segmento del path → el `Apartado` que ya conoce el resto de la vista (la traducción va SOLO en
 * este borde, igual que la de `protoCodes` más abajo). `null` = el segmento no es ninguno de los tres
 * apartados (`/farmacia/stock/inventado`): la vista tiene que mostrar la pantalla serena DENTRO del
 * marco, como hace `ProtocolsView` con un código de protocolo inexistente — no caer al menú en
 * silencio, que escondería que el link estaba roto.
 */
function apartadoDesdePath(path: string[]): Apartado | null {
  if (path.length === 0) return 'menu'
  if (path.length === 1 && (APARTADOS_SEGMENTO as string[]).includes(path[0])) return path[0] as Apartado
  return null
}

/** Etiqueta del apartado para la miga del breadcrumb (null en el menú = header genérico). */
const APARTADO_LABEL: Record<Apartado, string | null> = {
  menu: null, protocolo: 'Farmacia Protocolo', ambulatoria: 'Farmacia Ambulatoria', catalogo: 'Catálogo',
}

/**
 * Ancla un popover a un botón con position:fixed (medido con getBoundingClientRect), para que NO lo
 * recorte el contenedor con overflow:auto de la vista. Reposiciona al scrollear/redimensionar. El
 * menú se alinea debajo y a la derecha del botón.
 */
function useAnchoredPopover(open: boolean, width: number) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const measure = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - width) })
  }, [width])
  useEffect(() => {
    if (!open) { setPos(null); return }
    measure()
    const on = () => measure()
    window.addEventListener('scroll', on, true)
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on, true); window.removeEventListener('resize', on) }
  }, [open, measure])
  return { anchorRef, pos }
}

/**
 * Pharma → Stock (rediseño "Mejora visual Medicamentos" + agrupación por medicamento).
 *
 * Menú de apartado (Screen A): Protocolo (agrupado por protocolo, con card macro de IP por grupo),
 * Ambulatoria (sin protocolo) y Catálogo (todo el catálogo global, sin lote). Los datos vienen POR
 * LOTE de la vista `v_medication_lots_detail` (0041); el IP sigue macro (v_ip_stock, 0038), NO se
 * reabre el fundacional. El estado de vencimiento se comunica con ícono de FORMA + color (WCAG 1.4.1).
 *
 * ── La lista tiene DOS formas de fila ────────────────────────────────────────────────────────
 *
 *   medicamento con 1 lote        medicamento con N lotes (plegable)
 *   ┌──────────────────────┐      ┌──────────────────────────────────┐
 *   │ ▣ Symbicort … 9 u.  ⋮│      │ ⌄ ▣ Alvetide  2 lotes  —  9 u. ⋮│ ← resumen (button)
 *   └──────────────────────┘      ├──────────────────────────────────┤
 *        <LoteRow>                │   ├─● TEST01    · 4 u.          ⋮│ ← <LotRow> con conector
 *                                 │   └─● DFA-6545  · 5 u.          ⋮│
 *                                 └──────────────────────────────────┘
 *                                              <MedGroup>
 *
 *   Las tres comparten los MISMOS anchos de columna y tienen exactamente UN ítem flexible antes
 *   de ellas (el nombre, o el spacer `.spira-lot-indent`), así el inicio de la columna EAN cae
 *   siempre en la misma X. La geometría del conector vive en `tokens.css` (`--spira-stock-*`),
 *   compartida entre el CSS y los estilos de acá — ver el comentario de esa sección.
 *
 * ── Grano de las acciones ────────────────────────────────────────────────────────────────────
 *
 *   El EAN13 es UNO por medicamento, así que sus acciones viven en el resumen del grupo; ajustar
 *   stock necesita un lote concreto, así que vive en cada fila de lote. Una fila plana es las dos
 *   cosas a la vez (un medicamento de un solo lote) y por eso lleva el menú completo.
 *
 * Las reglas puras —agrupar, heredar el peor estado, cuándo abrir— viven en `./stock/agrupacion`
 * con sus tests: son lo que falla en silencio.
 */
export function MedicamentosView({ module, submodule, setHeader }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  const { hasMinRole } = useAuth()
  const canManage = hasMinRole('pharma', 'leader')

  /* El apartado es un LUGAR (2026-08-24): vive en el path, no en el query. `menu` es la ausencia de
     segmento. Abrir un apartado apila (push, el atrás vuelve al menú); volver al menú reemplaza (si
     apilara, el atrás reabriría el apartado que acabás de cerrar) — la misma distinción que ya
     resolvía `useUrlEntity` para una entidad abierta, acá con dos wrappers de `setPath` en vez de dos
     instancias de `useUrlState`. */
  const [path, setPath] = useUrlPath()
  const apartadoResuelto = apartadoDesdePath(path)
  const apartado: Apartado = apartadoResuelto ?? 'menu'
  const apartadoRoto = apartadoResuelto === null
  const abrirApartado = (siguiente: Apartado) =>
    setPath([siguiente], { conservar: FILTROS_STOCK, mode: 'push' })
  const [filtro, setFiltro] = useUrlState<EstadoFilter>('estado', 'todos', {
    codec: oneOf(['todos', 'vigentes', 'pronto', 'vencido'] as const),
  })
  const [busqueda, setBusqueda] = useUrlState('buscar', '')
  /* La URL habla CÓDIGOS (dictables); la lógica interna sigue con ids. La traducción vive sólo en
     este borde, así el filtrado, los menús y las queries no se enteran. */
  const [protoCodes, setProtoCodes] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [dropdownId, setDropdownId] = useState<string | null>(null)
  /* Plegado de los grupos de medicamento. `abiertoPorDefecto` es una SUGERENCIA (se abre solo lo
     que tiene un vencido, un por-vencer o un match de búsqueda); esto guarda los toggles que el
     usuario hizo a mano, que le ganan. Van junto a la `clave` que los produjo: cuando cambia la
     búsqueda o el filtro la pregunta es otra, así que los overrides se descartan y la sugerencia
     vuelve a mandar — si no, cerrar un grupo una vez escondería para siempre un lote que vence la
     semana que viene. El reseteo se resuelve al leer (más abajo), sin efecto ni sincronización. */
  const [plegado, setPlegado] = useState<{ clave: string; manual: Record<string, boolean> }>({ clave: '', manual: {} })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MedicationRow | null>(null)
  const [deleting, setDeleting] = useState<MedicationRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<{ medicationId: string; name: string; mode: 'asignar' | 'modificar'; currentCode?: string | null } | null>(null)
  const [ajuste, setAjuste] = useState<{ lotId: string; name: string; lotLabel: string } | null>(null)

  const protocols = useProtocols()
  const protoSel = useMemo(
    () => protoCodes.map((c) => resolveCode(protocols.data ?? [], c, (p) => p.code)?.id).filter((id): id is string => !!id),
    [protoCodes, protocols.data],
  )
  const setProtoSel = (ids: string[]) =>
    setProtoCodes(ids.map((id) => (protocols.data ?? []).find((p) => p.id === id)?.code).filter((c): c is string => !!c))
  const protoLots = useProtocolLots()
  const ambuLots = useAmbulatoriaLots()
  const ipAll = useIpStockAll()
  const catalog = useMedications()
  const codes = useMedicationCodes()

  const codeByMed = useMemo(() => {
    const m = new Map<string, string>()
    // first-wins sobre codes ordenados por created_at → mismo código (el más viejo) que la vista 0041.
    for (const c of codes.data ?? []) if (!m.has(c.medication_id)) m.set(c.medication_id, c.code)
    return m
  }, [codes.data])

  // Cerrar el kebab con Escape (además del click afuera, ver el backdrop del popover).
  useEffect(() => {
    if (dropdownId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropdownId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dropdownId])

  const goMenu = useCallback(() => {
    setPath([], { conservar: FILTROS_STOCK, mode: 'replace' })
    setBusqueda(''); setFiltro('todos'); setProtoCodes([]); setDropdownId(null)
  }, [setPath])
  const refetchAll = () => { protoLots.refetch(); ambuLots.refetch(); catalog.refetch(); codes.refetch() }

  // Encabezado contextual: el shell ya pone breadcrumb + título ("Stock") + botón de acción.
  // La vista suma la miga del apartado, hace "Stock" clickeable (vuelve al menú) y cablea
  // "Agregar medicamento" (gating leader). En el menú, header genérico. Se limpia al desmontar.
  useEffect(() => {
    if (!setHeader) return
    const label = APARTADO_LABEL[apartado]
    if (label) {
      setHeader({
        rootOnClick: goMenu,
        crumbs: [{ label }],
        actions: canManage ? [{ key: 'nuevo', label: 'Agregar medicamento', icon: 'plus', primary: true, onClick: () => setCreating(true) }] : undefined,
      })
    } else {
      setHeader(null)
    }
    return () => setHeader(null)
  }, [setHeader, apartado, canManage, goMenu])

  // Un segmento que no es ninguno de los tres apartados (`/farmacia/stock/inventado`): pantalla
  // serena DENTRO del marco, igual que ProtocolsView ante un código de protocolo inexistente. NO cae
  // al menú en silencio — eso escondería que el link estaba roto.
  if (apartadoRoto) return <NotFoundView motivo="ruta" />

  const openEdit = (row: MedicationRow) => { setDropdownId(null); setEditing(row) }
  const openEliminar = (row: MedicationRow) => { setDropdownId(null); setDeleting(row) }
  const openCodigo = (medicationId: string, name: string, current: string | null) => {
    setDropdownId(null)
    setCodigo({ medicationId, name, mode: current ? 'modificar' : 'asignar', currentCode: current })
  }
  const openAjuste = (row: LotDetailRow) => {
    setDropdownId(null)
    const venc = row.expiry_date ? ` · vence ${formatFecha(row.expiry_date)}` : ''
    setAjuste({ lotId: row.lot_id, name: row.name, lotLabel: `${row.lot_number}${venc} · ${row.quantity_on_hand} en stock` })
  }

  // ── Screen A: menú de apartado ──────────────────────────────────────────────
  if (apartado === 'menu') {
    const nProto = protocols.data?.length ?? 0
    const nAmbu = new Set((ambuLots.data ?? []).map((l) => l.medication_id)).size
    const nCat = catalog.data?.length ?? 0
    return (
      <div style={wrap}>
        <div className="spira-eyebrow">Elegí el apartado</div>
        <div style={menuGrid}>
          <ApartadoCard
            icon="file" tint="rgba(15, 95, 87,.14)" iconColor="var(--spira-pharma-solid)"
            title="Farmacia Protocolo" desc="Medicación de estudio, por protocolo"
            counter={`${nProto} ${nProto === 1 ? 'protocolo' : 'protocolos'}`}
            onClick={() => abrirApartado('protocolo')}
          />
          <ApartadoCard
            icon="pill" tint="rgba(58,107,140,.12)" iconColor="var(--spira-contable)"
            title="Farmacia Ambulatoria" desc="Farmacia general, listado plano"
            counter={`${nAmbu} ${nAmbu === 1 ? 'medicamento' : 'medicamentos'}`}
            onClick={() => abrirApartado('ambulatoria')}
          />
          <ApartadoCard
            icon="list" tint="rgba(15,95,87,.10)" iconColor="var(--spira-primary)"
            title="Catálogo" desc="Todo el catálogo global"
            counter={`${nCat} ${nCat === 1 ? 'medicamento' : 'medicamentos'}`}
            onClick={() => abrirApartado('catalogo')}
          />
        </div>
      </div>
    )
  }

  // Buscador con la identidad de las listas del día (Visitas): caja de 38 de alto y radio 10 —
  // la misma altura que los disparadores de filtro— con la lupa adentro y una "x" para limpiar.
  const buscador = (placeholder: string) => (
    <div style={searchWrap}>
      <Icon name="search" size={15} color="var(--spira-faint)" />
      <input
        className="spira-bare-input"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={placeholder}
        style={searchInput}
      />
      {busqueda && (
        <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" style={searchClear}>
          <Icon name="x" size={13} color="var(--spira-faint)" />
        </button>
      )}
    </div>
  )

  const modals = (
    <>
      {creating && (
        <NewMedicationForm
          accentSolid={accentSolid}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refetchAll() }}
        />
      )}
      {/* Editar: se oculta mientras la confirmación de borrado está abierta (un modal a la vez → sin
          doble Escape). Cancelar el borrado vuelve acá; borrar exitoso cierra ambos. */}
      {editing && !deleting && (
        <NewMedicationForm
          accentSolid={accentSolid}
          editing={editing}
          currentCode={codeByMed.get(editing.id) ?? null}
          onClose={() => setEditing(null)}
          onCreated={() => { setEditing(null); refetchAll() }}
          onDelete={canManage ? () => setDeleting(editing) : undefined}
        />
      )}
      {deleting && (
        <DeleteMedicationModal
          row={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(nombre) => { setDeleting(null); setEditing(null); setToast(`${nombre} se eliminó del catálogo`); refetchAll() }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {codigo && (
        <CodigoModal
          accentSolid={accentSolid}
          medicationId={codigo.medicationId}
          medicationName={codigo.name}
          mode={codigo.mode}
          currentCode={codigo.currentCode}
          onClose={() => setCodigo(null)}
          onSaved={() => { setCodigo(null); refetchAll() }}
        />
      )}
      {ajuste && (
        <AdjustStockModal
          accentSolid={accentSolid}
          lotId={ajuste.lotId}
          lotLabel={ajuste.lotLabel}
          medicationName={ajuste.name}
          onClose={() => setAjuste(null)}
          onAdjusted={() => { setAjuste(null); refetchAll() }}
        />
      )}
    </>
  )

  // ── Screen Catálogo: todos los medicamentos (sin lote) ──────────────────────
  if (apartado === 'catalogo') {
    return (
      <div style={wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{buscador('Nombre, droga o código…')}</div>
        <ListStatus q={catalog} onRetry={() => catalog.refetch()} accent={accent} icon={submodule.icon} vacio="No hay medicamentos en el catálogo.">
          {(rows: MedicationRow[]) => {
            const cats = rows.filter((m) => matchTexto(busqueda, m.name, m.drug?.name ?? null, codeByMed.get(m.id) ?? null))
            return cats.length === 0
              ? <EmptyState accent={accent} icon={submodule.icon} title="Sin resultados" description="Ningún medicamento coincide con la búsqueda." />
              : (
                <>
                  <SectionHeader
                    eyebrow="Todos los medicamentos · catálogo global"
                    cuenta={`${cats.length} ${cats.length === 1 ? 'medicamento' : 'medicamentos'}`}
                  />
                  <div style={lista}>
                    {cats.map((m) => (
                      <CatalogoRow
                        key={m.id} row={m} code={codeByMed.get(m.id) ?? null}
                        canManage={canManage} dropdownId={dropdownId} setDropdownId={setDropdownId}
                        onEdit={openEdit} onCodigo={openCodigo} onEliminar={openEliminar}
                      />
                    ))}
                  </div>
                </>
              )
          }}
        </ListStatus>
        {modals}
      </div>
    )
  }

  // ── Screens Protocolo / Ambulatoria: medicamentos con sus lotes ─────────────
  const q = apartado === 'protocolo' ? protoLots : ambuLots

  /* El plegado manual sólo vale mientras la pregunta sea la misma. Resolverlo acá, al leer, evita
     un `useEffect` que sincronice: si la clave cambió, `manual` sale vacío y nadie tuvo que
     acordarse de limpiarlo. */
  const clavePlegado = claveDePlegado(busqueda, filtro)
  const manualPlegado = plegado.clave === clavePlegado ? plegado.manual : {}
  const toggleGrupo = (medicationId: string, abiertoAhora: boolean) => {
    setDropdownId(null)
    setPlegado({ clave: clavePlegado, manual: { ...manualPlegado, [medicationId]: !abiertoAhora } })
  }
  const grupoProps = {
    canManage, dropdownId, setDropdownId, busqueda,
    onCodigo: openCodigo, onCopiar: copyText, onAjustar: openAjuste,
    manual: manualPlegado, onToggle: toggleGrupo,
  }

  /* Fila de filtros con la identidad de las listas del día (Visitas): disparadores de 38 de alto y
     radio 10, rótulo FIJO, el número adentro de un badge y el buscador a la derecha. El vencimiento
     sigue siendo de UNA opción por vez (era una fila de chips) → `FilterDropdown`, el hermano
     single-select; el de protocolos es multi → `MultiFilterMenu`, con buscador porque lista todos
     los protocolos del centro. Los dos se sueltan igual (`deselectable`): volver a pulsar la opción
     activa del vencimiento vuelve a "Todo el stock", como destildar un protocolo.
     Los conteos se cuentan sobre TODOS los lotes del apartado, no sobre lo ya filtrado: dicen
     cuántos hay, no cuántos quedarían. Mientras la consulta carga van en `null` (sin dato) y no
     en 0, que sería afirmar que no hay ninguno. */
  const lotes = q.data ?? null
  const contarVto = (e: Estado) => (lotes ? lotes.filter((r: LotDetailRow) => estadoDe(r) === e).length : null)
  const vtoOptions: FilterOption[] = [
    { value: 'todos', label: 'Todo el stock', count: null },
    { value: 'vigentes', label: 'Vigentes', count: contarVto('ok') },
    { value: 'pronto', label: 'Vence pronto', count: contarVto('pronto') },
    { value: 'vencido', label: 'Vencidos', count: contarVto('vencido') },
  ]
  // Código + nombre en la etiqueta (no solo el código, como en Visitas): es lo que ya mostraba el
  // filtro viejo y además hace que el buscador del menú encuentre por cualquiera de los dos.
  const protoOptions: MultiFilterOption[] = (protocols.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))
  const nFiltros = (filtro === 'todos' ? 0 : 1) + protoSel.length

  return (
    <div style={wrap}>
      {/* Selector de protocolos: la puerta de entrada visual a la tabla de abajo. NO es un segundo
          filtro — escribe el MISMO `protoCodes` que el desplegable del toolbar, que ya vive en la
          URL. Tildar una tarjeta es tildar esa opción del menú, y al revés: dos maneras de tocar
          un solo interruptor, no dos fuentes de verdad. */}
      {apartado === 'protocolo' && (
        <ProtocoloCards
          protocols={protocols.data ?? []}
          lotes={protoLots.data ?? []}
          ipAll={ipAll.data ?? []}
          seleccionados={protoSel}
          accentSolid={accentSolid}
          onToggle={(id) => setProtoSel(protoSel.includes(id) ? protoSel.filter((x) => x !== id) : [...protoSel, id])}
        />
      )}

      {/* El buscador ABRE la fila, y los filtros van pegados a la derecha (el `marginRight: auto`
          de `searchWrap`). Estaba al revés —filtros a la izquierda, buscador empujado al final—, y
          eso lo dejaba en dos lugares distintos dentro de la MISMA vista: en Catálogo, que no tiene
          filtros, abría la fila. Buscar y filtrar son dos oficios: el de la izquierda encuentra una
          fila, los de la derecha recortan el conjunto. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {buscador('Nombre, droga, lote o código…')}
        <FilterDropdown
          accent={accentSolid}
          value={filtro}
          onChange={(v) => setFiltro(v as EstadoFilter)}
          options={vtoOptions}
          menuLabel="Vencimiento"
          icon="calendar"
          deselectable
        />
        {apartado === 'protocolo' && (
          <MultiFilterMenu
            accent={accentSolid}
            label="Protocolo"
            icon="file"
            options={protoOptions}
            selected={protoSel}
            onChange={setProtoSel}
            searchPlaceholder="Buscar protocolo…"
          />
        )}
        {nFiltros > 0 && (
          <button type="button" onClick={() => { setFiltro('todos'); setProtoSel([]) }} style={clearBtn}>
            <Icon name="x" size={13} color="var(--spira-muted)" /> Limpiar {nFiltros}
          </button>
        )}
      </div>

      <ListStatus q={q} onRetry={() => q.refetch()} accent={accent} icon={submodule.icon} vacio="Todavía no hay lotes en stock (se cargan al recibir).">
        {(rows: LotDetailRow[]) => {
          // Los grupos se arman UNA vez sobre todos los lotes del apartado; `construirGrupos`
          // resuelve adentro la asimetría entre buscar (selecciona) y filtrar (recorta).
          const grupos = construirGrupos(rows, busqueda, filtro)
          if (apartado === 'ambulatoria') {
            // Ambulatoria no tiene protocolo, pero SÍ agrupa por medicamento: la vista no puede
            // tener dos gramáticas de fila según por qué apartado entraste.
            return grupos.length === 0
              ? <EmptyState accent={accent} icon={submodule.icon} title="Sin lotes" description="No hay lotes que coincidan con el filtro o la búsqueda." />
              : (
                <>
                  <SectionHeader eyebrow="Todos los medicamentos" cuenta={contarGrupos(grupos)} />
                  <div style={lista}>{grupos.map((g) => <GrupoFila key={g.medicationId} grupo={g} {...grupoProps} />)}</div>
                </>
              )
          }
          // Protocolo: agrupar por protocolo, con card IP por grupo.
          return <ProtocoloGroups
            grupos={grupos}
            protocols={protocols.data ?? []}
            ipAll={ipAll.data ?? []}
            sinFiltro={busqueda.trim() === '' && filtro === 'todos'}
            soloProtos={protoSel}
            accent={accent} icon={submodule.icon} grupoProps={grupoProps}
          />
        }}
      </ListStatus>
      {modals}
    </div>
  )
}

/* ── Derivación de estado (WCAG 1.4.1: forma + color, no color solo) ────────── */
/* `estadoDe` y el resto de las reglas viven en ./stock/agrupacion (con tests). ESTADO_CFG
   (forma+color) y el umbral de "vence pronto" viven en ./expiryState, compartidos con el
   detalle de Recepción. */
function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const p = iso.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso
}
async function copyText(text: string) {
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); return }
  } catch { /* fallback abajo */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy') } catch { /* sin-op */ }
  document.body.removeChild(ta)
}

/* ── Estado de una lista (loading / error / vacío) reusando el patrón del Core ─ */
interface ListStatusProps<T> {
  q: { data: T[] | null; loading: boolean; error: string | null }
  onRetry: () => void
  accent: string
  icon: IconName
  vacio: string
  children: (rows: T[]) => ReactNode
}
function ListStatus<T>({ q, onRetry, accent, icon, vacio, children }: ListStatusProps<T>) {
  if (q.loading) return <EmptyState accent={accent} icon={icon} title="Cargando…" description="Un momento." />
  if (q.error) {
    return (
      <>
        <div style={errorBox}><Icon name="alertCircle" size={18} color="var(--spira-danger)" /> No pudimos cargar los datos.</div>
        <button onClick={onRetry} style={btnOutline}>Reintentar</button>
      </>
    )
  }
  const rows = q.data ?? []
  if (rows.length === 0) return <EmptyState accent={accent} icon={icon} title="Sin medicamentos" description={vacio} />
  return <>{children(rows)}</>
}

/* ── Grupos por protocolo (Screen B) ───────────────────────────────────────── */
interface ProtoGroupsProps {
  /** Grupos de MEDICAMENTO ya armados y filtrados; acá sólo se reparten por protocolo. */
  grupos: GrupoVisible[]
  protocols: { id: string; code: string; name: string }[]
  ipAll: { protocol_id: string; total_kits: number; recepciones: number }[]
  sinFiltro: boolean
  /** IDs de protocolo seleccionados en el filtro; vacío = todos. */
  soloProtos: string[]
  accent: string
  icon: IconName
  grupoProps: GrupoProps
}
function ProtocoloGroups({ grupos, protocols, ipAll, sinFiltro, soloProtos, accent, icon, grupoProps }: ProtoGroupsProps) {
  const protoById = new Map(protocols.map((p) => [p.id, p]))
  const ipByProto = new Map(ipAll.filter((r) => r.total_kits > 0).map((r) => [r.protocol_id, r]))
  const lotesByProto = new Map<string, GrupoVisible[]>()
  for (const g of grupos) {
    if (!g.protocolId) continue
    const arr = lotesByProto.get(g.protocolId) ?? []
    arr.push(g); lotesByProto.set(g.protocolId, arr)
  }
  // Grupos: protocolos con lotes filtrados; + protocolos con IP (solo sin filtro activo, para no
  // mostrar grupos vacíos de lotes mientras se filtra).
  const ids = new Set<string>(lotesByProto.keys())
  if (sinFiltro) for (const id of ipByProto.keys()) ids.add(id)
  const ordered = [...ids].sort((a, b) => (protoById.get(a)?.code ?? '').localeCompare(protoById.get(b)?.code ?? ''))
  // Filtro de protocolos (multi-select del toolbar): vacío = todos.
  const shown = soloProtos.length ? ordered.filter((id) => soloProtos.includes(id)) : ordered

  if (shown.length === 0) return <EmptyState accent={accent} icon={icon} title="Sin resultados" description={soloProtos.length ? 'Ningún protocolo seleccionado tiene lotes que coincidan.' : 'No hay lotes que coincidan con el filtro o la búsqueda.'} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {shown.map((pid) => {
        const proto = protoById.get(pid)
        const delProto = lotesByProto.get(pid) ?? []
        const ip = ipByProto.get(pid)
        return (
          <div key={pid} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={groupIconSq}><Icon name="file" size={14} color="var(--spira-pharma-solid)" /></span>
              <span className="spira-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)' }}>{proto?.code ?? '—'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{proto?.name ?? ''}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
              <span style={{ fontSize: 11, color: 'var(--spira-muted)' }}>{contarGrupos(delProto)}</span>
            </div>
            {ip && <IpCard totalKits={ip.total_kits} recepciones={ip.recepciones} />}
            <div style={lista}>{delProto.map((g) => <GrupoFila key={g.medicationId} grupo={g} {...grupoProps} />)}</div>
          </div>
        )
      })}
    </div>
  )
}

function IpCard({ totalKits, recepciones }: { totalKits: number; recepciones: number }) {
  return (
    <div style={ipCard}>
      <span style={ipIconSq}><Icon name="flask" size={18} color="var(--spira-primary)" stroke={1.9} /></span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--spira-acc-deep-track)' }}>Producto de Investigación</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{totalKits}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{totalKits === 1 ? 'kit' : 'kits'} en stock</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 1 }}>
          {recepciones} {recepciones === 1 ? 'recepción' : 'recepciones'} · trazabilidad por kit en el sistema del sponsor (IRT)
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, cuenta }: { eyebrow: string; cuenta: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: -2 }}>
      <span className="spira-eyebrow">{eyebrow}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
      <span style={{ fontSize: 11, color: 'var(--spira-muted)' }}>{cuenta}</span>
    </div>
  )
}

/* ── Selector de protocolos (grilla de tarjetas sobre la tabla) ─────────────── */
interface ProtocoloCardsProps {
  protocols: ProtocolRow[]
  /** TODOS los lotes del apartado, sin filtrar: las tarjetas dicen qué hay, no qué quedaría. */
  lotes: LotDetailRow[]
  ipAll: { protocol_id: string; total_kits: number; recepciones: number }[]
  seleccionados: string[]
  accentSolid: string
  onToggle: (protocolId: string) => void
}
/**
 * Misma anatomía que la tarjeta de protocolo de Pacientes (código, estado, nombre, divisor, pie),
 * con el dato que importa acá: kits de IP o medicamentos/lotes en stock.
 *
 * NO navega y NO tiene un filtro propio: tildar una tarjeta tilda ese protocolo en el mismo
 * multi-select del toolbar, que ya vive en la URL. Por eso el pie dice "Ver sólo este" y no lleva
 * un chevron — un chevron prometería una pantalla a la que ir, y acá el clic recorta la tabla de
 * abajo.
 *
 * Se listan sólo los protocolos que TIENEN algo (lotes o kits): "Farmacia es central y ve todos"
 * no significa empapelar la pantalla con veinte tarjetas vacías.
 */
function ProtocoloCards({ protocols, lotes, ipAll, seleccionados, accentSolid, onToggle }: ProtocoloCardsProps) {
  const porProto = new Map<string, LotDetailRow[]>()
  for (const l of lotes) {
    if (!l.protocol_id) continue
    const arr = porProto.get(l.protocol_id) ?? []
    arr.push(l); porProto.set(l.protocol_id, arr)
  }
  const ipByProto = new Map(ipAll.filter((r) => r.total_kits > 0).map((r) => [r.protocol_id, r]))
  const conStock = protocols
    .filter((p) => porProto.has(p.id) || ipByProto.has(p.id))
    .sort((a, b) => a.code.localeCompare(b.code))
  if (conStock.length === 0) return null

  const hint = seleccionados.length === 0
    ? 'Elegí uno para enfocar la tabla de abajo'
    : `Mostrando ${seleccionados.length} de ${conStock.length}`

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="spira-eyebrow">Protocolos con stock</span>
        <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
        <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{hint}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {conStock.map((p) => {
          const sel = seleccionados.includes(p.id)
          const delProto = porProto.get(p.id) ?? []
          const ip = ipByProto.get(p.id)
          const nMeds = new Set(delProto.map((l) => l.medication_id)).size
          const nBajos = delProto.filter((l) => nivelDeCantidad(l.quantity_on_hand) !== 'ok').length
          const unidades = stockTotal(delProto)
          // Un protocolo puede tener IP y lotes a la vez. El titular es lo que más pesa (los kits,
          // si hay), y la segunda línea nunca omite lo otro.
          const titular = ip
            ? `${ip.total_kits} ${ip.total_kits === 1 ? 'kit' : 'kits'} en stock`
            : `${nMeds} ${nMeds === 1 ? 'medicamento' : 'medicamentos'} · ${delProto.length} ${delProto.length === 1 ? 'lote' : 'lotes'}`
          /* "IRT" a secas y no "IRT del sponsor": con un protocolo que además tiene lotes, la
             línea entera no entra en los ~286px de la tarjeta y se corta con puntos suspensivos
             (medido con datos reales en la notebook de referencia). La frase completa está a un
             renglón de distancia, en la card de IP de la tabla de abajo. */
          const partes: string[] = []
          if (ip) partes.push(`${ip.recepciones} ${ip.recepciones === 1 ? 'recepción' : 'recepciones'} · IRT`)
          if (ip && delProto.length > 0) partes.push(`${delProto.length} ${delProto.length === 1 ? 'lote' : 'lotes'} más`)
          if (!ip) partes.push(nBajos > 0 ? `${nBajos} en stock bajo o agotado` : `${unidades} u. en stock`)
          return (
            <button
              key={p.id}
              type="button"
              className="spira-card-link"
              aria-pressed={sel}
              onClick={() => onToggle(p.id)}
              style={{
                ...protoCard,
                /* Seleccionado se señala con COLOR (borde + tinte), no con elevación: la
                   elevación ya es el hover, y una tarjeta enfocada tiene que verse distinta con
                   el mouse en cualquier lado. Mismo idioma que `MultiFilterMenu`.
                   `accentSolid + '12'` es válido porque llega como hex crudo de `registry.ts`,
                   no como `var(--…)` — con un token habría que usar `color-mix`. */
                borderColor: sel ? accentSolid : undefined,
                background: sel ? accentSolid + '12' : 'var(--spira-white)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: accentSolid }}>{p.code}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: protocolStatusVar(p.status) }} />
                  {protocolStatusLabel(p.status)}
                </span>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ height: 1, background: 'var(--spira-line)', margin: '2px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ ...pillSq, width: 36, height: 36, borderRadius: 10, background: ip ? 'rgba(15,95,87,.12)' : 'rgba(15,95,87,.06)' }}>
                  <Icon name={ip ? 'flask' : 'pill'} size={18} color="var(--spira-primary)" stroke={1.8} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{titular}</div>
                  <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partes.join(' · ')}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, fontSize: 12, fontWeight: 600, color: sel ? accentSolid : 'var(--spira-muted)' }}>
                {sel && <Icon name="check" size={14} color={accentSolid} stroke={2.6} />}
                {sel ? 'Enfocado' : 'Ver sólo este'}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ── Card del menú de apartado ──────────────────────────────────────────────── */
function ApartadoCard({ icon, tint, iconColor, title, desc, counter, onClick }: {
  icon: IconName; tint: string; iconColor: string; title: string; desc: string; counter: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={apartadoCard}>
      <span style={{ width: 44, height: 44, borderRadius: 13, background: tint, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={20} color={iconColor} stroke={1.9} />
      </span>
      <div className="spira-display" style={{ fontSize: 18, fontWeight: 700, color: 'var(--spira-ink)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--spira-muted)', marginTop: 2 }}>{desc}</div>
      <div style={{ borderTop: '1px solid var(--spira-line)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>{counter}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: iconColor, display: 'flex', alignItems: 'center', gap: 4 }}>Entrar <Icon name="arrowRight" size={14} color={iconColor} /></span>
      </div>
    </button>
  )
}

/* ── Fila del catálogo (sin lote): datos + código + kebab (Editar / Código / Eliminar) ── */
interface CatalogoRowProps {
  row: MedicationRow
  code: string | null
  canManage: boolean
  dropdownId: string | null
  setDropdownId: (id: string | null) => void
  onEdit: (row: MedicationRow) => void
  onCodigo: (medicationId: string, name: string, current: string | null) => void
  onEliminar: (row: MedicationRow) => void
}
function CatalogoRow({ row, code, canManage, dropdownId, setDropdownId, onEdit, onCodigo, onEliminar }: CatalogoRowProps) {
  const sub = [row.drug?.name, row.dosis, row.unit].filter(Boolean).join(' · ')
  const abierto = dropdownId === row.id
  const hasCode = !!code
  const { anchorRef, pos } = useAnchoredPopover(abierto, 244)
  return (
    <div style={rowCard}>
      <span style={pillSq}><Icon name="pill" size={18} color="var(--spira-pharma-solid)" stroke={1.9} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--spira-ink)' }}>{row.name}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <EanCell code={code} busqueda="" onAsignar={() => onCodigo(row.id, row.name, code)} />
      <div style={{ position: 'relative', flex: '0 0 auto' }}>
        <button ref={anchorRef} aria-label="Acciones" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setDropdownId(abierto ? null : row.id)} style={kebabBtn}>
          <Icon name="moreVertical" size={16} color="var(--spira-muted)" />
        </button>
        {abierto && (
          <>
            <div onClick={() => setDropdownId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            {pos && (
              <div role="menu" style={{ ...popover, top: pos.top, left: pos.left }}>
                {canManage && <KebabItem icon="pencil" onClick={() => onEdit(row)}>Editar medicamento</KebabItem>}
                <KebabItem icon="barcode" onClick={() => onCodigo(row.id, row.name, code)}>
                  {hasCode ? 'Modificar código' : 'Asignar código'}
                </KebabItem>
                {canManage && <><div style={kebabDivider} /><KebabItem icon="trash" danger onClick={() => onEliminar(row)}>Eliminar del catálogo</KebabItem></>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Filas de la lista (Protocolo / Ambulatoria) ────────────────────────────── */
interface RowProps {
  canManage: boolean
  dropdownId: string | null
  setDropdownId: (id: string | null) => void
  onCodigo: (medicationId: string, name: string, current: string | null) => void
  onCopiar: (text: string) => void
  onAjustar: (row: LotDetailRow) => void
}
interface GrupoProps extends RowProps {
  busqueda: string
  /** Toggles manuales del usuario; le ganan a `abiertoPorDefecto` (ver `claveDePlegado`). */
  manual: Record<string, boolean>
  onToggle: (medicationId: string, abiertoAhora: boolean) => void
}

/**
 * Elige la forma de la fila. Un medicamento de un solo lote no tiene nada que plegar y se dibuja
 * plano; con más de uno va el grupo. El criterio mira `totalLotes` y no los lotes VISIBLES: si el
 * filtro dejó uno solo a la vista, el grupo tiene que seguir existiendo para poder decir "1 de 3
 * lotes" — si no, el filtro escondería dos lotes sin avisar.
 */
function GrupoFila({ grupo, ...props }: { grupo: GrupoVisible } & GrupoProps) {
  if (!esPlegable(grupo)) {
    return <LoteRow row={grupo.lotes[0]} {...props} />
  }
  return <MedGroup grupo={grupo} {...props} />
}

/* ── Medicamento con varios lotes: resumen plegable + lotes con conector ────── */
function MedGroup({ grupo, busqueda, manual, onToggle, canManage, dropdownId, setDropdownId, onCodigo, onCopiar, onAjustar }: { grupo: GrupoVisible } & GrupoProps) {
  const abierto = manual[grupo.medicationId] ?? grupo.abiertoPorDefecto
  const est = estadoDelGrupo(grupo.lotes)
  const cfg = ESTADO_CFG[est]
  const venc = vencimientoDelGrupo(grupo.lotes)
  const total = stockTotal(grupo.lotes)
  const hasCode = !!grupo.code
  return (
    <div className="spira-medgroup">
      {/* El disparador es un <button> y el kebab su HERMANO: un botón adentro de otro es HTML
          inválido y el navegador lo descarta. Además así el gesto grande (desplegar) tiene
          Enter/Espacio/foco nativos, sin reimplementarlos. */}
      <div className="spira-medgroup__head">
        <button
          type="button"
          className="spira-medgroup__summary spira-no-press"
          aria-expanded={abierto}
          onClick={() => onToggle(grupo.medicationId, abierto)}
        >
          <span className="spira-medgroup__chev">
            <Icon name="chevronRight" size={15} color="var(--spira-muted)" stroke={2} />
          </span>
          <span style={pillSq}><Icon name="pill" size={18} color="var(--spira-pharma-solid)" stroke={1.9} /></span>
          <NombreCol nombre={grupo.name} droga={grupo.drugName} busqueda={busqueda} />
          <div style={colEan}>
            <div className="spira-eyebrow">Código EAN13</div>
            <EanCell code={grupo.code} busqueda={busqueda} />
          </div>
          <div style={colLote}>
            <div className="spira-eyebrow">Lote</div>
            <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3 }}>{etiquetaLotes(grupo)}</div>
          </div>
          {/* El resumen hereda el PEOR estado y la fecha MÁS PRÓXIMA de sus lotes: un vencido
              escondido detrás de uno sano no puede depender de que alguien despliegue. */}
          <VencCol iso={venc} cfg={cfg} />
          <StockCell qty={total} nivel={nivelDelGrupo(grupo.lotes)} />
        </button>
        {/* Acciones del MEDICAMENTO. El EAN13 es uno por medicamento, así que vive acá y no
            repetido en cada lote; ajustar stock necesita un lote y vive abajo. */}
        <KebabMenu id={`med:${grupo.medicationId}`} dropdownId={dropdownId} setDropdownId={setDropdownId}>
          <KebabItem icon="barcode" onClick={() => { setDropdownId(null); onCodigo(grupo.medicationId, grupo.name, grupo.code) }}>
            {hasCode ? 'Modificar código' : 'Asignar código'}
          </KebabItem>
          <KebabItem icon="plus" disabled>Agregar variante comercial<PillPronto /></KebabItem>
          {hasCode && <KebabItem icon="copy" onClick={() => { setDropdownId(null); onCopiar(grupo.code as string) }}>Copiar EAN13</KebabItem>}
        </KebabMenu>
      </div>
      {abierto && (
        <div className="spira-lot-rows">
          {grupo.lotes.map((r) => (
            <LotRow key={r.lot_id} row={r} busqueda={busqueda} canManage={canManage}
              dropdownId={dropdownId} setDropdownId={setDropdownId} onAjustar={onAjustar} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Fila de lote DENTRO de un grupo: sin nombre, con el conector de árbol ──── */
function LotRow({ row, busqueda, canManage, dropdownId, setDropdownId, onAjustar }: {
  row: LotDetailRow
  busqueda: string
  canManage: boolean
  dropdownId: string | null
  setDropdownId: (id: string | null) => void
  onAjustar: (row: LotDetailRow) => void
}) {
  const cfg = ESTADO_CFG[estadoDe(row)]
  return (
    <div className="spira-lot-row">
      {/* Único ítem flexible de la fila (como `.name` en las otras dos) y soporte del conector. */}
      <div className="spira-lot-indent" />
      <div style={colEan}>
        <div className="spira-eyebrow">Código EAN13</div>
        <EanCell code={row.code} busqueda={busqueda} onAsignar={undefined} />
      </div>
      <div style={colLote}>
        <div className="spira-eyebrow">Lote</div>
        <div className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-ink)', marginTop: 3 }}>
          <Resaltado texto={row.lot_number} busqueda={busqueda} />
        </div>
      </div>
      <VencCol iso={row.expiry_date} cfg={cfg} />
      <StockCell qty={row.quantity_on_hand} nivel={nivelDeCantidad(row.quantity_on_hand)} />
      <KebabMenu id={row.lot_id} dropdownId={dropdownId} setDropdownId={setDropdownId}>
        {canManage
          ? <KebabItem icon="pencil" onClick={() => onAjustar(row)}>Ajustar stock</KebabItem>
          : <KebabItem icon="pencil" disabled>Ajustar stock</KebabItem>}
      </KebabMenu>
    </div>
  )
}

/* ── Medicamento de UN solo lote: fila plana, con el menú completo ──────────── */
function LoteRow({ row, busqueda, canManage, dropdownId, setDropdownId, onCodigo, onCopiar, onAjustar }: { row: LotDetailRow; busqueda: string } & RowProps) {
  const cfg = ESTADO_CFG[estadoDe(row)]
  const hasCode = !!row.code
  return (
    <div style={rowCard}>
      <span style={pillSq}><Icon name="pill" size={18} color="var(--spira-pharma-solid)" stroke={1.9} /></span>
      <NombreCol nombre={row.name} droga={row.drug_name} busqueda={busqueda} />
      <div style={colEan}>
        <div className="spira-eyebrow">Código EAN13</div>
        <EanCell code={row.code} busqueda={busqueda} onAsignar={() => onCodigo(row.medication_id, row.name, row.code)} />
      </div>
      <div style={colLote}>
        <div className="spira-eyebrow">Lote</div>
        <div className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-ink)', marginTop: 3 }}>
          <Resaltado texto={row.lot_number} busqueda={busqueda} />
        </div>
      </div>
      <VencCol iso={row.expiry_date} cfg={cfg} />
      <StockCell qty={row.quantity_on_hand} nivel={nivelDeCantidad(row.quantity_on_hand)} />
      {/* Un medicamento de un solo lote es las dos cosas a la vez, así que lleva el menú entero. */}
      <KebabMenu id={row.lot_id} dropdownId={dropdownId} setDropdownId={setDropdownId}>
        <KebabItem icon="barcode" onClick={() => { setDropdownId(null); onCodigo(row.medication_id, row.name, row.code) }}>
          {hasCode ? 'Modificar código' : 'Asignar código'}
        </KebabItem>
        <KebabItem icon="plus" disabled>Agregar variante comercial<PillPronto /></KebabItem>
        {hasCode && <KebabItem icon="copy" onClick={() => { setDropdownId(null); onCopiar(row.code as string) }}>Copiar EAN13</KebabItem>}
        {canManage && <><div style={kebabDivider} /><KebabItem icon="pencil" onClick={() => onAjustar(row)}>Ajustar stock</KebabItem></>}
      </KebabMenu>
    </div>
  )
}

/* ── Celdas compartidas por las tres formas de fila ─────────────────────────── */

/** La ÚNICA columna flexible de las filas con medicamento; su gemela en las de lote es
 *  `.spira-lot-indent`. Que haya exactamente una por fila es lo que hace que la columna EAN
 *  empiece siempre en la misma X. */
function NombreCol({ nombre, droga, busqueda }: { nombre: string; droga: string | null; busqueda: string }) {
  return (
    <div style={colNombre}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <Resaltado texto={nombre} busqueda={busqueda} />
      </div>
      {droga && (
        <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Resaltado texto={droga} busqueda={busqueda} />
        </div>
      )}
    </div>
  )
}

function VencCol({ iso, cfg }: { iso: string | null; cfg: { color: string; icon: IconName | null; label: string } }) {
  return (
    <div style={colVenc}>
      <div className="spira-eyebrow">Vencimiento</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }} title={cfg.label} aria-label={`Vencimiento ${formatFecha(iso)}, ${cfg.label}`}>
        {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
        <span className="spira-mono" style={{ fontSize: 13.5, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>{formatFecha(iso)}</span>
      </div>
    </div>
  )
}

/**
 * `onAsignar` sin definir = la celda es sólo lectura, y muestra un guión si no hay código.
 *
 * Se omite en DOS lugares, por el mismo motivo de fondo: el EAN13 es uno por medicamento.
 *   · En las filas de lote, porque repetir el botón en cada lote ofrecería N caminos al mismo
 *     efecto; la acción vive en el resumen del grupo.
 *   · En el propio resumen, porque ahí la celda vive DENTRO del <button> que despliega, y un
 *     botón anidado en otro es HTML inválido. El menú ⋮ de esa misma fila ya ofrece "Asignar
 *     código", así que no se pierde nada.
 */
function EanCell({ code, busqueda, onAsignar }: { code: string | null; busqueda: string; onAsignar?: () => void }) {
  if (code) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
        <Icon name="barcode" size={15} color="var(--spira-muted)" />
        <span className="spira-mono" style={{ fontSize: 13.5, color: 'var(--spira-ink)', letterSpacing: '.01em' }}>
          <Resaltado texto={code} busqueda={busqueda} />
        </span>
      </div>
    )
  }
  if (!onAsignar) return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3 }}>Sin código</div>
  return (
    <button type="button" onClick={onAsignar} style={asignarChip}>
      <Icon name="plus" size={12} color="var(--spira-muted)" /> Asignar código
    </button>
  )
}

/* ── Celda Stock: el número más grande de la fila (jerarquía intencional) ───── */
function StockCell({ qty, nivel }: { qty: number; nivel: Nivel }) {
  /* Stock bajo es una ADVERTENCIA y va en ÁMBAR. Decía `--spira-pharma-solid` porque el ámbar de
     Farmacia y el de alerta eran el mismo color; cuando la identidad pasó a petróleo (2026-08-11)
     el número quedó pintado de identidad y dejó de leerse como advertencia, mientras el badge de
     al lado seguía ámbar. Es el mismo error que ya se había corregido en ESTADO_CFG. */
  const color = nivel === 'agotado' ? 'var(--spira-acc-deep-danger)'
    : nivel === 'bajo' ? 'var(--spira-acc-deep-warn)'
    : 'var(--spira-ink)'
  return (
    <div style={colStock}>
      <div className="spira-eyebrow" style={{ color: 'var(--spira-ink)' }}>Stock</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 21, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color }}>{qty}</span>
        <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>u.</span>
        {nivel === 'bajo' && <span style={stockBadgeLow}>Bajo</span>}
        {nivel === 'agotado' && <span style={stockBadgeOut}>Agotado</span>}
      </div>
    </div>
  )
}

/**
 * Resalta la parte del texto que coincide con la búsqueda. Cuando un grupo se abre porque UNO de
 * sus lotes matchea, sin esto no se ve cuál fue: el grupo muestra todos sus lotes (el buscador
 * selecciona, no recorta) y el match se pierde entre los hermanos.
 */
function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  const q = busqueda.trim().toLowerCase()
  if (!q) return <>{texto}</>
  const i = texto.toLowerCase().indexOf(q)
  if (i < 0) return <>{texto}</>
  return (
    <>
      {texto.slice(0, i)}
      <mark style={marca}>{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  )
}

/** Envoltorio del menú ⋮. Un solo lugar con el ancla, el backdrop y el popover, para que las tres
 *  formas de fila no repitan treinta líneas cada una con sus propias variantes. */
function KebabMenu({ id, dropdownId, setDropdownId, children }: {
  id: string
  dropdownId: string | null
  setDropdownId: (id: string | null) => void
  children: ReactNode
}) {
  const abierto = dropdownId === id
  const { anchorRef, pos } = useAnchoredPopover(abierto, 244)
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <button ref={anchorRef} type="button" aria-label="Acciones" aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => setDropdownId(abierto ? null : id)} style={kebabBtn}>
        <Icon name="moreVertical" size={16} color="var(--spira-muted)" />
      </button>
      {abierto && (
        <>
          <div onClick={() => setDropdownId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          {pos && <div role="menu" style={{ ...popover, top: pos.top, left: pos.left }}>{children}</div>}
        </>
      )}
    </div>
  )
}
function KebabItem({ icon, children, onClick, disabled, danger }: { icon: IconName; children: ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  const color = disabled ? 'var(--spira-faint)' : danger ? 'var(--spira-danger)' : 'var(--spira-ink)'
  const iconColor = disabled ? 'var(--spira-line-2)' : danger ? 'var(--spira-danger)' : 'var(--spira-muted)'
  return (
    <button role="menuitem" onClick={onClick} disabled={disabled} aria-disabled={disabled} style={{ ...kebabItem, color, cursor: disabled ? 'default' : 'pointer' }}>
      <Icon name={icon} size={16} color={iconColor} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>{children}</span>
    </button>
  )
}
function PillPronto() {
  return <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--spira-muted)', border: '1px solid var(--spira-line)', borderRadius: 99, padding: '1px 6px' }}>Pronto</span>
}

/* ── Estilos ────────────────────────────────────────────────────────────────── */
const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 }
const menuGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, maxWidth: 1040 }
/* El borde y el hover los pone `.spira-card-link`; acá va el resto. `borderColor` se pisa inline
   cuando la tarjeta está seleccionada — la clase declara el borde ABREVIADO, así que pisar sólo
   el color es seguro (mezclar abreviada con longhands en el MISMO objeto es lo que deja el borde
   negro al salir del estado). */
const protoCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', borderRadius: 16,
  padding: '16px 18px', boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer',
  font: 'inherit', color: 'inherit',
}
const apartadoCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', textAlign: 'left', background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 16, padding: 16, boxShadow: 'var(--spira-shadow-sm)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
}
const errorBox: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,0.10)', borderRadius: 10, padding: '12px 14px' }
/* El `marginRight: auto` es lo que manda los filtros al borde derecho en Stock. En Catálogo, donde
   el buscador es lo único de la fila, no cambia nada: el margen se come el sobrante que ya estaba
   a su derecha. */
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, height: 38, width: 240, marginRight: 'auto',
  padding: '0 12px',
  borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
}
const searchInput: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 13,
}
const searchClear: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }
const clearBtn: CSSProperties = {
  height: 38, padding: '0 12px', borderRadius: 10, border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600,
  fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6,
}
const lista: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 9 }
/* Geometría de la fila: sale de `--spira-stock-*` (tokens.css) y NO de números sueltos acá. El
   conector de árbol de los lotes deriva su posición de estas mismas medidas; con dos copias, un
   cambio en el chevron o en el ícono lo dejaría corrido tres píxeles y nadie lo vería en un diff.
   Ver el comentario de la sección "Grupo de medicamento" en tokens.css. */
const rowCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--spira-stock-gap)', border: '1px solid var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px var(--spira-stock-pad-x)', boxShadow: 'var(--spira-shadow-sm)' }
const pillSq: CSSProperties = { width: 'var(--spira-stock-pill)', height: 'var(--spira-stock-pill)', flex: '0 0 auto', borderRadius: 11, background: 'rgba(15, 95, 87,.13)', display: 'grid', placeItems: 'center' }

/* Anchos de columna del handoff. Se repiten IDÉNTICOS en las tres formas de fila (plana, resumen
   y lote) y cada una tiene exactamente un ítem flexible antes de ellos, así el comienzo de la
   columna EAN cae siempre en la misma X sin importar el ancho del contenedor. */
const colNombre: CSSProperties = { flex: '1 1 240px', minWidth: 0 }
const colEan: CSSProperties = { flex: '0 0 170px', minWidth: 0 }
const colLote: CSSProperties = { flex: '0 0 96px', minWidth: 0 }
const colVenc: CSSProperties = { flex: '0 0 150px', minWidth: 0 }
/* La columna con más prioridad visual: número a 21px contra los 13,5 del resto. */
const colStock: CSSProperties = { flex: '0 0 138px', minWidth: 0 }

/* `color-mix` y no una concatenación de hex: el token llega como `var(--…)` y `var(--x) + '38'`
   produce CSS inválido que se descarta en silencio. */
const marca: CSSProperties = {
  background: 'color-mix(in srgb, var(--spira-warn) 22%, transparent)',
  color: 'inherit', borderRadius: 3, padding: '0 1px',
}
const groupIconSq: CSSProperties = { width: 26, height: 26, flex: '0 0 auto', borderRadius: 8, background: 'rgba(15, 95, 87,.13)', display: 'grid', placeItems: 'center' }
const ipCard: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(15,95,87,.06)', border: '1px solid rgba(15,95,87,.18)', borderRadius: 12, padding: '12px 14px' }
const ipIconSq: CSSProperties = { width: 36, height: 36, flex: '0 0 auto', borderRadius: 10, background: 'rgba(15,95,87,.12)', display: 'grid', placeItems: 'center' }
const kebabBtn: CSSProperties = { width: 36, height: 36, border: '1px solid var(--spira-line-2)', borderRadius: 9, background: 'var(--spira-white)', cursor: 'pointer', display: 'grid', placeItems: 'center' }
const popover: CSSProperties = { position: 'fixed', zIndex: 61, width: 244, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', borderRadius: 12, boxShadow: '0 12px 30px rgba(20,48,46,.16)', padding: 6 }
const kebabItem: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'transparent', fontFamily: 'var(--spira-font-text)', fontSize: 13.5, textAlign: 'left' }
const kebabDivider: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '4px 6px' }
const asignarChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 25, padding: '0 10px', marginTop: 3, borderRadius: 99,
  background: 'var(--spira-surface)', border: '1px dashed var(--spira-line-2)', color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
const stockBadgeBase: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.02em', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }
/** Stock bajo es una ADVERTENCIA: se queda en ámbar aunque la identidad del módulo pase a petróleo. */
const stockBadgeLow: CSSProperties = { ...stockBadgeBase, color: 'var(--spira-acc-deep-warn)', background: 'rgba(176,130,63,.14)' }
const stockBadgeOut: CSSProperties = { ...stockBadgeBase, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,.12)' }
