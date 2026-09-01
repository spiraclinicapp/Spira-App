import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { AlertCardHeader } from './AlertCardHeader'
import { severidadMaxima } from './alertSeverity'
import { KPI_DESTINOS, nombreDeDestino } from './resumen/destinos'
import type { KpiKey } from './resumen/destinos'
import { useProtocols } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useUpcomingVisits } from '../data/visits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useSolicitudesPendientes, ESTADO_SOLICITUD } from '../data/pharma'
import type { SolicitudPendienteRow } from '../data/pharma'
import { useReportesPendientes } from '../data/reportStatus'
import type { ReportStatusRow } from '../data/reportStatus'
import { dueLabel, esTarjeta } from './track/reportes/estados'
import type { TrackVisitRow } from '../data/visits'
import { visitTitle } from '../lib/visits'
import { dayLabel, formatAR, fromNow } from '../lib/dates'
import { VISIT_STATES, VisitChip } from './visitStates'
import { VisitSummaryRow } from './VisitSummaryRow'
import { ErrorBloque, FilasFantasma } from './resumenEstados'
import { useAbrirFicha } from './useAbrirFicha'
import type { ViewProps } from './types'

const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const cardTitle: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 16 }

/* Fila a ancho completo de la tarjeta: los márgenes negativos cancelan el padding horizontal
   (20px) para que el resaltado del hover llegue a los bordes en vez de flotar adentro con una
   franja de aire a los costados. Es el patrón del handoff y el mismo que ya usan otras listas.
   El separador de arriba es de la fila, así que la fila NO se levanta (`.spira-no-press`):
   moverla partiría esa línea de 1px. Sin radio por lo mismo. */
const filaAncha: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%',
  margin: '0 -20px', padding: '11px 20px',
  borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  textAlign: 'left', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', color: 'var(--spira-ink)',
}

/** El punto de color de una fila plana: sustituye a la superficie teñida como marca de severidad. */
function Punto({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: '0 0 auto', marginTop: 6 }} />
}

/**
 * El rótulo del destino que aparece al apuntar (o al enfocar con Tab) una tarjeta o el pie
 * "Ver todo": el nombre real del submódulo + flecha, deslizando 4px desde la izquierda.
 *
 * El movimiento y el disparo viven en CSS (`.spira-dest` / `.spira-dest-group`), NO en
 * `onMouseEnter` como el mock del handoff: escribir el realce desde un handler es el gotcha de la
 * casa, y además un handler no tiene `:focus-visible`, así que con teclado no se vería nunca.
 *
 * `aria-hidden` porque es decoración: a dónde lleva ya lo dice el `aria-label` del contenedor, que
 * es lo que anuncia el lector de pantalla. Duplicarlo lo haría leer el destino dos veces.
 */
function ChipDestino({ nombre }: { nombre: string }) {
  return (
    <span
      className="spira-dest"
      aria-hidden="true"
      style={{ fontSize: 12, fontWeight: 700, color: 'var(--spira-acc-deep-track)' }}
    >
      {nombre}
      <Icon name="arrowRight" size={12} stroke={2.4} />
    </span>
  )
}

/**
 * Tarjeta de cifra del Resumen. Desde el rediseño (handoff `design_handoff_resumen_tareas_enfoque`)
 * LLEVA A SU PANTALLA: al apuntarla se eleva y revela, a la derecha del rótulo, el nombre del
 * submódulo al que va.
 *
 * ES UN `role="button"` CON TECLADO COMPLETO y no un `<div onClick>`: mudar un gesto a un div deja
 * el destino sin camino de teclado y eso no se ve mirando la pantalla. La guarda
 * `e.target !== e.currentTarget` es la de siempre — acá no hay hijos focusables, pero la fila de al
 * lado sí los tiene y el criterio se mantiene parejo.
 *
 * `cargando` muestra un guión en vez del número: la tarjeta ocupa su lugar desde el primer render y
 * no salta cuando llega el dato. Mostrar 0 mientras carga sería mentir con un número.
 */
