import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { btnOutline } from '../components/buttons'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { alertItemStyle } from './alertItem'
import { AlertCardHeader } from './AlertCardHeader'
import { severidadMaxima } from './alertSeverity'
import { reporteTitulo } from './track/reportes/estados'
import { EmptyState } from '../components/EmptyState'
import { SearchableSelect } from '../components/SearchableSelect'
import { MultiFilterMenu } from '../components/MultiFilterMenu'
import type { MultiFilterOption } from '../components/MultiFilterMenu'
import { FilterDropdown } from '../components/FilterDropdown'
import { ClearFilters, FilterSearch } from '../components/FilterBar'
import { coincideBusqueda, opcionesCoordinador, opcionesMedico, SIN_VALOR } from './alertFilters'
import { Modal } from '../components/Modal'
import type { TrackVisitRow } from '../data/visits'
import { useProtocols } from '../data/protocols'
import {
  useActiveAlerts, dismissAlert, restoreAlert, DISMISS_REASONS, reasonLabel,
} from '../data/alertDismissals'
import type { AlertKind } from '../data/alertDismissals'
import { visitTitle } from '../lib/visits'
import { formatAR, todayISO, daysDiffISO, fromNow } from '../lib/dates'
import { codecs } from '../lib/router'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import { VISIT_STATES } from './visitStates'
import { VisitDetail } from './track/VisitDetail'
import { useAbrirFicha } from './useAbrirFicha'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const code: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 600 }

/* Botón de descartar: hermano del que abre la visita y superpuesto arriba a la derecha del ítem.
   Discreto en reposo (es una acción secundaria, y en una lista de alertas no queremos invitar a
   silenciar), con su intención declarada al hover. */
const dismissBtn: CSSProperties = {
  position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8,
  display: 'grid', placeItems: 'center', border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', cursor: 'pointer',
}
const dismissedRow: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
  borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--spira-line)',
}
const linkBtn: CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-acc-deep-track)',
}

/** La alerta que el usuario está por archivar (lo que necesita el RPC + cómo nombrarla). */
interface Dismissing {
  kind: AlertKind
  visitId: string
  reportDefinitionId?: string
  label: string
}

const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Cualquier antigüedad' },
  { value: 7, label: 'Últimos 7 días' },
  { value: 14, label: 'Últimos 14 días' },
  { value: 30, label: 'Últimos 30 días' },
]

/**
 * Valor centinela de "Reporte pendiente" DENTRO del filtro Estado.
 *
 * No es un `computed_status` de visita: los reportes pendientes vienen de otra consulta. Pero
 * como FILTRO pertenece al mismo eje, porque quien mira piensa "mostrame sólo los reportes", no
 * "cruzá dos listas". Mismo criterio que `ESPERA_MEDICO` en Visitas del día.
 */
const REPORTE_PENDIENTE = 'reporte_pendiente'

/** Fecha de referencia de una alerta para el filtro de antigüedad. */
function refDate(a: TrackVisitRow): string | null {
  return a.window_end ?? a.estimated_date ?? null
}

/**
 * Vista Alertas: promueve el card de alertas del Resumen a vista full con filtros por
 * protocolo y por antigüedad. Reusa useVisitAlerts() + VISIT_STATES. Solo lectura
 * ("marcar visto/cerrado" es fase 2). Filtrado en el front sobre las filas del hook.
 *
 * Cada alerta ABRE SU VISITA en el mismo modal que el resto de la app (`VisitDetail`), acá
 * adentro: la alerta se resuelve mirando la visita, no saltando a otra pantalla. Las dos clases
 * de alerta sirven para eso —las de visita por su `id`, las de reporte de procedimiento por su
 * `visit_id`—. Y se EDITA desde acá, como desde cualquier otra puerta (2026-08-20): la alerta se
 * resuelve haciendo algo con la visita, no solo mirándola.
 *
 * Una alerta también se puede DESCARTAR (0070). No se borra —es estado calculado—: se archiva el
 * aviso con motivo de catálogo, autor y fecha, y se puede restaurar desde "Descartadas".
 */
