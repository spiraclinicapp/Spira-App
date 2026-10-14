import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { btnOutline, btnPrimary } from '../components/buttons'
import { FilterDropdown } from '../components/FilterDropdown'
import type { FilterOption } from '../components/FilterDropdown'
import { FilterSearch } from '../components/FilterBar'
import { hayPopoverAbierto } from '../components/usePopover'
import { todayISO } from '../lib/dates'
import { visitCode } from '../lib/visits'
import { useVisitPermissions } from '../lib/visitPermissions'
import { codecs, oneOf } from '../lib/router'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import { useAbrirFicha } from './useAbrirFicha'
import {
  claveRango, useVisitsForDay, useVisitsForRange, markArrived, startVisitAttention, markReady,
  markReadyWithOutcome, discontinueEnrollment,
} from '../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../data/dayVisits'
import { useRandoAttendedWithoutDate } from '../data/visits'
import { useDayProcedureRows } from '../data/procedures'
import { useVisitsIpStatus } from '../data/visitIp'
import { armarResumenesDelDia } from './track/resumenVisita'
import { DayVisitRowItem } from './track/DayVisitRowItem'
import { VisitDetail } from './track/VisitDetail'
import { ReadyOutcomeModal } from './track/ReadyOutcomeModal'
import { AgendarVisitaModal } from './track/agendar/AgendarVisitaModal'
import { pacienteDeVisita } from './track/agendar/opciones'
import { useProtocols } from '../data/protocols'
import { DoctorRequestModal } from './track/DoctorRequestModal'
import { useAvisoAlFinalizar } from './track/useAvisoAlFinalizar'
import { useAccionesDeVisita } from './track/useAccionesDeVisita'
import {
  VISTAS, compararVisitas, conFinDeSemana, contarPorGrupo, estadoDeFila, grupoDeVisita, pasoPeriodo,
  periodoDe, rangoDeConsulta, visitasDelPeriodo, visitasPorDia,
} from './track/visitas/calendario'
import type { VistaCalendario } from './track/visitas/calendario'
import { NONE, SIN_FILTROS, atajoDeTecla, coincideBusqueda, pasaFiltros } from './track/visitas/filtrosVisitas'
import type { CategoriaFiltro, Filtros } from './track/visitas/filtrosVisitas'
import { ORDEN_ESTADOS, rotuloEstado } from './track/visitas/estados'
import { BarraPeriodo } from './track/visitas/BarraPeriodo'
import { FichasFiltros, PanelFiltros } from './track/visitas/PanelFiltros'
import { VistaMes, VistaSemana } from './track/visitas/VistasCalendario'
import './track/visitas/visitas.css'
import type { TrackVisitRow } from '../data/visits'
import type { ViewProps } from './types'

/** Cómo se parte la lista del Día. 'operativo' = En el centro / Por llegar / Finalizadas (default). */
type GroupBy = 'operativo' | 'estado' | 'protocolo' | 'medico' | 'coordinador' | 'ninguno'

/**
 * Coordinación › Visitas: vistas Mes / Semana / Día (handoff `docs/design_handoff_visitas_calendario/`,
 * 2026-10-11, plan en `PLAN.md` de esa carpeta). Antes era sólo «Visitas del día v2»; el Día sigue
 * siendo la vista por defecto y la única con acciones —Semana y Mes llevan a él—.
 *
 *   BarraPeriodo  ‹ Hoy ›  ·  período + contadores (abre el calendario)  ·  Mes | Semana | Día
 *   fila          [Filtros ▾]  ·  (Día) Ordenar por  ·  buscador
 *   FichasFiltros una por valor elegido
 *   cuerpo        Día: lista agrupada  ·  Semana: columnas L–V  ·  Mes: grilla
 */