function KpiCard({ label, value, sub, dot, cargando, kpi, onNavigate }: {
  label: string
  value: number
  sub: string
  dot: string
  cargando?: boolean
  kpi: KpiKey
  onNavigate?: ViewProps['onNavigate']
}) {
  const destino = KPI_DESTINOS[kpi]
  const nombre = nombreDeDestino(destino)
  /* Sin `onNavigate` o sin nombre de destino, la tarjeta queda INERTE: sin gesto, sin foco y sin
     chip. Es el mismo criterio que `PatientLink` sin `onOpen` — un botón que no hace nada es peor
     que no tener botón, y un chip que nombre un lugar inexistente es peor todavía. */
  const navega = onNavigate && nombre !== null
  const ir = () => { if (navega) onNavigate(destino.moduleKey, destino.subKey) }

  return (
    <div
      style={card}
      className={navega ? 'spira-card-link spira-dest-group' : undefined}
      role={navega ? 'button' : undefined}
      tabIndex={navega ? 0 : undefined}
      onClick={navega ? ir : undefined}
      onKeyDown={navega ? (e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir() }
      } : undefined}
      aria-label={navega ? `${label}: ${cargando ? 'cargando' : value}. Ir a ${nombre}` : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--spira-muted)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {navega && <ChipDestino nombre={nombre} />}
      </div>
      <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 38, letterSpacing: '-0.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {cargando ? <span style={{ color: 'var(--spira-muted)' }}>—</span> : value}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

/**
 * El pie "Ver todo" de una tarjeta: a la izquierda el texto fijo, a la derecha el nombre del
 * submódulo revelado al apuntarlo.
 *
 * VA EN UN `<button>` A ANCHO COMPLETO, y ahí se separa del mock a propósito. En el handoff el
 * listener de hover vive en un `<span>` que **no tiene ningún `onClick`**: es un pie que parece un
 * link y no navega, y eso en esta app no se dibuja. Al hacerlo botón, el blanco de clic es toda la
 * fila (mejor, no peor) y el revelado dispara también con `:focus-visible`.
 *
 * `.spira-no-press` porque hereda la micro-interacción global y se levantaría 1px: acá el realce es
 * el revelado del rótulo, no un salto. Mismo criterio que `PatientLink`.
 *
 * SÓLO LO LLEVA ALERTAS (decisión D11). Ni la tarjeta de visitas ni la de dispensaciones: el
 * submódulo Visitas muestra EL DÍA y no los próximos siete, así que un "Ver todo" ahí prometería
 * una lista que esa pantalla no da; y las dispensaciones no tienen submódulo alcanzable para quien
 * coordina —su destino por fila ya es la visita—. El pie aparece donde hay una lista completa a la
 * que ir, no como adorno de cierre de tarjeta.
 */
function VerTodo({ nombre, onClick }: { nombre: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="spira-row-link spira-no-press spira-dest-group"
      onClick={onClick}
      aria-label={`Ver todo en ${nombre}`}
      /* SIN `background` inline: `.spira-row-link` ya declara el transparente de reposo, y un
         inline le ganaría por especificidad al `:hover` de la clase — el pie revelaría el rótulo
         pero no se resaltaría, que es medio gesto. Es el mismo gotcha que documenta
         `VisitSummaryRow`, y acá se cazó midiendo el fondo computado, no leyendo el código.

         EL COLOR ES `--spira-acc-deep-track` Y NO `--spira-primary`, aunque el handoff diga
         `S.primary`: el primario está FIJO en los dos temas (#0F5F57), así que en oscuro este texto
         daba 2,14:1 sobre la tarjeta — ilegible, y medido, no supuesto. Los `--spira-acc-deep-*`
         son los únicos que se aclaran en oscuro (#9DE6D6 acá). */
      style={{
        ...filaAncha,
        alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto',
        fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
      }}
    >
      Ver todo
      <ChipDestino nombre={nombre} />
    </button>
  )
}

/** Cabecera de tarjeta con ícono, título y un dato al margen. */
function CardHeader({ icon, color, titulo, extra }: {
  icon: 'box' | 'clipboardCheck'; color: string; titulo: string; extra?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={18} color={color} stroke={2} />
      <span style={{ ...cardTitle, flex: 1, minWidth: 0 }}>{titulo}</span>
      {extra}
    </div>
  )
}

/**
 * Tarjeta "Reportes pendientes": los reportes de TODOS los protocolos que la persona coordina,
 * los que vencen primero arriba.
 *
 * TRES COSAS DEL MOCK NO SE PORTAN, y conviene saber por qué:
 *
 * · **El casillero de tildar.** El mock abre cada renglón con un checkbox. Acá mover un reporte de
 *   etapa pasa por la RPC `set_report_stage`, que verifica permiso y sella autor — no es algo que
 *   se haga de pasada desde un resumen. Un casillero que no tilda es un botón que finge acción.
 * · **Los textos de ejemplo.** "Firmar 4 visitas de EFC18419", "Reprogramar 2 visitas fuera de
 *   ventana": eso no son reportes, son tareas. El renglón real dice qué reporte, de qué paciente y
 *   para cuándo, que es lo que la vista sabe.
 * · **El pie "Ver todo"** (decisión D14): el tablero de reportes vive adentro del detalle de cada
 *   protocolo y Coordinación no tiene un submódulo "Reportes" al que mandar. Antes que prometer un
 *   destino que no existe, la tarjeta no lo lleva — y por eso tampoco recorta la lista: si mostrara
 *   sólo los primeros, los demás no quedarían en ningún lado.
 *
 * La barra de progreso son los EVOLUCIONADOS sobre el total, que es el único par de números que
 * significa algo acá: cuántos de los reportes en juego ya están cerrados.
 */
function ReportesCard({ rows, loading, error, onReintentar, onOpenVisit, onOpenPatient }: {
  rows: ReportStatusRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
}) {
  /* `esTarjeta` = el procedimiento está marcado realizado. Antes de eso el plazo no arrancó y el
     reporte no es todavía nada que gestionar (misma regla que el tablero, ya testeada). */
  const tarjetas = rows.filter(esTarjeta)
  const resueltos = tarjetas.filter((r) => r.stage === 'evolucionado').length
  const pendientes = tarjetas.filter((r) => r.stage !== 'evolucionado')
  const pct = tarjetas.length === 0 ? 0 : Math.round((resueltos / tarjetas.length) * 100)

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ ...cardTitle, flex: 1, minWidth: 0 }}>Reportes pendientes</span>
        {tarjetas.length > 0 && (
          <>
            <span
              style={{ width: 100, height: 6, borderRadius: 'var(--spira-radius-pill)', background: 'var(--spira-line)', overflow: 'hidden', flex: '0 0 auto' }}
              role="img"
              aria-label={`${resueltos} de ${tarjetas.length} reportes cerrados`}
            >
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--spira-acc-deep-track)' }} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }} aria-hidden="true">
              {resueltos} de {tarjetas.length}
            </span>
          </>
        )}
      </div>
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="los reportes pendientes" onReintentar={onReintentar} />
      ) : pendientes.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
          {tarjetas.length === 0 ? 'Sin reportes en juego.' : 'Todos los reportes están cerrados.'}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {pendientes.map((r, i) => {
            const plazo = dueLabel(r)
            const abrir = onOpenVisit ? () => onOpenVisit(r.visit_id) : undefined
            const visita = r.visit_code ?? r.visit_name ?? '—'
            return (
              <div
                key={`${r.visit_id}:${r.report_definition_id}`}
                role={abrir ? 'button' : undefined}
                tabIndex={abrir ? 0 : undefined}
                className={abrir ? 'spira-row-link spira-no-press' : undefined}
                onClick={abrir}
                onKeyDown={abrir ? (e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() }
                } : undefined}
                aria-label={abrir ? `Abrir la visita de ${r.patient_name} — ${r.report_name}, ${plazo.texto}` : undefined}
                style={{ ...filaAncha, alignItems: 'center', ...(i === 0 ? { borderTopWidth: 0 } : null), ...(abrir ? null : { cursor: 'default' }) }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.report_name}</span>
                    <span style={{ color: 'var(--spira-muted)', fontWeight: 400, flex: '0 0 auto' }}>·</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <PatientLink onOpen={onOpenPatient && (() => onOpenPatient(r.patient_id, r.protocol_id))} label={`Abrir la ficha de ${r.patient_name}`}>
                        {r.patient_name}
                      </PatientLink>
                    </span>
                    {onOpenPatient && <PatientLinkArrow />}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: 'var(--spira-muted)' }}>
                      {visita} · <span className="spira-mono">{r.protocol_code}</span>
                    </span>
                    <span style={{ color: 'var(--spira-faint)' }}> · </span>
                    {/* El color lo decide `dueLabel`, que ya sabe si venció: así es imposible pintar
                        de rojo un texto que dice "Vence en 3 días". */}
                    <span style={{ color: plazo.overdue ? 'var(--spira-acc-deep-danger)' : 'var(--spira-muted)', fontWeight: 700 }}>
                      {plazo.texto}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Fila de una solicitud de dispensación abierta.
 *
 * El ESTADO va integrado en la línea secundaria, separado por punto medio, sin caja propia — el
 * pill sólido con fondo teñido se descartó en el handoff, y con razón: el patrón
 * `color: tono / background: tono+alpha` viene fallando contraste en esta app. Acá el tono es texto
 * sobre la superficie de la tarjeta, que es un fondo conocido y medible.
 *
 * LLEVA A LA VISITA, no a Farmacia › Dispensaciones (decisión D5). La RLS sólo te muestra esta
 * solicitud si coordinás su visita, así que ese destino está garantizado por construcción; mandar
 * a Farmacia le habría dejado la fila muerta —`navigate` descartado en silencio por `isAllowed`— a
 * toda coordinadora sin ese módulo. Sin `visit_id` la fila va inerte, sin gesto ni foco.
 */
function SolicitudRow({ s, primera, onOpenVisit, onOpenPatient }: {
  s: SolicitudPendienteRow
  primera: boolean
  onOpenVisit?: (visitId: string) => void
  onOpenPatient?: () => void
}) {
  const estado = ESTADO_SOLICITUD[s.status]
  const paciente = s.enrollment?.patient ?? null
  /* Los nombres de la medicación, sin repetir: un pedido de tres cajas del mismo remedio son tres
     ítems y una sola cosa que decir. Sin ítems legibles —la RLS de `dispensation_request_items`
     puede filtrarlos por su cuenta— se dice "medicación", que es cierto, en vez de dejar el
     renglón sin titular. */
  const medicamentos = [...new Set(s.items.map((i) => i.medication?.name).filter(Boolean))] as string[]
  const titulo = medicamentos.length > 0 ? medicamentos.join(' · ') : 'Medicación'
  const abrir = s.visit_id && onOpenVisit ? () => onOpenVisit(s.visit_id as string) : undefined

  return (
    <div
      role={abrir ? 'button' : undefined}
      tabIndex={abrir ? 0 : undefined}
      className={abrir ? 'spira-row-link spira-no-press' : undefined}
      onClick={abrir}
      onKeyDown={abrir ? (e) => {
        // Sin esta guarda, Enter sobre el nombre del paciente abre la ficha Y la visita.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() }
      } : undefined}
      aria-label={abrir ? `Abrir la visita de ${paciente?.full_name ?? 'el paciente'} — ${titulo}, ${estado.label}` : undefined}
      style={{
        ...filaAncha, alignItems: 'center',
        ...(primera ? { borderTopWidth: 0 } : null),
        ...(abrir ? null : { cursor: 'default' }),
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{titulo}</span>
          <span style={{ color: 'var(--spira-muted)', fontWeight: 400, flex: '0 0 auto' }}>·</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${paciente?.full_name ?? ''}`}>
              {paciente?.full_name ?? '—'}
            </PatientLink>
          </span>
          {onOpenPatient && paciente && <PatientLinkArrow />}
        </div>
        <div style={{ fontSize: 12, marginTop: 2 }}>
          <span style={{ color: 'var(--spira-muted)' }}>solicitada {fromNow(s.created_at)}</span>
          <span style={{ color: 'var(--spira-faint)' }}> · </span>
          <span style={{ color: estado.tono, fontWeight: 700 }}>{estado.label}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Resumen del módulo Track: KPIs + próximas visitas (7 días) + alertas + dispensaciones pedidas.
 *
 * Rediseñado el 2026-09-01 desde `docs/design_handoff_resumen_tareas_enfoque/`. Lo que cambió y por
 * qué está en `docs/plan-resumen-coordinacion-enfoque.md` (decisiones D1 a D12); lo que NO se portó
 * del handoff está igual de documentado ahí, y vale la pena saberlo antes de "completarlo": las
 * tarjetas de Tareas personales, Reportes pendientes y Pacientes piden datos que la base no tiene.
 *
 * Cada fila lleva a SU ítem: una visita próxima abre su detalle en Visitas del día (saltando a su
 * fecha), una alerta lleva a Alertas —que abre ahí el modal— y una dispensación abre la visita de
 * la que salió. Las alertas son las VIGENTES —`useActiveAlerts` deja afuera las descartadas
 * (0070)—: si acá se listaran todas, esta pantalla contradiría a la campana y a las otras dos que
 * muestran alertas.
 *
 * Sin gate global: cada bloque falla y carga por su cuenta. Un error en la consulta de pacientes
 * solía borrar las alertas de ventana vencida, que es información clínica — media pantalla es
 * muchísimo mejor que una vacía. Ver la tabla de estados del plan.
 */
export function TrackResumenView({ module, submodule, onNavigate }: ViewProps) {
  const accent = module.accent
  const protocols = useProtocols()
  const patients = usePatients()
  const upcoming = useUpcomingVisits()
  const alerts = useActiveAlerts()
  const solicitudes = useSolicitudesPendientes()
  const reportes = useReportesPendientes()

  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver al resumen', hint: 'Volver al resumen de Coordinación' }),
  })

  const cargandoKpis = protocols.loading || patients.loading || upcoming.loading || alerts.loading

  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []
  const upcomingRows = upcoming.data ?? []
  const alertRows = alerts.visitAlerts
  const solicitudRows = solicitudes.data ?? []

  const activeProtocols = allProtocols.filter((p) => p.status === 'activo').length
  const activePatients = allPatients.filter((p) => p.status === 'activo').length
  const overdueItems = alertRows.filter((a) => a.computed_status === 'item_vencido').length

  /* Próximas visitas agrupadas por día (vienen ordenadas por fecha de la query). */
  const groups: { date: string; visits: TrackVisitRow[] }[] = []
  for (const v of upcomingRows) {
    if (!v.estimated_date) continue // próximas visitas = del cronograma (las sueltas no tienen estimada)
    const last = groups[groups.length - 1]
    if (last && last.date === v.estimated_date) last.visits.push(v)
    else groups.push({ date: v.estimated_date, visits: [v] })
  }

  const irAAlertas = () => onNavigate?.('track', 'alertas')


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs — los cuatro navegan a su submódulo (D8). El rótulo del chip sale del registry. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <KpiCard kpi="protocolos" onNavigate={onNavigate} label="Protocolos activos" value={activeProtocols} sub={`${allProtocols.length} en total`} dot={accent} cargando={cargandoKpis} />
        <KpiCard kpi="pacientes" onNavigate={onNavigate} label="Pacientes activos" value={activePatients} sub={`${allPatients.length} registrados`} dot={accent} cargando={cargandoKpis} />
        <KpiCard kpi="pendientes" onNavigate={onNavigate} label="Pendientes vencidos" value={overdueItems} sub="reportes fuera de plazo" dot={overdueItems > 0 ? 'var(--spira-warn)' : accent} cargando={cargandoKpis} />
        <KpiCard kpi="visitas" onNavigate={onNavigate} label="Próximas visitas" value={upcomingRows.length} sub="próximos 7 días" dot={accent} cargando={cargandoKpis} />
      </div>

      {/*
        EL MOSAICO — dos tarjetas por columna, parejo (D2 + D13).

          ┌──────────────────────────┬──────────────────────────┐
          │ Reportes pendientes      │ Próximas visitas · 7 d   │
          │  (lo que hay que cerrar) │  (quién viene)           │
          ├──────────────────────────┼──────────────────────────┤
          │ Alertas                  │ Dispensaciones solicit.  │
          │  (lo que se pasó)        │  (lo que estás esperando)│
          └──────────────────────────┴──────────────────────────┘

        La izquierda es TRABAJO PROPIO —reportes que cerrar, desvíos que resolver—; la derecha es lo
        que depende de otros: pacientes que van a venir y pedidos que Farmacia tiene que atender.
        Esa es la lectura que hace que la columna izquierda se mire primero.

        Cuando entren las Tareas personales van arriba a la derecha y Dispensaciones baja a la
        izquierda; por eso cada tarjeta es un componente con nombre y esta grilla son cuatro líneas.

        `align-items: start` para que ninguna columna estire sus tarjetas al alto de la otra: sin
        eso, una tarjeta de dos renglones al lado de una lista larga se dibuja con un vacío enorme.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <ReportesCard
            rows={reportes.data ?? []}
            loading={reportes.loading}
            error={reportes.error}
            onReintentar={reportes.refetch}
            onOpenVisit={onNavigate && ((visitId) => onNavigate('track', 'visitas', { visitId }))}
            onOpenPatient={abrirFicha}
          />
          <AlertasCard
            rows={alertRows}
            loading={alerts.loading}
            error={alerts.error}
            onReintentar={alerts.refetch}
            onOpenAlerta={onNavigate && ((visitId) => onNavigate('track', 'alertas', { visitId }))}
            onOpenPatient={abrirFicha}
            onVerTodo={onNavigate ? irAAlertas : undefined}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <VisitasCard
            groups={groups}
            accent={accent}
            loading={upcoming.loading}
            error={upcoming.error}
            onReintentar={upcoming.refetch}
            onOpenVisit={onNavigate && ((visitId, visitDate) => onNavigate('track', 'visitas', { visitId, visitDate }))}
            onOpenPatient={abrirFicha}
          />
          <DispensacionesCard
            rows={solicitudRows}
            loading={solicitudes.loading}
            error={solicitudes.error}
            onReintentar={solicitudes.refetch}
            onOpenVisit={onNavigate && ((visitId) => onNavigate('track', 'visitas', { visitId }))}
            onOpenPatient={abrirFicha}
          />
        </div>
      </div>
    </div>
  )
}

/** Alertas vigentes: cabecera teñida por la PEOR presente, filas planas con punto de severidad. */
function AlertasCard({ rows, loading, error, onReintentar, onOpenAlerta, onOpenPatient, onVerTodo }: {
  rows: TrackVisitRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenAlerta?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  onVerTodo?: () => void
}) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <AlertCardHeader severidad={severidadMaxima(rows)} cantidad={rows.length} />
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="las alertas" onReintentar={onReintentar} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
          Sin alertas. Todo al día.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 4 }}>
            {rows.map((a, i) => {
              const c = VISIT_STATES[a.computed_status].color
              const vName = visitTitle(a)
              const motivo = a.computed_status === 'ventana_vencida'
                ? `Ventana vencida el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                : `Reporte de procedimiento fuera de plazo · ${vName}`
              const abrir = onOpenAlerta ? () => onOpenAlerta(a.id) : undefined
              return (
                <div
                  key={a.id}
                  role={abrir ? 'button' : undefined}
                  tabIndex={abrir ? 0 : undefined}
                  className={abrir ? 'spira-row-link spira-no-press' : undefined}
                  onClick={abrir}
                  onKeyDown={abrir ? (e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir() }
                  } : undefined}
                  aria-label={abrir ? `Abrir en Alertas la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}` : undefined}
                  style={{ ...filaAncha, ...(i === 0 ? { borderTopWidth: 0 } : null), ...(abrir ? null : { cursor: 'default' }) }}
                >
                  <Punto color={c} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="spira-link-group" style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                        <PatientLink onOpen={onOpenPatient && (() => onOpenPatient(a.patient_id, a.protocol_id))} label={`Abrir la ficha de ${a.patient_name}`}>
                          {a.patient_name}
                        </PatientLink>
                      </span>
                      <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 400 }}>
                        {a.patient_code
                          ? <PatientLink onOpen={onOpenPatient && (() => onOpenPatient(a.patient_id, a.protocol_id))} label={`Abrir la ficha del sujeto ${a.patient_code}`}>{a.patient_code}</PatientLink>
                          : '—'}
                      </span>
                      {onOpenPatient && <PatientLinkArrow />}
                      <span style={{ color: 'var(--spira-muted)', fontWeight: 400 }}>· <span className="spira-mono" style={{ fontSize: 12.5 }}>{a.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>{motivo}</div>
                  </div>
                </div>
              )
            })}
          </div>
          {/* La leyenda explica los PUNTOS, que es lo que ahora lleva la severidad. Los rótulos
              salen de VISIT_STATES para que no se separen de los chips del resto de la app el día
              que alguno se renombre. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, fontSize: 11.5, color: 'var(--spira-muted)' }}>
            {(['ventana_vencida', 'item_vencido'] as const).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: VISIT_STATES[s].color }} />
                {VISIT_STATES[s].label}
              </span>
            ))}
          </div>
        </>
      )}
      {onVerTodo && <VerTodo nombre="Alertas" onClick={onVerTodo} />}
    </div>
  )
}

/** Próximas visitas del cronograma (7 días), agrupadas por día. */
function VisitasCard({ groups, accent, loading, error, onReintentar, onOpenVisit, onOpenPatient }: {
  groups: { date: string; visits: TrackVisitRow[] }[]
  accent: string
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string, visitDate?: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
}) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={cardTitle}>Próximas visitas · 7 días</span>
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>agrupadas por día</span>
      </div>
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="las próximas visitas" onReintentar={onReintentar} />
      ) : groups.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
          Sin visitas en los próximos 7 días.
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {groups.map((g) => (
            <div key={g.date}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-muted)', fontWeight: 700, padding: '12px 0 6px' }}>
                {dayLabel(g.date)}
              </div>
              {g.visits.map((v) => (
                <VisitSummaryRow
                  key={v.id}
                  visit={v}
                  accent={accent}
                  /* Eje CLÍNICO, no operativo: estas visitas todavía no ocurrieron, así que "por
                     llegar" no querría decir nada. Lo que importa acá es el estado del expediente.
                     Sin ProcDots por lo mismo: hechos/total sería siempre 0. */
                  chip={<VisitChip status={v.computed_status} compact />}
                  onClick={() => onOpenVisit?.(v.id, v.estimated_date ?? undefined)}
                  ariaLabel={`Abrir la visita de ${v.patient_name} — ${visitTitle(v)}`}
                  onOpenPatient={onOpenPatient && (() => onOpenPatient(v.patient_id, v.protocol_id))}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Lo que Coordinación pidió a Farmacia y todavía espera. */
function DispensacionesCard({ rows, loading, error, onReintentar, onOpenVisit, onOpenPatient }: {
  rows: SolicitudPendienteRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId?: string) => void
}) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        icon="box"
        color="var(--spira-acc-deep-blue)"
        titulo="Dispensaciones solicitadas"
        extra={
          rows.length > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
              {rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="las dispensaciones solicitadas" onReintentar={onReintentar} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
          Sin dispensaciones pendientes.
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {rows.map((s, i) => (
            <SolicitudRow
              key={s.id}
              s={s}
              primera={i === 0}
              onOpenVisit={onOpenVisit}
              onOpenPatient={
                onOpenPatient && s.enrollment?.patient
                  ? () => onOpenPatient(s.enrollment!.patient!.id, s.protocol?.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {/* Sin "Ver todo" a propósito (D11): Farmacia › Dispensaciones exige un módulo que quien
          coordina puede no tener, y el destino por fila ya es la visita. */}
    </div>
  )
}
