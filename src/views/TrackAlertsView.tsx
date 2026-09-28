import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { btnOutline } from '../components/buttons'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { alertItemStyle } from './alertItem'
import { AlertCardHeader } from './AlertCardHeader'
import { PendientesProtocoloCards } from './PendientesProtocoloCards'
import { claseDeAlerta, GRAVEDAD, ICONO_REPORTE, SEVERIDAD_ICONO, severidadMaxima } from './alertSeverity'
import { reporteTitulo } from './track/reportes/estados'
import { motivoAlertaIp } from './track/ipEstado'
import { EmptyState } from '../components/EmptyState'
import { SearchableSelect } from '../components/SearchableSelect'
import { MultiFilterMenu } from '../components/MultiFilterMenu'
import type { MultiFilterOption } from '../components/MultiFilterMenu'
import { FilterDropdown } from '../components/FilterDropdown'
import { ClearFilters, FilterSearch } from '../components/FilterBar'
import { coincideBusqueda, opcionesCoordinador, opcionesMedico, SIN_VALOR } from './alertFilters'
import { Modal } from '../components/Modal'
import { useFechaPasada } from '../data/visits'
import type { TrackVisitRow } from '../data/visits'
import { useProtocols } from '../data/protocols'
import {
  useActiveAlerts, dismissAlert, restoreAlert, DISMISS_REASONS, reasonLabel,
  descarteListo, MOTIVO_OTRO,
} from '../data/alertDismissals'
import type { AlertKind } from '../data/alertDismissals'
import {
  deleteDeviation, deviationReasonLabel, inscripcionCerrada, isVisitDeviationRecorded,
} from '../data/deviations'
import { DocumentarDesviacionModal } from './DocumentarDesviacionModal'
import type { DocumentandoTarget } from './DocumentarDesviacionModal'
import { visitTitle } from '../lib/visits'
import { formatAR, todayISO, daysDiffISO, fromNow, isoDayAR } from '../lib/dates'
import { codecs } from '../lib/router'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import { GLOSARIO, GLOSARIO_ESTADOS } from '../lib/glosario'
import { VISIT_STATES } from './visitStates'
import { VisitDetail } from './track/VisitDetail'
import { useAbrirFicha } from './useAbrirFicha'
import type { ViewProps } from './types'
import { usePorRetomar } from '../data/pendientes'
import { agruparPorRetomar, cierreDeVentana, diasEsperando, visitasConFechaPasada } from './track/retomar'
import type { VisitaPorRetomar } from './track/retomar'
import { AgendarVisitaModal } from './track/agendar/AgendarVisitaModal'
import { pacienteDeVisita } from './track/agendar/opciones'

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
/* Botón de documentar la desviación (0130): hermano del que abre la visita, abajo a la derecha.
   CON NOMBRE y no un ícono suelto, que es la decisión de fondo: es la acción que RESUELVE el
   pendiente, y un segundo glifo mudo al lado de la X diría que las dos hacen lo mismo. Sólo lo
   llevan las de ventana vencida.
   El realce es por ELEVACIÓN (`.spira-card-link`), nunca un borde de color: en esta pantalla el
   color ya significa gravedad clínica y teñir un botón le robaría ese sentido. */