export function DayVisitsView({ module, submodule, onNavigate, setHeader, navTarget, onTargetConsumed }: ViewProps) {
  const accent = module.accent
  const accentSolid = module.accentSolid
  /* Todo esto vive en la URL (ver docs/superpowers/specs/2026-08-23-urls-navegacion-design.md §4.3).
     Van en modo 'replace' —el default del hook— porque filtrar, cambiar de día o de vista NO es
     navegar: si apilaran, salir de esta vista después de un rato trabajando serían quince "atrás".
     La fecha sigue en `dia` (y no en el `fecha` que sugería el handoff) porque los links ya
     compartidos la usan; `vista` es nuevo y por defecto es el Día, así un link viejo abre igual. */
  const [vista, setVista] = useUrlState<VistaCalendario>('vista', 'dia', { codec: oneOf(VISTAS) })
  const [date, setDateRaw] = useUrlState('dia', todayISO())
  /* Cada vista pide lo suyo y nada más: el Día, su día (y de ahí sus procedimientos y su IP); Semana y
     Mes, un RANGO (la grilla del mes excede al mes). El que no corresponde va en `null` y no consulta:
     si no, cada ‹ › en el Mes pediría además tres consultas de un día que nadie está mirando. */
  const day = useVisitsForDay(vista === 'dia' ? date : null)
  const rango = vista === 'dia' ? null : rangoDeConsulta(vista, date)
  const rangoQ = useVisitsForRange(rango)
  /* Los datos del rango vienen etiquetados (`claveRango`): mientras la etiqueta no sea la del rango
     que se está mirando, son de la semana o el mes anterior y la grilla los recortaría a «0 visitas».
     Eso es «cargando», no «vacío». */
  const rangoListo = rango !== null && rangoQ.data?.clave === claveRango(rango)
  /* Después de una acción que crea o mueve visitas, se refresca lo que se está mirando. */
  const refrescar = () => { day.refetch(); if (vista !== 'dia') rangoQ.refetch() }
  const randoPending = useRandoAttendedWithoutDate()

  // Filtros multi (AND entre categorías, OR dentro) + buscador + agrupación. Las claves de la URL son
  // las de siempre: un link filtrado de antes del rediseño abre filtrado igual.
  const [q, setQ] = useUrlState('buscar', '')
  const [fEstado, setFEstado] = useUrlState<string[]>('estado', [], { codec: codecs.list })
  const [fProto, setFProto] = useUrlState<string[]>('protocolo', [], { codec: codecs.list })
  const [fMed, setFMed] = useUrlState<string[]>('medico', [], { codec: codecs.list })
  const [fCoord, setFCoord] = useUrlState<string[]>('coordinadora', [], { codec: codecs.list })
  const [group, setGroup] = useUrlState<GroupBy>('agrupar', 'operativo', {
    codec: oneOf(['operativo', 'estado', 'protocolo', 'medico', 'coordinador', 'ninguno'] as const),
  })
  const filtros: Filtros = useMemo(
    () => ({ estado: fEstado, protocolo: fProto, medico: fMed, coordinador: fCoord }),
    [fEstado, fProto, fMed, fCoord],
  )
  /* Cada setter relee la URL al escribir (`useUrlState`), así que los cuatro seguidos componen. Sólo
     se tocan los que cambiaron: escribir un parámetro igual reemplazaría la entrada de historial al
     pedo. */
  const setFiltros = (f: Filtros) => {
    if (f.estado !== fEstado) setFEstado(f.estado)
    if (f.protocolo !== fProto) setFProto(f.protocolo)
    if (f.medico !== fMed) setFMed(f.medico)
    if (f.coordinador !== fCoord) setFCoord(f.coordinador)
  }

  const [busyId, setBusyId] = useState<string | null>(null)
  const [doctorFor, setDoctorFor] = useState<DayVisitRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const protocolsQ = useProtocols()
  // Cierre clínico (screening/randomización) y recitación. TrackVisitRow: sirve para una fila
  // del día (DayVisitRow lo extiende) o una de la salvaguarda (que no es de hoy).
  const [readyOutcome, setReadyOutcome] = useState<TrackVisitRow | null>(null)
  const [recitar, setRecitar] = useState<TrackVisitRow | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  /* Quién puede qué vive en un solo lugar, compartido con el modal de la visita: si la regla se
     duplicara, la fila y el modal podrían terminar diciendo cosas distintas del mismo permiso. */
  const { canReception, canClinical, coordina, loading: permisosCargando } = useVisitPermissions()
  /* Los estudios en los que se puede agendar desde acá (v0145): activos y en los que la persona
     tiene la parte clínica (la misma regla que `puede_registrar_visitas`, salvo gerencia, que no
     opera el día). Sin ninguno, el botón no se dibuja. */
  const protocolosParaAgregar = (protocolsQ.data ?? [])
    .filter((p) => p.status === 'activo' && canReception && canClinical({ protocol_id: p.id }))
    .map((p) => ({ id: p.id, code: p.code, name: p.name }))
  const aviso = useAvisoAlFinalizar(accentSolid)

  /* Abrir la ficha del paciente desde la fila (no desde el modal: ese ya tiene la suya, más abajo).
     Esta vista SÍ consume `navTarget`, así que la vuelta puede prometer el día que estabas mirando
     — pero no la visita puntual: desde la LISTA no hay ninguna abierta, prometerlo sería mentir. */
  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({
      moduleKey: module.key,
      subKey: submodule.key,
      target: { visitDate: date },
      label: 'Volver a las visitas',
      hint: `Volver a las visitas del día`,
    }),
  })

  const hoy = todayISO()
  const isToday = date === hoy
  const rows = day.data ?? []
  /* La tira de indicadores de cada fila: qué lleva la visita (procedimientos, sangre, kit IP).
     TRES consultas para todo el día y no por fila —dos acá y la del IP al lado—, y las tres salen a
     la vez: ninguna depende de otra. La unión la hace `armarResumenesDelDia`, que es puro y tiene
     test; acá sólo se juntan las piezas. El estado del IP se lee de `v_visit_ip_status`, la misma
     fuente que el modal: con `dispenses_ip` los dos se contradecían (IP fuera de cronograma, valor
     sellado, cierres). */
  const dayProcs = useDayProcedureRows(rows)
  const dayIps = useVisitsIpStatus(rows.map((v) => v.id))
  const resumenes = useMemo(
    () => armarResumenesDelDia(rows, dayProcs.data?.asignaciones ?? [], dayProcs.data?.delEstudio ?? [], dayIps.data ?? []),
    [rows, dayProcs.data, dayIps.data],
  )

  /* Push al abrir y replace al cerrar (lo trae `useUrlEntity`): abrir el detalle ES navegar y el
     atrás tiene que cerrarlo, pero si cerrar también apilara, el atrás lo REABRIRÍA — y en esta
     vista abrir y cerrar cajones es el trabajo. Va el UUID completo y la FILA se deriva de las ya
     cargadas del DÍA: si la visita no es del día que estás mirando, no hay nada que abrir y queda en
     null (cambiar de día cierra el cajón solo). `setDate` además limpia `?visita=` a mano al cambiar
     de día, para que la URL no quede apuntando a una fila que ya no existe en el día nuevo.
     El tercer elemento (`moveVisitaId`) también reemplaza pero es para ABRIR sin apilar: lo usan el
     stepper ↑↓/j-k de `stepOpen` y el efecto de `navTarget` (el shell YA apiló su propia entrada).
     El `useMemo` no es opcional: sin él, `openVisit` es un objeto nuevo en cada render y esta vista
     tiene varios efectos con setters en deps (lección de la Fase C). */
  const [visitaId, setVisitaId, moveVisitaId] = useUrlEntity('visita')
  const openVisit = useMemo(
    () => (vista === 'dia' && visitaId ? (rows.find((r) => r.id === visitaId) ?? null) : null),
    [vista, visitaId, rows],
  )
  const setOpenVisit = (v: DayVisitRow | null) => setVisitaId(v?.id ?? null)
  const moveOpenVisit = (v: DayVisitRow | null) => moveVisitaId(v?.id ?? null)

  /* Cambiar de día tiene que soltar la visita abierta: si no, la URL queda con `?visita=<uuid>` de
     una fila que no va a estar en el día nuevo. `moveVisitaId` (replace): soltarla por un cambio de
     día no es un "atrás" pendiente, es la misma regla que cerrar el cajón a mano. */
  const setDate = (iso: string) => { setDateRaw(iso); moveVisitaId(null) }
  const paso = (n: number) => setDate(pasoPeriodo(vista, date, n))
  /* Clic en un día de la Semana o del Mes: esa fecha, en la vista Día (handoff §4 y §5). */
  const elegirDia = (iso: string) => { setDate(iso); setVista('dia') }

  /* Llegada CON objetivo (desde el resumen de Inicio: una visita puntual). Va en dos pasos porque
     la lista carga UN día: primero saltamos a la fecha de la visita —la de una alerta suele ser
     pasada— y a la vista Día (la única que abre visitas), y recién cuando ese día terminó de cargar la
     buscamos para abrir su modal. Abre con `moveOpenVisit` (replace): el shell YA apiló su propia
     entrada al traernos hasta acá. Se consume una sola vez, haya o no visita que abrir, para que un
     refetch no la reabra sola. Si no aparece, el usuario queda igual en la lista del día: no
     inventamos un detalle que no encontramos.

     Y LLEGADA CON SÓLO UN DÍA, sin visita (2026-10-09): el KPI y el pie de «Próximas visitas» del
     Resumen y el «volver» de esta misma vista prometen un día; se salta a ese día y se consume ahí.

     Y LLEGADA A LA SEMANA (2026-10-13): el KPI «Próximas visitas» dibuja una semana y lleva a esa
     semana (`visitView`). Mismos pasos que el día, sin buscar visita: la Semana no abre ninguna. */
  useEffect(() => {
    if (navTarget?.visitView === 'semana') {
      if (vista !== 'semana') { setVista('semana'); return }
      if (navTarget.visitDate && navTarget.visitDate !== date) { setDate(navTarget.visitDate); return }
      onTargetConsumed?.()
      return
    }
    if (!navTarget || (!navTarget.visitId && !navTarget.visitDate)) return
    if (vista !== 'dia') { setVista('dia'); return }
    if (navTarget.visitDate && navTarget.visitDate !== date) { setDate(navTarget.visitDate); return }
    if (!navTarget.visitId) { onTargetConsumed?.(); return }
    if (day.loading) return
    const target = (day.data ?? []).find((r) => r.id === navTarget.visitId)
    if (target) moveOpenVisit(target)
    onTargetConsumed?.()
  }, [navTarget, vista, date, day.loading, day.data, onTargetConsumed])

  /* ── Qué se está viendo ──
     `todas`: lo que trajo la base para la vista (el día, o la grilla de la semana/mes).
     `base`: lo del PERÍODO con la búsqueda aplicada — sobre esto cuentan el panel y los contadores.
     `filtradas`: `base` con los filtros. En la grilla se dibujan además los días vecinos del mes
     (atenuados), así que ésa usa `todas` con búsqueda y filtros, sin recortar al período. */
  const todas: DayVisitRow[] = vista === 'dia' ? rows : rangoListo ? rangoQ.data!.filas : []
  const periodo = periodoDe(vista, date)
  const conBusqueda = (v: DayVisitRow) => coincideBusqueda(v, visitCode(v), q)
  const base = (vista === 'dia' ? todas : visitasDelPeriodo(todas, periodo.desde, periodo.hasta)).filter(conBusqueda)
  const filtered = base.filter((v) => pasaFiltros(v, filtros))
  const conteo = contarPorGrupo(filtered)
  /* Sábado y domingo se dibujan sólo si el rango tiene visitas esos días. Se mira TODO lo que trajo la
     base y no lo filtrado: si dependiera del filtro, las columnas cambiarían de ancho al tildar algo. */
  const porDiaTodas = useMemo(
    () => (rango ? visitasPorDia(todas, rango.desde, rango.hasta) : new Map<string, DayVisitRow[]>()),
    [todas, rango?.desde, rango?.hasta], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const finde = conFinDeSemana(porDiaTodas.keys())
  const porDiaFiltradas = rango
    ? visitasPorDia(todas.filter((v) => conBusqueda(v) && pasaFiltros(v, filtros)), rango.desde, rango.hasta)
    : new Map<string, DayVisitRow[]>()

  /* Rótulos legibles de las opciones de filtro. Se ACUMULAN de todo lo que se cargó en la sesión: un
     filtro elegido puede no tener visitas en el período que se está mirando (la opción sigue en el
     panel, marcada con 0), y para entonces su protocolo o su coordinador ya no está en las filas. */
  const rotulos = useRef(new Map<string, string>())
  for (const p of protocolsQ.data ?? []) rotulos.current.set(`protocolo:${p.id}`, p.code)
  for (const v of todas) {
    rotulos.current.set(`protocolo:${v.protocol_id}`, v.protocol_code)
    if (v.coordinator_id && v.coordinator_name) rotulos.current.set(`coordinador:${v.coordinator_id}`, v.coordinator_name)
  }
  const rotulo = (cat: CategoriaFiltro, valor: string): string => {
    if (cat === 'estado') return rotuloEstado(valor)
    if (valor === NONE) return cat === 'medico' ? 'Sin médico' : 'Sin asignar'
    if (cat === 'medico') return valor
    return rotulos.current.get(`${cat}:${valor}`) ?? (cat === 'protocolo' ? 'Protocolo' : 'Coordinador')
  }

  const clearAll = () => { setFiltros(SIN_FILTROS); setQ('') }

  /* El rótulo del control dice "Ordenar por" (pedido del Director, 2026-08-20): con el valor solo
     —"En el centro"— parecía un filtro más de la fila. La etiqueta de la primera opción queda CORTA a
     propósito: con el prefijo delante, "En el centro" ya se entiende. */
  const groupOptions: FilterOption[] = [
    { value: 'operativo', label: 'En el centro', count: null },
    { value: 'estado', label: 'Estado', count: null },
    { value: 'protocolo', label: 'Protocolo', count: null },
    { value: 'medico', label: 'Médico', count: null },
    { value: 'coordinador', label: 'Coordinador', count: null },
    /* Bajo "Ordenar por", lo que hace esta opción es no separar la lista en bloques: una sola tira,
       en el orden base (estado, y a igual estado por hora de llegada). */
    { value: 'ninguno', label: 'Sin separar', count: null },
  ]

  /* El título lo dibuja el shell; a su derecha va sólo «Agregar visita» (v0145) —la fecha, que vivía
     acá, pasó a la barra de período—. Antes del early-return: los hooks no se condicionan. */
  useEffect(() => {
    setHeader?.({
      /* Sólo en el Día: el alta va con la fecha FIJA del día que se mira (`modo='dia'`), y en la
         Semana o el Mes esa fecha es un día que no está marcado en ningún lado — en el Mes, después de
         un ›, puede ser hasta un sábado. Se agenda yendo al día. */
      content: vista === 'dia' && protocolosParaAgregar.length > 0 ? (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          style={{ ...btnPrimary(accentSolid), height: 40, padding: '0 18px', fontSize: 14.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Icon name="plus" size={17} color="var(--spira-white)" />
          Agregar visita
        </button>
      ) : null,
    })
    return () => setHeader?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeader, protocolosParaAgregar.length, vista])

  /* Atajos (handoff, «Interactions»): ← → período · T/H hoy · M S D vista. Las reglas de cuándo NO
     disparan —escribiendo, con modificadores, con un modal o popover abierto— viven en
     `atajoDeTecla`, con test. El listener se rearma en cada render a propósito: lee `vista` y `date`
     frescos sin un ref, y montarlo es barato. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      /* El target puede no ser un elemento (un evento despachado sobre `document`): sin `closest` ni
         `tagName`, se lo trata como «nada enfocado». */
      const t = e.target instanceof HTMLElement ? e.target : null
      /* Un campo de texto, y también un control que ya usa esas teclas: las flechas en el selector de
         vista (`tablist`) o en un menú son de ESE control (patrón ARIA), no del período. */
      const editable = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest('[role="tablist"], [role="menu"], [role="listbox"]') !== null)
      const bloqueado = hayPopoverAbierto() || document.querySelector('[aria-modal="true"]') !== null
      const atajo = atajoDeTecla({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, editable, bloqueado })
      if (!atajo) return
      e.preventDefault()
      if (atajo === 'anterior') paso(-1)
      else if (atajo === 'siguiente') paso(1)
      else if (atajo === 'hoy') setDate(todayISO())
      else setVista(atajo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* Orden base de la lista del día: lo que está pasando arriba, las cerradas abajo; a igual estado,
     por llegada (`compararVisitas`, con test). Los grupos parten esta lista. */
  const ordered = [...filtered].sort(compararVisitas)
  const groups = buildGroups(group, ordered, rotulo)
  const showHeaders = group !== 'operativo' ? groups.length > 0 : groups.length > 1

  /* Navegación ↑↓ del modal: recorre la lista VISIBLE tal como se ve (en orden de los grupos), con
     wrap circular. Va con `moveOpenVisit` (replace): recorrer visitas no es "entrar" de nuevo al
     cajón en cada paso. */
  const orderedVisible = groups.flatMap((g) => g.items)
  const openIdx = openVisit ? orderedVisible.findIndex((v) => v.id === openVisit.id) : -1
  const stepOpen = (d: number) => {
    if (orderedVisible.length === 0 || openIdx < 0) return
    moveOpenVisit(orderedVisible[(openIdx + d + orderedVisible.length) % orderedVisible.length])
  }

  /* Despacha la mutación de la etapa SIGUIENTE. 'inicio_atencion' va por `startVisitAttention` con
     `date` (el día que se está mirando, no necesariamente hoy): desde la 0102 esa marca sella
     además la HORA del click y el coordinador que la apretó, así que tiene que ser la MISMA
     llamada que hace el modal. El resto son eventos en vivo (now() server-side). "Fin de atención"
     de una visita de screening/randomización NO marca directo: abre el cierre clínico. */
  const avanzar = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next === 'fin_atencion' && (visit.role === 'screening' || visit.role === 'randomizacion')) {
      setActionError(null)
      setFeedback(null)
      setReadyOutcome(visit)
      return
    }
    setBusyId(visit.id)
    setActionError(null)
    const res =
      next === 'concurrio_al_centro' ? await markArrived(visit.id)
      : next === 'inicio_atencion' ? await startVisitAttention(visit.id, date)
      : next === 'fin_atencion' ? await markReady(visit.id)
      : { error: 'Etapa desconocida.' }
    setBusyId(null)
    if (res.error) { setActionError(res.error); return }
    day.refetch()
  }

  /* Finalizar pasa antes por el aviso de pendientes (v0145): si la visita tiene procedimientos con
     reporte sin tildar, se pregunta si quedan para otro día. El resto de las etapas, derecho. */
  const advance = async (visit: DayVisitRow, next: OperationalStage) => {
    if (next !== 'fin_atencion') { await avanzar(visit, next); return }
    setBusyId(visit.id)
    await aviso.pedir(visit, () => { setBusyId(null); return avanzar(visit, next) })
    setBusyId(null)
    // Lo que el aviso tildó o marcó cambia la tira de indicadores de la fila, que sale de `dayProcs`.
    dayProcs.refetch()
  }

  /* El menú del botón de etapa de cada fila: volver, «no vino», reprogramar, vino otro día, copiar,
     eliminar, retest y la llegada fuera de fecha. Lo ejecuta el mismo hook que usa el modal de la visita;
     el aviso sale al pie (el chip que cambia de color en una fila que no se reordena no alcanza como
     confirmación) y el error, al banner de esta vista. Lo que cambia puede tocar la tira de indicadores
     (`dayProcs`). Una visita cargada en otra fecha pasa a ser de ESE día: la lista va ahí, donde está la
     visita para finalizarla (0158). */
  const acciones = useAccionesDeVisita({
    acento: accentSolid,
    onCambio: () => { refrescar(); dayProcs.refetch() },
    onError: (msg) => { setActionError(msg); setFeedback(null) },
    onCargadaEn: setDate,
  })

  const cargando = permisosCargando || (vista === 'dia' ? day.loading : !rangoQ.error && !rangoListo)
  const error = vista === 'dia' ? day.error : rangoQ.error
  const refetchVista = () => (vista === 'dia' ? day.refetch() : rangoQ.refetch())

  const renderRow = (v: DayVisitRow) => (
    <DayVisitRowItem
      key={v.id}
      visit={v}
      canReception={canReception}
      canClinical={canClinical(v)}
      coordina={coordina(v)}
      busyId={busyId === v.id || acciones.ocupado === v.id ? v.id : null}
      resumen={resumenes[v.id] ?? null}
      onAdvance={advance}
      onOpenDoctor={(vv) => setDoctorFor(vv)}
      onAccion={(vv, clave) => void acciones.ejecutar(vv, clave)}
      onLlegar={(vv, mueveFecha) => void acciones.llegar(vv, mueveFecha)}
      acento={accentSolid}
      onOpen={(vv) => setOpenVisit(vv)}
      onOpenPatient={abrirFicha && (() => abrirFicha(v.patient_id, v.protocol_id))}
    />
  )

  const cuerpo = () => {
    if (cargando) {
      return <EmptyState accent={accent} icon={submodule.icon} title="Cargando visitas…" description="Un momento." />
    }
    if (error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
            <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
            No pudimos cargar las visitas. Probá de nuevo.
          </div>
          <button onClick={refetchVista} style={{ ...btnOutline, alignSelf: 'flex-start', height: 38, fontSize: 13.5 }}>
            Reintentar
          </button>
        </div>
      )
    }
    if (vista === 'semana') return <VistaSemana fecha={date} hoy={hoy} porDia={porDiaFiltradas} conFinDeSemana={finde} onElegirDia={elegirDia} />
    if (vista === 'mes') return <VistaMes fecha={date} hoy={hoy} porDia={porDiaFiltradas} conFinDeSemana={finde} onElegirDia={elegirDia} />
    if (filtered.length === 0) {
      return rows.length === 0 ? (
        <EmptyState
          accent={accent}
          icon={submodule.icon}
          title={`No hay visitas ${isToday ? 'hoy' : 'este día'}`}
          description={`Cuando haya visitas programadas o registradas ${isToday ? 'hoy' : 'ese día'} van a aparecer acá.`}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink-soft)' }}>
            Ninguna visita coincide con los filtros
          </div>
          <button onClick={clearAll} style={{ ...btnOutline, marginTop: 12, height: 36, fontSize: 13, color: accent }}>
            Limpiar filtros
          </button>
        </div>
      )
    }
    return (
      <div className="vcal-lista">
        {groups.map((g) => (
          <div key={g.key}>
            {showHeaders && g.label && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 9px' }}>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)', whiteSpace: 'nowrap' }}>{g.label}</span>
                <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>{g.items.length}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
              </div>
            )}
            {g.items.map(renderRow)}
          </div>
        ))}
      </div>
    )
  }

  // Sin tope de ancho, como el resto de las vistas. El handoff traía `max-width: 1240px`, pero en su
  // prototipo el encabezado («Agregar visita») vivía adentro de esa columna; en la app lo pone el shell
  // a todo el ancho. Con la ventana ancha (o alejando el zoom) el botón se iba a la otra punta y la
  // vista quedaba recostada a la izquierda con un hueco a la derecha (Director, 2026-10-13). Lo que se
  // reacomoda con el ancho ya lo resuelven las container queries de `visitas.css`.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, '--vcal-acc': accentSolid } as CSSProperties}>
      <BarraPeriodo
        vista={vista}
        fecha={date}
        conFinDeSemana={finde}
        conteo={conteo}
        onVista={setVista}
        onFecha={setDate}
        onPaso={paso}
      />

      {/* fila de filtros: no envuelve nunca (handoff §2). El buscador es el ítem elástico y el que se
          pega a la derecha; el prefijo y después el valor de «Ordenar por» se esconden por container
          query cuando la fila se angosta. */}
      <div className="vcal-frow-wrap">
        <div className="vcal-frow">
          <PanelFiltros base={base} filtros={filtros} onChange={setFiltros} rotulo={rotulo} acento={accentSolid} />
          {vista === 'dia' && (
            <>
              <span aria-hidden="true" style={{ width: 1, height: 22, background: 'var(--spira-line)', margin: '0 2px', flexShrink: 0 }} />
              <FilterDropdown
                accent={accent}
                value={group}
                onChange={(v) => setGroup(v as GroupBy)}
                options={groupOptions}
                menuLabel="Ordenar por"
                prefix="Ordenar por"
                prefixClassName="vcal-orden-prefijo"
                valueClassName="vcal-orden-valor"
                icon="sliders"
                deselectable
              />
            </>
          )}
          {/* El buscador es el de `components/FilterBar`, compartido con Pendientes ("que se vean
              iguales y que interactúen igual"). Busca por nombre, N° (IVRS), protocolo y código. */}
          <FilterSearch value={q} onChange={setQ} placeholder="Paciente o protocolo…" maxWidth={340} />
        </div>
      </div>

      <FichasFiltros filtros={filtros} onChange={setFiltros} rotulo={rotulo} />

      {actionError && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
          {actionError}
        </div>
      )}

      {feedback && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-ink)', background: 'rgba(15, 95, 87, 0.08)', borderRadius: 8, padding: '8px 12px' }}>
          <Icon name="check" size={16} color="var(--spira-good)" />
          {feedback}
        </div>
      )}

      {/* Salvaguarda: randomizaciones atendidas que nunca se confirmaron (sin fecha → sin tratamiento).
          No depende del período: se ve en las tres vistas hasta que se resuelva. */}
      {(randoPending.data?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 11, border: '1px solid var(--spira-warn)', background: 'var(--spira-surface)', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
            <Icon name="alertCircle" size={17} color="var(--spira-warn)" />
            Randomización atendida sin confirmar
          </div>
          {(randoPending.data ?? []).map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="spira-mono">{v.patient_code ?? 'Sin IVRS'}</span>
                <span style={{ color: 'var(--spira-muted)' }}> · <span className="spira-mono">{v.protocol_code}</span></span>
                <span style={{ color: 'var(--spira-muted)' }}> — generá el tratamiento o marcá el resultado</span>
              </span>
              {canClinical(v) && (
                <button
                  onClick={() => { setActionError(null); setFeedback(null); setReadyOutcome(v) }}
                  style={{ ...btnOutline, height: 30, fontSize: 12.5, padding: '0 12px' }}
                >
                  Resolver
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {cuerpo()}

      {/* «Reprogramar» y «Pedir retest» del menú de las filas. */}
      {acciones.capas}
      {readyOutcome && (readyOutcome.role === 'screening' || readyOutcome.role === 'randomizacion') && (
        <ReadyOutcomeModal
          role={readyOutcome.role}
          accentSolid={accentSolid}
          onClose={() => setReadyOutcome(null)}
          onConfirm={async (opts) => {
            const res = await markReadyWithOutcome(readyOutcome.id, opts)
            if (!res.error) {
              setFeedback(
                readyOutcome.role === 'screening'
                  ? (opts.ivrs ? 'Listo. Código de paciente asignado.' : 'Listo.')
                  : opts.randomized ? 'Listo. Randomización confirmada — se generó el tratamiento.' : 'Listo.',
              )
              refrescar()
              randoPending.refetch()
            }
            return res
          }}
          onReschedule={() => setRecitar(readyOutcome)}
          onDiscontinue={async () => {
            const res = await discontinueEnrollment(readyOutcome.enrollment_id)
            if (!res.error) {
              setFeedback('Paciente inactivado (fallo de screening).')
              refrescar()
              randoPending.refetch()
            }
            return res
          }}
        />
      )}
      {recitar && (
        /* «Recitar» desde el cierre de screening/randomización: el mismo «Agendar visita» de la ficha
           (v0145), con esa definición del cuadro ya elegida. */
        <AgendarVisitaModal
          modo="paciente"
          paciente={pacienteDeVisita(recitar)}
          preseleccion={{ tipo: 'def', defId: recitar.visit_def_id }}
          accent={accentSolid}
          onClose={() => setRecitar(null)}
          onDone={(mensaje) => { setRecitar(null); setActionError(null); setFeedback(mensaje); refrescar(); randoPending.refetch() }}
        />
      )}
      {agregando && (
        <AgendarVisitaModal
          modo="dia"
          dia={date}
          protocolos={protocolosParaAgregar}
          accent={accentSolid}
          onClose={() => setAgregando(false)}
          onDone={(mensaje) => {
            setAgregando(false)
            setActionError(null)
            setFeedback(mensaje)
            refrescar()
            dayProcs.refetch()
          }}
        />
      )}
      {openVisit && (
        <VisitDetail
          visitId={openVisit.id}
          seed={openVisit}
          accent={accent}
          canReception={canReception}
          canClinical={canClinical(openVisit)}
          coordina={coordina(openVisit)}
          onAdvance={advance}
          // Los procedimientos también: desde la visita cambia su lista EFECTIVA («Pasar pendientes»,
          // «Editar», «Deshacer») sin que cambien las visitas del día, así que sin este refetch la fila
          // seguía mostrando lo que ya pasó a otra visita —y su gota de sangre— hasta recargar.
          onChanged={() => { day.refetch(); dayProcs.refetch() }}
          onClose={() => setOpenVisit(null)}
          pos={openIdx >= 0 ? `${openIdx + 1} / ${orderedVisible.length}` : undefined}
          onPrev={() => stepOpen(-1)}
          onNext={() => stepOpen(1)}
          // El nombre y el Nº de sujeto llevan a la ficha del paciente (viven dentro de Protocolos,
          // que abre la ficha directo con un `patientId` como objetivo). Se deja el pasaje de VUELTA
          // con la visita y su día: volver te devuelve la misma visita abierta el día que mirabas.
          onOpenPatient={(patientId, protocolId) => onNavigate?.(
            module.key, 'protocolos', { patientId, protocolId },
            {
              moduleKey: module.key,
              subKey: submodule.key,
              target: { visitId: openVisit.id, visitDate: date },
              label: 'Volver a la visita',
              hint: `Volver a la visita de ${openVisit.patient_name}`,
            },
          )}
        />
      )}
      {doctorFor && (
        <DoctorRequestModal
          visitId={doctorFor.id}
          accent={accent}
          canClinical={canClinical(doctorFor)}
          onClose={() => setDoctorFor(null)}
          onChanged={() => day.refetch()}
        />
      )}
      {aviso.modal}
    </div>
  )
}

/** Un grupo de la lista: etiqueta (null = sin encabezado) + sus filas en orden. */
interface VisitGroup { key: string; label: string | null; items: DayVisitRow[] }

const GRUPOS_OPERATIVOS: { key: 'centro' | 'llegar' | 'fin'; label: string }[] = [
  { key: 'centro', label: 'En el centro' },
  { key: 'llegar', label: 'Por llegar' },
  { key: 'fin', label: 'Finalizadas' },
]

/**
 * Parte la lista YA ordenada en grupos según la dimensión elegida. Grupos vacíos no se dibujan.
 * 'operativo' son los tres del handoff (En el centro · Por llegar · Finalizadas, con «No vino» en el
 * último: `grupoDeVisita`); 'estado' usa la misma clave que el filtro (`estadoDeFila`), así «No vino»
 * tiene su bloque y no se mezcla con las que se esperan.
 */
function buildGroups(group: GroupBy, ordered: DayVisitRow[], rotulo: (cat: CategoriaFiltro, valor: string) => string): VisitGroup[] {
  if (group === 'ninguno') return [{ key: 'all', label: null, items: ordered }]
  if (group === 'operativo') {
    return GRUPOS_OPERATIVOS
      .map((g) => ({ key: g.key, label: g.label, items: ordered.filter((v) => grupoDeVisita(v) === g.key) }))
      .filter((g) => g.items.length > 0)
  }
  const porClave = (cat: CategoriaFiltro, clave: (v: DayVisitRow) => string, orden?: string[]) => {
    const claves = [...new Set(ordered.map(clave))]
    const sorted = orden
      ? claves.sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
      : claves.sort((a, b) => rotulo(cat, a).localeCompare(rotulo(cat, b), 'es'))
    return sorted.map((k) => ({ key: k, label: rotulo(cat, k), items: ordered.filter((v) => clave(v) === k) }))
  }
  if (group === 'estado') return porClave('estado', estadoDeFila, ORDEN_ESTADOS)
  if (group === 'protocolo') return porClave('protocolo', (v) => v.protocol_id)
  if (group === 'medico') return porClave('medico', (v) => v.treating_physician ?? NONE)
  return porClave('coordinador', (v) => v.coordinator_id ?? NONE)
}