export function TrackAlertsView({ module, submodule, navTarget, onTargetConsumed, onNavigate }: ViewProps) {
  const accent = module.accent
  const alertsQ = useActiveAlerts()
  const protocols = useProtocols()
  /* Varios protocolos a la vez (Director, 2026-08-25). La lista VACÍA es "todos": no hay opción
     "Todos los protocolos" que tildar, porque en un filtro múltiple esa opción tendría que
     destildar a las demás y se lee como una más de la lista. El placeholder ya lo dice.
     Viaja en la URL con `codecs.list`, que escapa la coma dentro de cada valor. */
  const [protocolFilter, setProtocolFilter] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [ageDays, setAgeDays] = useUrlState('antiguedad', 0, { codec: codecs.num })
  /* Mismos nombres de parámetro que en Visitas del día (`estado`, `buscar`), a propósito: las dos
     pantallas filtran lo mismo y una URL se lee igual en las dos. */
  const [fEstado, setFEstado] = useUrlState<string[]>('estado', [], { codec: codecs.list })
  const [q, setQ] = useUrlState('buscar', '')
  const [fMed, setFMed] = useUrlState<string[]>('medico', [], { codec: codecs.list })
  const [fCoord, setFCoord] = useUrlState<string[]>('coordinadora', [], { codec: codecs.list })
  /* Solo el id: `VisitDetail` trae sus propios datos por id (`useVisit`), así que no hace falta
     encontrar la fila ni esperar a que carguen las alertas — por eso una alerta se puede abrir aunque
     los filtros de la vista la dejen fuera. Y por lo mismo va el UUID COMPLETO, no el corto: acortarlo
     obligaría a resolverlo contra las filas visibles y mataría justo esa propiedad.
     `useUrlEntity` ya trae resuelto push al abrir / replace al cerrar en `setOpenVisitId`; el tercer
     elemento (`moveOpenVisitId`, usado más abajo) también reemplaza pero es para ABRIR sin apilar —
     lo usa el efecto de `navTarget`, porque el shell YA apiló su propia entrada al traer hasta acá. */
  const [openVisitId, setOpenVisitId, moveOpenVisitId] = useUrlEntity('visita')
  const [dismissing, setDismissing] = useState<Dismissing | null>(null)
  const [showDismissed, setShowDismissed] = useUrlState('descartadas', false, { codec: codecs.bool })
  const [actionError, setActionError] = useState<string | null>(null)

  /* La vuelta NO reabre la alerta puntual: este `volver` no lleva `target`, así que devuelve a la
     lista genérica — el label ya lo dice ("Volver a Pendientes", armado con `submodule.name`),
     no promete de más.
     Distinto de "Volver a la visita" en Visitas del día, que sí trae de vuelta la visita puntual
     porque su `volver` completa el `target`. */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: `Volver a ${submodule.name}`, hint: `Volver a la lista de ${submodule.name.toLowerCase()}` }),
  })

  /* Llegada CON objetivo (desde "Lo prioritario" en Inicio): abrir esa alerta apenas montamos.
     Va con `moveOpenVisitId` (replace) y no `setOpenVisitId` (push): el shell YA apiló su propia
     entrada al traernos hasta acá, así que apilar una segunda dejaría el "atrás" a mitad de camino
     —de vuelta a la lista de alertas en vez de a Inicio—, mismo criterio que `useUrlPath` con
     `resolviendoTarget` en ProtocolsView. Se consume una sola vez para que un refetch no la reabra
     sola. */
  useEffect(() => {
    if (!navTarget?.visitId) return
    moveOpenVisitId(navTarget.visitId)
    onTargetConsumed?.()
  }, [navTarget, onTargetConsumed])

  const loading = alertsQ.loading || protocols.loading
  const error = alertsQ.error || protocols.error

  const allRows = alertsQ.visitAlerts
  const procRows = alertsQ.reportAlerts
  const dismissals = alertsQ.dismissals

  const filtered = useMemo(() => {
    const today = todayISO()
    return allRows.filter((a) => {
      if (fEstado.length > 0 && !fEstado.includes(a.computed_status)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(a.protocol_id)) return false
      if (fMed.length > 0 && !fMed.includes(a.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(a.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(a, q)) return false
      if (ageDays > 0) {
        const ref = refDate(a)
        if (!ref) return false
        const age = daysDiffISO(ref, today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [allRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

  const filteredProc = useMemo(() => {
    const today = todayISO()
    return procRows.filter((r) => {
      /* Los reportes pendientes son UNA opción del filtro Estado: si hay estados tildados y el
         suyo no está, esta lista entera queda afuera. Sin esta línea, tildar "Ventana vencida"
         dejaría igual todos los reportes abajo y el filtro parecería roto. */
      if (fEstado.length > 0 && !fEstado.includes(REPORTE_PENDIENTE)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(r.protocol_id)) return false
      /* Los dos campos que la 0103 agregó a `v_procedure_report_alerts`. Sin ellos, tildar un
         médico dejaba esta lista SIEMPRE entera o SIEMPRE vacía — o el filtro no filtraba, o
         escondía alertas sin decirlo. */
      if (fMed.length > 0 && !fMed.includes(r.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(r.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(r, q)) return false
      if (ageDays > 0) {
        const age = daysDiffISO(r.report_due_at.slice(0, 10), today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [procRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

  if (loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title={`Cargando ${submodule.name.toLowerCase()}…`} description="Un momento." />
  }
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar las alertas. Probá de nuevo.
        </div>
        <button onClick={() => { alertsQ.refetch(); protocols.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const protoOptions = (() => {
    const byId = new Map<string, string>()
    for (const a of allRows) byId.set(a.protocol_id, a.protocol_code)
    for (const r of procRows) byId.set(r.protocol_id, r.protocol_code)
    const list = (protocols.data ?? []).filter((p) => byId.has(p.id))
    return list.map((p) => ({ id: p.id, code: p.code }))
  })()
  /* Sin "Todos los protocolos" como opción: con selección múltiple sería una opción tildeable que
     tendría que destildar a las demás, y se leería como una más de la lista. Ninguno tildado ya
     significa todos, y el placeholder lo dice. */
  const ageOptions = AGE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

  /* Opciones CON CONTEO, igual que en Visitas: el número dice cuántas alertas caen en cada opción
     ANTES de aplicar ese menú, así se ve qué va a pasar antes de tildar. Un filtro que deja la
     lista vacía y no lo avisó es la forma más rápida de que alguien crea que no hay alertas. */
  const protoMultiOptions: MultiFilterOption[] = protoOptions.map((p) => ({
    value: p.id,
    label: p.code,
    count: allRows.filter((a) => a.protocol_id === p.id).length
      + procRows.filter((r) => r.protocol_id === p.id).length,
  }))

  /* Los TRES avisos de esta pantalla en un solo eje. Los dos primeros son estados calculados de la
     visita; el tercero no lo es —es un reporte pendiente, que vive en otra consulta— pero como
     FILTRO pertenece acá: quien mira piensa "mostrame sólo los reportes", no "cruzá dos listas". */
  const estadoOptions: MultiFilterOption[] = [
    { value: 'ventana_vencida', label: VISIT_STATES.ventana_vencida.label, count: allRows.filter((a) => a.computed_status === 'ventana_vencida').length },
    { value: 'item_vencido', label: VISIT_STATES.item_vencido.label, count: allRows.filter((a) => a.computed_status === 'item_vencido').length },
    { value: REPORTE_PENDIENTE, label: 'Reporte pendiente', count: procRows.length },
  ]

  /* Las dos listas juntas: un médico que sólo tiene reportes pendientes tiene que aparecer igual
     en el menú, o sus alertas quedan inalcanzables por filtro (0103 es lo que lo hace posible). */
  const medOptions = opcionesMedico([allRows, procRows])
  const coordOptions = opcionesCoordinador([allRows, procRows])

  const nFiltros = fEstado.length + protocolFilter.length + fMed.length + fCoord.length + (ageDays > 0 ? 1 : 0)
  const hayFiltros = nFiltros > 0 || q.trim() !== ''
  const limpiarFiltros = () => {
    setFEstado([]); setProtocolFilter([]); setFMed([]); setFCoord([]); setAgeDays(0); setQ('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* LA MISMA BARRA QUE "VISITAS DEL DÍA", con los mismos componentes y no con copias parecidas
          (pedido del Director: "que se vean iguales y que interactúen igual"). `MultiFilterMenu` ya
          era compartido; el buscador y el botón de limpiar se extrajeron a `components/FilterBar`
          en este mismo cambio, y Visitas pasó a usarlos también — que es lo único que garantiza que
          sigan iguales cuando alguien ajuste uno.

          FALTAN MÉDICO Y COORDINADOR, y no por olvido: ninguna de las dos consultas de esta
          pantalla los trae. `v_track_visits` no proyecta el coordinador (vive en `patient_visits`
          desde la 0065) y la vista de alertas de reporte tampoco trae el médico tratante. Dibujar
          esos dos menús con las opciones vacías sería un filtro que finge filtrar; entran con la
          migración que los exponga. Ver TODOS.md. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MultiFilterMenu accent={accent} label="Estado" icon="filter" options={estadoOptions} selected={fEstado} onChange={setFEstado} />
        <MultiFilterMenu accent={accent} label="Protocolo" icon="file" options={protoMultiOptions} selected={protocolFilter} onChange={setProtocolFilter} searchPlaceholder="Buscar protocolo…" />
        <MultiFilterMenu accent={accent} label="Médico" icon="users" options={medOptions} selected={fMed} onChange={setFMed} />
        <MultiFilterMenu accent={accent} label="Coordinador" icon="user" options={coordOptions} selected={fCoord} onChange={setFCoord} />
        <span style={{ width: 1, height: 22, background: 'var(--spira-line)', margin: '0 2px' }} />
        {/* La antigüedad es un UMBRAL, no una selección múltiple: "últimos 7 días" y "últimos 30"
            no se suman, uno contiene al otro. Por eso va en el desplegable simple, el mismo hueco
            que en Visitas ocupa "Ordenar por". */}
        <FilterDropdown
          accent={accent}
          value={String(ageDays)}
          onChange={(v) => setAgeDays(Number(v))}
          options={ageOptions}
          menuLabel="Antigüedad"
          prefix="Antigüedad"
          icon="clock"
        />
        {hayFiltros && <ClearFilters n={nFiltros} onClear={limpiarFiltros} />}
        <div style={{ marginLeft: 'auto' }}>
          <FilterSearch value={q} onChange={setQ} placeholder="Paciente, N° o protocolo…" />
        </div>
      </div>

      {/* El recuento y las descartadas bajan a su propia línea: son el RESULTADO de la barra, no un
          control más de ella. Arriba competían por el mismo borde derecho que el buscador y hacían
          que la fila envolviera en la notebook de referencia. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
          {filtered.length + filteredProc.length} de {allRows.length + procRows.length}{' '}
          {allRows.length + procRows.length === 1 ? 'pendiente' : 'pendientes'}
        </span>
        {dismissals.length > 0 && (
          <button type="button" style={linkBtn} onClick={() => setShowDismissed((v) => !v)}>
            {/* "descartados" en masculino: concuerda con "pendientes", que es el sustantivo de
                esta pantalla desde el renombre. Con "alertas" era femenino. */}
            {showDismissed ? 'Ocultar descartados' : `Ver descartados (${dismissals.length})`}
          </button>
        )}
      </div>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '10px 13px' }}>
          <Icon name="alertCircle" size={17} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        {/* Misma cabecera que la tarjeta de Alertas del Resumen: las dos pantallas abren con el
            mismo renglón teñido por la PEOR alerta presente. Lo que NO se unifica es el interior —
            acá los ítems conservan su superficie teñida, porque a veinte alertas de tipos mezclados
            el bloque de color es cómo se encuentra la grave sin leer; en el Resumen son dos o tres
            de reojo y las filas van planas (decisión D12).
            El tinte lo fijan las alertas de VISITA, que son las que tienen severidad rankeada; los
            reportes pendientes suman a la lista pero no suben el tono: son un pendiente que todavía
            está en plazo, no un desvío. Sin contador: el de la barra de filtros dice "3 de 12", que
            es más que un número suelto. */}
        <AlertCardHeader titulo={submodule.name} severidad={severidadMaxima(filtered)} />
        {filtered.length === 0 && filteredProc.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            <Icon name="check" size={16} color="var(--spira-good)" />
            {allRows.length === 0 && procRows.length === 0 ? 'Sin pendientes. Todo al día.' : 'Ningún pendiente coincide con los filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredProc.map((r) => {
              /* Azul de "en curso" y no el petróleo de marca, que es lo que había.
                 Dos motivos. Uno semántico: el petróleo es el acento del módulo y el color del ítem
                 de navegación activo, así que una fila teñida con él se lee como "seleccionada"
                 antes que como una clase de alerta. Y uno de jerarquía: de los tres avisos de esta
                 pantalla, un reporte pendiente es el MENOS grave —todavía está en plazo— y el azul
                 lo dice sin competir con el rojo de ventana vencida ni con el ámbar del vencido.
                 No es un color inventado: es el mismo `--spira-acc-deep-blue` que ya marca
                 "preparando" en dispensaciones y "realizada" en los estados de visita, y tiene
                 variante aclarada para el tema oscuro (un hex crudo acá desaparecería). Se
                 distingue de los otros dos por matiz Y por luminancia, como pide PRODUCT.md. */
              const c = 'var(--spira-acc-deep-blue)'
              // report_due_at = completed_at + ETA (hora arbitraria); la antigüedad en días es
              // aproximada (±1 día cerca de medianoche UTC).
              const days = daysDiffISO(r.report_due_at.slice(0, 10), todayISO())
              return (
                <div key={`${r.visit_id}:${r.report_definition_id}`} style={{ position: 'relative' }}>
                <div
                  role="button"
                  tabIndex={0}
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(r.visit_id)}
                  onKeyDown={(e) => {
                    // Solo si el evento nació en la tarjeta misma: sin esta guarda, Enter sobre el
                    // link del nombre abre la ficha Y la visita.
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(r.visit_id) }
                  }}
                  aria-label={`Abrir la visita de ${r.patient_name} — reporte de procedimiento pendiente`}
                  style={alertItemStyle(c, { conBotonDescartar: true })}
                >
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clipboardCheck" size={18} color={c} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        <PatientLink onOpen={abrirFicha && (() => abrirFicha(r.patient_id, r.protocol_id))} label={`Abrir la ficha de ${r.patient_name}`}>
                          {r.patient_name}
                        </PatientLink>
                      </span>
                      <span style={code}>
                        {r.patient_code
                          ? <PatientLink onOpen={abrirFicha && (() => abrirFicha(r.patient_id, r.protocol_id))} label={`Abrir la ficha del sujeto ${r.patient_code}`}>{r.patient_code}</PatientLink>
                          : '—'}
                      </span>
                      {abrirFicha && <PatientLinkArrow />}
                      <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span style={code}>{r.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      Reporte pendiente · {reporteTitulo(r.report_name, r.procedure_name)}{days > 0 ? ` · hace ${days} d` : ''}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  style={dismissBtn}
                  title="Descartar esta alerta"
                  aria-label={`Descartar la alerta de reporte de ${r.patient_name}`}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--spira-ink)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--spira-faint)' }}
                  onClick={() => setDismissing({
                    kind: 'reporte_procedimiento', visitId: r.visit_id, reportDefinitionId: r.report_definition_id,
                    label: `${reporteTitulo(r.report_name, r.procedure_name)} · ${r.patient_name}`,
                  })}
                >
                  <Icon name="x" size={15} />
                </button>
                </div>
              )
            })}
            {filtered.map((a) => {
              const c = VISIT_STATES[a.computed_status].color
              const vName = visitTitle(a)
              const motivo = a.computed_status === 'ventana_vencida'
                ? `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                : `Reporte de procedimiento fuera de plazo · ${vName}`
              return (
                <div key={a.id} style={{ position: 'relative' }}>
                <div
                  role="button"
                  tabIndex={0}
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(a.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(a.id) }
                  }}
                  aria-label={`Abrir la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                  style={alertItemStyle(c, { conBotonDescartar: true })}
                >
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                    <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={18} color={c} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha de ${a.patient_name}`}>
                          {a.patient_name}
                        </PatientLink>
                      </span>
                      <span style={code}>
                        {a.patient_code
                          ? <PatientLink onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))} label={`Abrir la ficha del sujeto ${a.patient_code}`}>{a.patient_code}</PatientLink>
                          : '—'}
                      </span>
                      {abrirFicha && <PatientLinkArrow />}
                      <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span style={code}>{a.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                  </div>
                </div>
                <button
                  type="button"
                  style={dismissBtn}
                  title="Descartar esta alerta"
                  aria-label={`Descartar la alerta de ${a.patient_name}`}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--spira-ink)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--spira-faint)' }}
                  onClick={() => setDismissing({
                    kind: 'visita', visitId: a.id,
                    label: `${VISIT_STATES[a.computed_status].label} · ${vName} · ${a.patient_name}`,
                  })}
                >
                  <Icon name="x" size={15} />
                </button>
                </div>
              )
            })}
          </div>
        )}
        {/* La leyenda tiene que nombrar el color que se VE. Decía "petróleo" desde antes de que el
            reporte pendiente pasara a azul (ver el comentario del color, más arriba): quedó
            describiendo una versión de la pantalla que ya no existe, y es justamente el texto que
            alguien lee cuando no sabe qué significa un tinte. */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-muted)' }}>
          Ventana vencida (roja) · Pendiente vencido (ámbar) · Reporte pendiente (azul)
        </div>
      </div>

      {/* Descartadas: el archivo, no la papelera. Nada se borró — la condición clínica sigue en la
          base y esto es el registro de quién decidió no atenderla, con su motivo. Restaurar la
          devuelve a la lista. */}
      {showDismissed && dismissals.length > 0 && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>Descartados</div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>
            No se borró nada: la condición sigue en la base y esto queda auditado. Si la visita se
            reprograma o cambia de estado, la alerta vuelve a la lista sola.
          </div>
          <div style={{ marginTop: 8 }}>
            {dismissals.map((d) => {
              const vis = alertsQ.allVisitAlerts.find((a) => a.id === d.visit_id)
              const rep = alertsQ.allReportAlerts.find(
                (r) => r.visit_id === d.visit_id && r.report_definition_id === d.report_definition_id,
              )
              const nombre = vis?.patient_name ?? rep?.patient_name ?? null
              /* El paciente sale de la alerta viva que respalda al descarte, sea de visita o de
                 reporte: las dos filas traen su `patient_id` y su `protocol_id`. Cuando ninguna
                 está —la alerta dejó de ser vigente y el renglón dice justamente eso— no hay a
                 quién abrir, y el nombre ni siquiera existe. */
              const pac = vis ?? rep ?? null
              const abrirPac = abrirFicha && pac ? () => abrirFicha(pac.patient_id, pac.protocol_id) : undefined
              const detalle = d.kind === 'reporte_procedimiento'
                ? (rep ? reporteTitulo(rep.report_name, rep.procedure_name) : 'Reporte de procedimiento')
                : (vis ? `${VISIT_STATES[vis.computed_status].label} · ${visitTitle(vis)}` : 'Alerta de visita')
              return (
                <div key={d.id} style={dismissedRow}>
                  <Icon name="check" size={16} color="var(--spira-faint)" style={{ flex: '0 0 auto', marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {/* Una alerta descartada no dejó de ser de alguien: el archivo también nombra a
                        un paciente, así que también lleva a su ficha. La flecha va después del
                        nombre —donde el par termina, que acá es de uno solo— y el detalle queda
                        detrás como texto. */}
                    <div className="spira-link-group" style={{ fontSize: 13, fontWeight: 600 }}>
                      {nombre
                        ? <PatientLink onOpen={abrirPac} label={`Abrir la ficha de ${nombre}`}>{nombre}</PatientLink>
                        : 'Alerta ya no vigente'}
                      {abrirPac && <span style={{ marginLeft: 8 }}><PatientLinkArrow /></span>}
                      <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}> · {detalle}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {reasonLabel(d.reason)}{d.detail ? ` — ${d.detail}` : ''} · {d.dismissed_by_name}
                      <span style={{ color: 'var(--spira-muted)' }}> ({d.dismissed_by_role}) · {fromNow(d.dismissed_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={linkBtn}
                    onClick={async () => {
                      setActionError(null)
                      const { error: e } = await restoreAlert(d.id)
                      if (e) setActionError(e)
                      else alertsQ.refetch()
                    }}
                  >
                    Restaurar
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {dismissing && (
        <DismissModal
          target={dismissing}
          accent={accent}
          onClose={() => setDismissing(null)}
          onDone={() => { setDismissing(null); setActionError(null); alertsQ.refetch() }}
          onError={(msg) => { setDismissing(null); setActionError(msg) }}
        />
      )}

      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          onClose={() => setOpenVisitId(null)}
          onChanged={() => alertsQ.refetch()}
          // El mismo gesto que ya tiene la fila: reusa `abrirFicha`, que ya cae a `undefined`
          // sin `onNavigate` y así el encabezado del modal degrada solo a texto.
          onOpenPatient={abrirFicha}
        />
      )}
    </div>
  )
}

/**
 * Confirmación de descarte. El motivo es de CATÁLOGO (desplegable, no texto libre): el error del
 * operador es un riesgo regulatorio y el motivo se lee después en la auditoría, así que conviene
 * que sea comparable entre alertas. "Otro" habilita —y exige— una explicación.
 */
function DismissModal({ target, accent, onClose, onDone, onError }: {
  target: Dismissing
  accent: string
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const necesitaDetalle = reason === 'otro'
  const listo = reason !== '' && (!necesitaDetalle || detail.trim() !== '')

  const confirmar = async () => {
    if (!listo || busy) return
    setBusy(true)
    setErr(null)
    const { error } = await dismissAlert({
      kind: target.kind, visitId: target.visitId, reportDefinitionId: target.reportDefinitionId,
      reason, detail: necesitaDetalle ? detail : null,
    })
    setBusy(false)
    if (error) { setErr(error); onError(error); return }
    onDone()
  }

  return (
    // Sin `icon`: el Modal ya trae su X de cerrar arriba a la derecha, y un ícono "x" al lado del
    // título daba DOS cruces que no hacen lo mismo (una cierra, la otra no hace nada).
    <Modal title="Descartar la alerta" onClose={onClose} accent={accent}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink)' }}>
          {target.label}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)' }}>
          La alerta sale de la lista y de la campana. <strong style={{ fontWeight: 600 }}>No se borra nada</strong>:
          la condición sigue en la base y queda registrado quién la archivó y por qué. Si la visita
          se reprograma o cambia de estado, la alerta vuelve sola.
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Motivo</div>
          <SearchableSelect
            value={reason}
            onChange={(v) => setReason(v)}
            options={DISMISS_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
            entity="motivo"
          />
        </div>
        {necesitaDetalle && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Contanos por qué</div>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="Queda en la auditoría."
              style={{
                width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10,
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
                fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)',
                background: 'var(--spira-white)',
              }}
            />
          </div>
        )}
        {err && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!listo || busy}
            aria-disabled={!listo || busy}
            className={!listo || busy ? 'spira-no-press' : undefined}
            style={{
              ...btnOutline,
              background: listo && !busy ? accent : 'var(--spira-line)',
              borderColor: listo && !busy ? accent : 'var(--spira-line)',
              color: listo && !busy ? 'var(--spira-white)' : 'var(--spira-faint)',
              cursor: listo && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Descartando…' : 'Descartar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