const deviationBtn: CSSProperties = {
  position: 'absolute', bottom: 8, right: 8,
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '5px 10px', borderRadius: 9,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12,
  color: 'var(--spira-ink)',
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
/** La opción del filtro Estado para el IP sin entregar (0119). Tampoco es un `computed_status`. */
const IP_SIN_ENTREGAR = 'ip_sin_entregar'
/** La opción del filtro Estado para los procedimientos por retomar (v0145). No es un `computed_status`. */
const POR_RETOMAR = 'por_retomar'
/** La opción del filtro Estado para las visitas con la fecha pasada (2026-09-28). Tampoco es un
 *  `computed_status`: para la base son `proxima`. */
const FECHA_PASADA = 'fecha_pasada'
/** Su tinta: el ámbar profundo de «todavía no es un desvío, pero pide atención», el mismo del IP sin
 *  entregar. Se distinguen por el ícono y el rótulo. Es el token que se aclara en tema oscuro. */
const TINTA_FECHA_PASADA = 'var(--spira-acc-deep-warn)'

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
  /* La cuarta lista (v0145): visitas con procedimientos dejados para otro día. Consulta propia: no
     es una alerta de la visita (la visita ya cerró) sino trabajo que espera. Su error se muestra en
     línea, como el del IP: que falle no puede tirar la pantalla entera. */
  const retomarQ = usePorRetomar()
  const retomarRows = useMemo(
    () => agruparPorRetomar(retomarQ.data?.marcas ?? [], retomarQ.data?.visitas ?? []),
    [retomarQ.data],
  )
  const [agendando, setAgendando] = useState<VisitaPorRetomar | null>(null)
  /* La quinta lista (2026-09-28): visitas cuya fecha pasó sin hacerse, con la ventana abierta. La
     base no las marca —siguen `proxima`— y por eso no avisaban en ningún lado hasta vencer. Consulta
     propia, error en línea, como las otras dos que no son estados de la visita. */
  const fechaQ = useFechaPasada()
  const fechaRows = useMemo(() => visitasConFechaPasada(fechaQ.data ?? [], todayISO()), [fechaQ.data])
  const [reprogramando, setReprogramando] = useState<TrackVisitRow | null>(null)
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
  const [documentando, setDocumentando] = useState<DocumentandoTarget | null>(null)
  const [showDismissed, setShowDismissed] = useUrlState('descartadas', false, { codec: codecs.bool })
  /* Mismo gesto y mismo lugar que los descartes, con su propio parámetro en la URL: son dos
     archivos distintos y quien comparte un link puede querer abrir cualquiera de los dos. */
  const [showDeviations, setShowDeviations] = useUrlState('desviaciones', false, { codec: codecs.bool })
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

  /* Llegada CON un protocolo para filtrar (desde el KPI "Ventanas por vencer" de la ficha del
     protocolo). Es el mismo `setProtocolFilter` que escribe el atajo de las tarjetas de más abajo,
     así que la pantalla queda en un estado que el usuario podría haber armado a mano — y la URL lo
     dice, o sea que es dictable y sobrevive un F5.

     Efecto aparte del de `visitId` y no una rama del mismo: son dos objetivos independientes (se
     puede llegar con uno, con el otro o con los dos) y unirlos obligaría a que consumir uno
     descartara el otro. */
  useEffect(() => {
    const filtro = navTarget?.protocolFilter
    if (!filtro || filtro.length === 0) return
    setProtocolFilter(filtro)
    onTargetConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget, onTargetConsumed])

  /* Con `retomarQ` acá también: sin ella, la lista de retomar podía llegar VACÍA todavía (la consulta
     en vuelo) mientras las otras tres ya estaban, y «Sin pendientes. Todo al día.» se dibujaba un
     instante de más antes de que aparecieran sus filas. */
  const loading = alertsQ.loading || protocols.loading || retomarQ.loading || fechaQ.loading
  const error = alertsQ.error || protocols.error

  const allRows = alertsQ.visitAlerts
  const procRows = alertsQ.reportAlerts
  const ipRows = alertsQ.ipAlerts
  const dismissals = alertsQ.dismissals
  const deviations = alertsQ.deviations

  /* Las que quedaron SIN DOCUMENTAR: ventanas vencidas de inscripciones ya cerradas. Salieron de
     la lista activa porque no hay nada que hacer con ellas —el paciente no está más en el estudio—
     pero no desaparecen: se listan acá, con su marca, para que el número no se esconda. Salen de
     `allVisitAlerts` (las CRUDAS) justamente porque el filtro de la lista activa ya las sacó. */
  const sinDocumentar = useMemo(
    () => alertsQ.allVisitAlerts.filter(
      (a) => a.computed_status === 'ventana_vencida' &&
        inscripcionCerrada(a.enrollment_status) &&
        !isVisitDeviationRecorded(deviations, a),
    ),
    [alertsQ.allVisitAlerts, deviations],
  )

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
        const age = daysDiffISO(isoDayAR(r.report_due_at), today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [procRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

  /* La tercera lista: IP sin entregar (0119). Los MISMOS cinco filtros que las otras dos — una lista
     que un filtro no alcanza queda siempre entera o siempre vacía, y las dos cosas mienten. */
  const filteredIp = useMemo(() => {
    const today = todayISO()
    return ipRows.filter((r) => {
      if (fEstado.length > 0 && !fEstado.includes(IP_SIN_ENTREGAR)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(r.protocol_id)) return false
      if (fMed.length > 0 && !fMed.includes(r.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(r.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(r, q)) return false
      if (ageDays > 0) {
        const age = daysDiffISO(isoDayAR(r.vence_at), today)
        if (age > ageDays) return false
      }
      return true
    })
  }, [ipRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

  /* Los MISMOS cinco filtros que las otras tres: una lista que un filtro no alcanza queda siempre
     entera o siempre vacía, y las dos cosas mienten. */
  const filteredRetomar = useMemo(() => {
    const today = todayISO()
    return retomarRows.filter((g) => {
      const v = g.visita
      if (fEstado.length > 0 && !fEstado.includes(POR_RETOMAR)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(v.protocol_id)) return false
      if (fMed.length > 0 && !fMed.includes(v.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(v.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(v, q)) return false
      if (ageDays > 0 && diasEsperando(g.desde, today) > ageDays) return false
      return true
    })
  }, [retomarRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

  /* Los MISMOS cinco filtros. La antigüedad se mide desde la fecha que se pasó. */
  const filteredFecha = useMemo(() => {
    const today = todayISO()
    return fechaRows.filter((v) => {
      if (fEstado.length > 0 && !fEstado.includes(FECHA_PASADA)) return false
      if (protocolFilter.length > 0 && !protocolFilter.includes(v.protocol_id)) return false
      if (fMed.length > 0 && !fMed.includes(v.treating_physician ?? SIN_VALOR)) return false
      if (fCoord.length > 0 && !fCoord.includes(v.coordinator_id ?? SIN_VALOR)) return false
      if (!coincideBusqueda(v, q)) return false
      if (ageDays > 0 && v.estimated_date && daysDiffISO(v.estimated_date, today) > ageDays) return false
      return true
    })
  }, [fechaRows, fEstado, protocolFilter, fMed, fCoord, q, ageDays])

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
    for (const r of ipRows) byId.set(r.protocol_id, r.protocol_code)
    for (const g of retomarRows) byId.set(g.visita.protocol_id, g.visita.protocol_code)
    for (const v of fechaRows) byId.set(v.protocol_id, v.protocol_code)
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
      + procRows.filter((r) => r.protocol_id === p.id).length
      + ipRows.filter((r) => r.protocol_id === p.id).length
      + retomarRows.filter((g) => g.visita.protocol_id === p.id).length
      + fechaRows.filter((v) => v.protocol_id === p.id).length,
  }))

  /* Los CUATRO avisos de esta pantalla en un solo eje. Los de `GRAVEDAD` son estados calculados de
     la visita; los otros tres no lo son —IP sin entregar, reporte pendiente y procedimientos por
     retomar viven cada uno en su propia consulta— pero como FILTRO pertenecen acá: quien mira piensa
     "mostrame sólo los reportes" (o el IP, o lo por retomar), no "cruzá cuatro listas".

     ⚠️ ESTA LISTA ES UN CONSUMIDOR DE LA CLASE DE ALERTA y hay que barrerla cada vez que la clase
     se ensancha. La 0107 sumó "Por reprogramar" y esto quedó con tres opciones: las visitas de
     "No vino" no se podían pedir por filtro, no aparecían en el menú con su conteo, y tildar
     cualquier otra opción las escondía sin manera de traerlas de vuelta. Nada falló — el menú se
     dibujaba perfecto con una opción menos. El orden es el de GRAVEDAD, igual que el desglose de
     las tarjetas de arriba. */
  const estadoOptions: MultiFilterOption[] = [
    ...GRAVEDAD.map((s) => ({
      value: s,
      label: VISIT_STATES[s].label,
      count: allRows.filter((a) => a.computed_status === s).length,
    })),
    // 2026-09-28: después de los estados de la visita —es su antesala: si nadie la reprograma, se
    // vuelve «Ventana vencida»— y antes de lo que no es la visita en sí.
    { value: FECHA_PASADA, label: 'Se pasó la fecha', count: fechaRows.length },
    // 0119: el barrido que pide el aviso de arriba. Va antes del reporte: es más grave.
    { value: IP_SIN_ENTREGAR, label: 'IP sin entregar', count: ipRows.length },
    { value: REPORTE_PENDIENTE, label: 'Reporte pendiente', count: procRows.length },
    { value: POR_RETOMAR, label: 'Por retomar', count: retomarRows.length },
  ]

  /* Las cuatro listas juntas: un médico que sólo tiene reportes pendientes (o un IP sin entregar, o
     un procedimiento por retomar) tiene que aparecer igual en el menú, o sus alertas quedan
     inalcanzables por filtro. */
  const medOptions = opcionesMedico([allRows, procRows, ipRows, retomarRows.map((g) => g.visita), fechaRows])
  const coordOptions = opcionesCoordinador([allRows, procRows, ipRows, retomarRows.map((g) => g.visita), fechaRows])

  const nFiltros = fEstado.length + protocolFilter.length + fMed.length + fCoord.length + (ageDays > 0 ? 1 : 0)
  const hayFiltros = nFiltros > 0 || q.trim() !== ''
  const limpiarFiltros = () => {
    setFEstado([]); setProtocolFilter([]); setFMed([]); setFCoord([]); setAgeDays(0); setQ('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* El atajo por protocolo: tildar una tarjeta escribe el MISMO `protocolFilter` que el
          desplegable de abajo, así que las dos son la misma preferencia vista de dos maneras. Va
          ARRIBA de la barra, como en Stock: primero elegís en qué mirás y después lo afinás.
          Recibe las listas CRUDAS a propósito — ver el comentario del componente. */}
      <PendientesProtocoloCards
        visitas={allRows}
        reportes={procRows}
        ips={ipRows}
        retomar={retomarRows.map((g) => g.visita)}
        fechaPasada={fechaRows}
        protocols={protocols.data ?? []}
        seleccionados={protocolFilter}
        accentSolid={module.accentSolid}
        onToggle={(id) => setProtocolFilter(
          protocolFilter.includes(id) ? protocolFilter.filter((x) => x !== id) : [...protocolFilter, id],
        )}
      />

      {/* LA MISMA BARRA QUE "VISITAS DEL DÍA", con los mismos componentes y no con copias parecidas
          (pedido del Director: "que se vean iguales y que interactúen igual"). `MultiFilterMenu` ya
          era compartido; el buscador y el botón de limpiar se extrajeron a `components/FilterBar`,
          y Visitas usa los mismos — que es lo único que garantiza que sigan iguales cuando alguien
          ajuste uno.

          (Acá vivía una nota diciendo que faltaban Médico y Coordinador "porque las consultas no los
          traen". Los trajo la 0103 y los dos menús están dibujados abajo desde entonces: la nota
          quedó describiendo una pantalla que ya no existe.) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <MultiFilterMenu accent={accent} label="Estado" icon="filter" options={estadoOptions} selected={fEstado} onChange={setFEstado} />
        <MultiFilterMenu accent={accent} label="Protocolo" icon="file" options={protoMultiOptions} selected={protocolFilter} onChange={setProtocolFilter} searchPlaceholder="Buscar protocolo…" />
        <MultiFilterMenu accent={accent} label="Médico" icon="users" options={medOptions} selected={fMed} onChange={setFMed} />
        <MultiFilterMenu accent={accent} label="Coordinador" icon="user" options={coordOptions} selected={fCoord} onChange={setFCoord} />
        <span style={{ width: 1, height: 22, background: 'var(--spira-line)', margin: '0 2px' }} />
        {/* La antigüedad es un UMBRAL, no una selección múltiple: "últimos 7 días" y "últimos 30"
            no se suman, uno contiene al otro. Por eso va en el desplegable simple, el mismo hueco
            que en Visitas ocupa "Ordenar por".
            Sin prefijo y con rótulo neutro: quieto dice "Antigüedad", como "Estado" o "Protocolo"
            a su izquierda, y con un umbral elegido dice el umbral. "Antigüedad: Cualquier
            antigüedad" repetía la palabra y medía el doble — era lo que partía la barra. */}
        <FilterDropdown
          accent={accent}
          value={String(ageDays)}
          onChange={(v) => setAgeDays(Number(v))}
          options={ageOptions}
          menuLabel="Antigüedad"
          neutralLabel="Antigüedad"
          icon="clock"
        />
        {/* Mismo placeholder que Visitas (ver la nota ahí): sigue buscando por N°. */}
        <FilterSearch value={q} onChange={setQ} placeholder="Paciente o protocolo…" />
      </div>

      {/* El recuento y las descartadas bajan a su propia línea: son el RESULTADO de la barra, no un
          control más de ella. Arriba competían por el mismo borde derecho que el buscador y hacían
          que la fila envolviera en la notebook de referencia. Por la misma razón "Limpiar" vive
          acá (ver `ClearFilters`), pegado al número que el filtro cambió. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>
          {filtered.length + filteredProc.length + filteredIp.length + filteredRetomar.length + filteredFecha.length} de{' '}
          {allRows.length + procRows.length + ipRows.length + retomarRows.length + fechaRows.length}{' '}
          {allRows.length + procRows.length + ipRows.length + retomarRows.length + fechaRows.length === 1 ? 'pendiente' : 'pendientes'}
        </span>
        {hayFiltros && <ClearFilters n={nFiltros} onClear={limpiarFiltros} />}
        {dismissals.length > 0 && (
          <button type="button" style={linkBtn} onClick={() => setShowDismissed((v) => !v)}>
            {/* "descartados" en masculino: concuerda con "pendientes", que es el sustantivo de
                esta pantalla desde el renombre. Con "alertas" era femenino. */}
            {showDismissed ? 'Ocultar descartados' : `Ver descartados (${dismissals.length})`}
          </button>
        )}
        {/* Las desviaciones van en FEMENINO porque el sustantivo es otro: acá no se nombran
            pendientes sino desviaciones de protocolo, que es el término clínico y el que va a
            buscar quien las necesite. El contador suma las documentadas y las que quedaron sin
            documentar (0130). */}
        {(deviations.length > 0 || sinDocumentar.length > 0) && (
          <button type="button" style={linkBtn} onClick={() => setShowDeviations((v) => !v)}>
            {showDeviations
              ? 'Ocultar desviaciones'
              : `Ver desviaciones (${deviations.length + sinDocumentar.length})`}
          </button>
        )}
      </div>

      {/* Arriba del cajón y no debajo: "Restaurar" se aprieta ADENTRO del cajón, así que con el
          aviso abajo el mensaje de error aparecía fuera de la vista justo cuando la acción falla. */}
      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '10px 13px' }}>
          <Icon name="alertCircle" size={17} color="var(--spira-danger)" />
          {actionError}
        </div>
      )}

      {/* EL CAJÓN VA ACÁ, PEGADO A SU BOTÓN, y no al final de la pantalla como estaba.
          El botón vive en esta línea y el panel se dibujaba DESPUÉS de la lista entera: con
          cuarenta y pico de pendientes, tildarlo no cambiaba nada de lo que se veía y había que
          scrollear hasta el fondo para descubrir que sí había hecho algo. Un control cuyo efecto
          ocurre fuera de la vista se lee como un botón roto. Ahora el archivo se despliega donde se
          lo pidió, y la lista de pendientes queda abajo — que es el orden en que se leen las dos
          cosas: "esto decidí no atender" y después "esto sí".

          El archivo, no la papelera: nada se borró — la condición clínica sigue en la base y esto es
          el registro de quién decidió no atenderla, con su motivo. Restaurar la devuelve a la lista. */}
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

      {/* EL PANEL GEMELO: las desviaciones documentadas (0130). Misma anatomía y mismo gesto que
          el de descartados —si dos cosas se piden igual, tienen que verse igual—, con dos
          diferencias que importan:
          · lo que se lee acá NO es "decidí no atender esto" sino el registro clínico de por qué
            una visita no se hizo en su ventana, que es lo que un monitor va a pedir;
          · abajo van las que quedaron SIN documentar, que son las de pacientes que ya salieron
            del estudio: no piden acción, pero su número no se esconde. */}
      {showDeviations && (deviations.length > 0 || sinDocumentar.length > 0) && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15 }}>Desviaciones</div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>
            No se borró nada: la visita sigue como está y esto es el registro de por qué no se hizo
            en su ventana. Las de pacientes que ya salieron del estudio aparecen acá sin pedir acción.
          </div>
          <div style={{ marginTop: 8 }}>
            {deviations.map((d) => {
              const vis = alertsQ.allVisitAlerts.find((a) => a.id === d.visit_id)
              const abrirPac = abrirFicha && vis ? () => abrirFicha(vis.patient_id, vis.protocol_id) : undefined
              const detalle = vis ? visitTitle(vis) : 'Visita'
              return (
                <div key={d.id} style={dismissedRow}>
                  <Icon name="clipboardCheck" size={16} color="var(--spira-faint)" style={{ flex: '0 0 auto', marginTop: 2 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="spira-link-group" style={{ fontSize: 13, fontWeight: 600 }}>
                      {vis
                        ? <PatientLink onOpen={abrirPac} label={`Abrir la ficha de ${vis.patient_name}`}>{vis.patient_name}</PatientLink>
                        : 'Visita ya no vigente'}
                      {abrirPac && <span style={{ marginLeft: 8 }}><PatientLinkArrow /></span>}
                      <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}> · {detalle}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {deviationReasonLabel(d.reason)} — {d.detail} · {d.recorded_by_name}
                      <span style={{ color: 'var(--spira-muted)' }}> ({d.recorded_by_role}) · {fromNow(d.recorded_at)}</span>
                    </div>
                  </div>
                  {/* "Borrar" y no "Restaurar": una desviación no vuelve a la lista, se corrige.
                      La 0130 no tiene UPDATE a propósito — se borra y se documenta de nuevo, y el
                      audit_log guarda las dos decisiones en vez de una sobrescrita. */}
                  <button
                    type="button"
                    style={linkBtn}
                    onClick={async () => {
                      setActionError(null)
                      const { error: e } = await deleteDeviation(d.id)
                      if (e) setActionError(e)
                      else alertsQ.refetch()
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )
            })}
            {sinDocumentar.map((a) => (
              <div key={`sd-${a.id}`} style={dismissedRow}>
                <Icon name="alertCircle" size={16} color="var(--spira-faint)" style={{ flex: '0 0 auto', marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="spira-link-group" style={{ fontSize: 13, fontWeight: 600 }}>
                    <PatientLink
                      onOpen={abrirFicha && (() => abrirFicha(a.patient_id, a.protocol_id))}
                      label={`Abrir la ficha de ${a.patient_name}`}
                    >
                      {a.patient_name}
                    </PatientLink>
                    {abrirFicha && <span style={{ marginLeft: 8 }}><PatientLinkArrow /></span>}
                    <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}> · {visitTitle(a)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    Sin documentar · ventana vencida el {a.window_end ? formatAR(a.window_end) : '—'} ·
                    el paciente ya no está en el estudio
                  </div>
                </div>
              </div>
            ))}
          </div>
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
        {alertsQ.ipError && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '8px 0 0' }}>
            No se pudieron cargar las alertas de producto en investigación: {alertsQ.ipError}
          </div>
        )}
        {retomarQ.error && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '8px 0 0' }}>
            No se pudieron cargar los procedimientos por retomar: {retomarQ.error}
          </div>
        )}
        {fechaQ.error && (
          <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '8px 0 0' }}>
            No se pudieron cargar las visitas con la fecha pasada: {fechaQ.error}
          </div>
        )}
        {filtered.length === 0 && filteredProc.length === 0 && filteredIp.length === 0 && filteredRetomar.length === 0 && filteredFecha.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            <Icon name="check" size={16} color="var(--spira-good)" />
            {allRows.length === 0 && procRows.length === 0 && ipRows.length === 0 && retomarRows.length === 0 && fechaRows.length === 0
              && !retomarQ.error && !fechaQ.error
              ? 'Sin pendientes. Todo al día.'
              /* Con el error de retomar puesto, la lista de retomar quedó vacía porque FALLÓ, no
                 porque no había nada: decir "Todo al día" ahí sería mentir sobre datos que no
                 llegaron a cargar (el aviso de arriba ya cuenta el error en detalle). */
              : 'Ningún pendiente coincide con los filtros.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredIp.map((r) => {
              /* IP sin entregar (0119). Ámbar `acc-deep-warn`, el de `CLASES.ip` de la campana: más
                 grave que un reporte en plazo, menos que una ventana vencida. SIN tacho: esta alerta
                 no se archiva — se resuelve en la visita (la entrega, o "No se entrega acá"), y a esa
                 visita lleva el gesto grande. */
              const c = 'var(--spira-acc-deep-warn)'
              const visita = r.visit_code ?? r.visit_name ?? 'Visita'
              const days = daysDiffISO(isoDayAR(r.vence_at), todayISO())
              return (
                <div key={`ip:${r.visit_id}`} style={{ position: 'relative' }}>
                <div
                  role="button"
                  tabIndex={0}
                  className="spira-card-link"
                  onClick={() => setOpenVisitId(r.visit_id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(r.visit_id) }
                  }}
                  aria-label={`Abrir la visita de ${r.patient_name} — producto en investigación sin entregar`}
                  style={alertItemStyle(c, { conBotonDescartar: false })}
                >
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="pill" size={18} color={c} /></span>
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
                      {motivoAlertaIp(r.estado)} · {visita}{days > 0 ? ` · hace ${days} d` : ''}
                    </div>
                  </div>
                </div>
                </div>
              )
            })}
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
              const days = daysDiffISO(isoDayAR(r.report_due_at), todayISO())
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
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name={ICONO_REPORTE} size={18} color={c} /></span>
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
                  style={alertItemStyle(c, {
                    conBotonDescartar: true,
                    conBotonDesviacion: a.computed_status === 'ventana_vencida',
                  })}
                >
                  <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                    {/* Desde `SEVERIDAD_ICONO` y no de un ternario propio, que resolvía por DOS vías
                        —ventana vencida, o el reloj para todo lo demás— y dejaba "no vino" y
                        "pendiente vencido" con el mismo glifo: la lista no los distinguía, aunque
                        el color sí. Tres clases, tres íconos. */}
                    <Icon name={SEVERIDAD_ICONO[claseDeAlerta(a.computed_status)]} size={18} color={c} />
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
                {/* SÓLO la ventana vencida. "No vino" y "pendiente vencido" no son desviaciones de
                    ventana: se resuelven de otra manera y quedan como estaban. */}
                {a.computed_status === 'ventana_vencida' && (
                  <button
                    type="button"
                    style={deviationBtn}
                    className="spira-card-link"
                    title="Registrar por qué esta visita no se hizo en su ventana"
                    aria-label={`Documentar la desviación de ${a.patient_name}`}
                    onClick={() => setDocumentando({
                      visitId: a.id,
                      label: `${VISIT_STATES[a.computed_status].label} · ${vName} · ${a.patient_name}`,
                    })}
                  >
                    <Icon name="clipboardCheck" size={14} />
                    Documentar desviación
                  </button>
                )}
                </div>
              )
            })}
            {filteredFecha.map((v) => {
              /* Se pasó la fecha (2026-09-28). Ámbar: todavía no es un desvío —la ventana sigue
                 abierta— pero si nadie la reprograma, lo va a ser. SIN tacho: sale de la lista
                 reprogramándola («Agendar»), haciéndola, o vence y pasa a «Ventana vencida». */
              const c = TINTA_FECHA_PASADA
              const cierre = cierreDeVentana(v, todayISO())
              return (
                <div key={`fecha:${v.id}`} style={{ position: 'relative' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="spira-card-link"
                    onClick={() => setOpenVisitId(v.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(v.id) }
                    }}
                    aria-label={`Abrir la visita de ${v.patient_name} — se pasó la fecha`}
                    style={alertItemStyle(c, { conBotonDesviacion: true })}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="calendar" size={18} color={c} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha de ${v.patient_name}`}>
                            {v.patient_name}
                          </PatientLink>
                        </span>
                        <span style={code}>{v.patient_code ?? '—'}</span>
                        {abrirFicha && <PatientLinkArrow />}
                        <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span style={code}>{v.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        Se pasó la fecha: {v.estimated_date ? formatAR(v.estimated_date) : '—'} · {visitTitle(v)}{cierre ? ` · ${cierre}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={deviationBtn}
                    className="spira-card-link"
                    aria-label={`Reprogramar la visita de ${v.patient_name}`}
                    onClick={() => setReprogramando(v)}
                  >
                    Agendar
                  </button>
                </div>
              )
            })}
            {filteredRetomar.map((g) => {
              /* Procedimientos por retomar (v0145). Tono NEUTRO: no es un desvío ni está vencido, es
                 trabajo que espera fecha. SIN tacho: sale de la lista retomándolo («Agendar») o
                 dándolo por hecho en la visita («¿Qué se hizo hoy?»), no descartándolo. */
              const c = 'var(--spira-muted)'
              const v = g.visita
              const fecha = v.real_date ?? v.estimated_date
              const dias = diasEsperando(g.desde, todayISO())
              return (
                <div key={`retomar:${v.id}`} style={{ position: 'relative' }}>
                  <div
                    role="button"
                    tabIndex={0}
                    className="spira-card-link"
                    onClick={() => setOpenVisitId(v.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenVisitId(v.id) }
                    }}
                    aria-label={`Abrir la visita de ${v.patient_name} — procedimientos para otro día`}
                    style={alertItemStyle(c, { conBotonDesviacion: true })}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}><Icon name="clock" size={18} color={c} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          <PatientLink onOpen={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))} label={`Abrir la ficha de ${v.patient_name}`}>
                            {v.patient_name}
                          </PatientLink>
                        </span>
                        <span style={code}>{v.patient_code ?? '—'}</span>
                        {abrirFicha && <PatientLinkArrow />}
                        <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span style={code}>{v.protocol_code}</span></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {visitTitle(v)}{fecha ? ` · ${formatAR(fecha)}` : ''} · {g.procedimientos.map((x) => x.name).join(', ')}
                        {dias > 0 ? ` · espera hace ${dias} d` : ' · desde hoy'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={deviationBtn}
                    className="spira-card-link"
                    aria-label={`Agendar lo pendiente de ${v.patient_name}`}
                    onClick={() => setAgendando(g)}
                  >
                    Agendar
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {/* La leyenda tiene que nombrar el color que se VE, y por eso SE ARMA sola desde
            `GRAVEDAD`: escrita a mano ya quedó falsa dos veces —decía "petróleo" cuando el reporte
            pendiente pasó a azul, y se olvidó del terracota cuando la 0107 sumó "Por reprogramar"—.
            Un texto que explica los colores y no nombra uno de los que están en pantalla es peor
            que no tener leyenda: es justamente lo que alguien lee cuando no entiende un tinte.
            El punto va al lado del nombre en vez de describir el color con una palabra: "terracota"
            no le dice nada a nadie, y el color se puede mirar. */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)', fontSize: 11.5, color: 'var(--spira-muted)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* CADA RÓTULO DE LA LEYENDA EXPLICA SU ESTADO al apuntarlo, y acá sí lleva la marca
              visual del glosario: la leyenda aparece UNA vez por pantalla y es, literalmente, el
              lugar al que va alguien que no entiende lo que está viendo. Marcar acá enseña que la
              app se puede preguntar, sin salpicar de punteados la lista de arriba. */}
          {[...GRAVEDAD.map((s) => ({ label: VISIT_STATES[s].label, color: VISIT_STATES[s].color, ayuda: GLOSARIO_ESTADOS[s] })),
            { label: 'Se pasó la fecha', color: TINTA_FECHA_PASADA, ayuda: GLOSARIO.fechaPasada },
            { label: 'Reporte pendiente', color: 'var(--spira-acc-deep-blue)', ayuda: GLOSARIO.reportePendiente }].map((x) => (
            <span key={x.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: x.color, flex: '0 0 auto' }} />
              <abbr className="spira-termino" title={x.ayuda}>{x.label}</abbr>
            </span>
          ))}
        </div>
      </div>

      {dismissing && (
        <DismissModal
          target={dismissing}
          accent={accent}
          onClose={() => setDismissing(null)}
          onDone={() => { setDismissing(null); setActionError(null); alertsQ.refetch() }}
          onError={(msg) => { setDismissing(null); setActionError(msg) }}
        />
      )}

      {documentando && (
        <DocumentarDesviacionModal
          target={documentando}
          accent={accent}
          onClose={() => setDocumentando(null)}
          onDone={() => { setDocumentando(null); setActionError(null); alertsQ.refetch() }}
          onError={(msg) => { setDocumentando(null); setActionError(msg) }}
        />
      )}

      {openVisitId && (
        <VisitDetail
          visitId={openVisitId}
          accent={accent}
          onClose={() => setOpenVisitId(null)}
          onChanged={() => { alertsQ.refetch(); retomarQ.refetch(); fechaQ.refetch() }}
          // El mismo gesto que ya tiene la fila: reusa `abrirFicha`, que ya cae a `undefined`
          // sin `onNavigate` y así el encabezado del modal degrada solo a texto.
          onOpenPatient={abrirFicha}
        />
      )}

      {agendando && (
        /* El MISMO «Agendar visita» de la ficha, con el paciente fijo y «Continuar pendientes» ya
           elegido sobre esa visita (spec §4): no hay que volver a buscarla. */
        <AgendarVisitaModal
          modo="paciente"
          paciente={pacienteDeVisita(agendando.visita)}
          preseleccion={{ tipo: 'continuar', origenId: agendando.visita.id }}
          accent={module.accentSolid}
          onClose={() => setAgendando(null)}
          onDone={() => { setAgendando(null); retomarQ.refetch(); alertsQ.refetch() }}
        />
      )}

      {reprogramando && (
        /* El MISMO «Agendar visita», con el paciente fijo y la visita ya elegida en «Una visita
           pendiente del estudio». La fecha arranca en hoy y se puede cambiar: reprogramar no siempre
           es «para hoy». */
        <AgendarVisitaModal
          modo="paciente"
          paciente={pacienteDeVisita(reprogramando)}
          preseleccion={{ tipo: 'traer', visitaId: reprogramando.id }}
          accent={module.accentSolid}
          onClose={() => setReprogramando(null)}
          onDone={() => { setReprogramando(null); fechaQ.refetch(); alertsQ.refetch() }}
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
  /* La condición NO se escribe acá: la comparten esta pantalla y el popover de la campana, que
     archivan la misma alerta con el mismo RPC. Ver `descarteListo` en `alertDismissalModel`. */
  const necesitaDetalle = reason === MOTIVO_OTRO
  const listo = descarteListo(reason, detail)

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
