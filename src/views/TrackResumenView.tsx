import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { SegmentedControl } from '../components/SegmentedControl'
import { useAuth } from '../lib/auth'
import { AlertCardHeader } from './AlertCardHeader'
import { severidadMaxima } from './alertSeverity'
import { KPI_DESTINOS, nombreDeDestino } from './resumen/destinos'
import type { KpiKey } from './resumen/destinos'
import { AMBITOS, esMiaSinAtender, esDeMisProtocolos, filtrarPorAmbito, hayAvisoDeAmbito, loAtendiYo, loPediYo } from './resumen/ambito'
import type { Ambito } from './resumen/ambito'
import { useProtocols, useMyCoordinations } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useUpcomingVisits, useVisitsPorReprogramar } from '../data/visits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useSolicitudesPendientes, ESTADO_SOLICITUD } from '../data/pharma'
import type { SolicitudPendienteRow } from '../data/pharma'
import { useReportesPendientes } from '../data/reportStatus'
import type { ReportStatusRow } from '../data/reportStatus'
import { dueLabel, esReportePendiente, esTarjeta } from './track/reportes/estados'
import type { TrackVisitRow } from '../data/visits'
import { visitTitle } from '../lib/visits'
import { notaDeAtraso } from './resumen/reprogramar'
import { formatAR, fromNow, todayISO } from '../lib/dates'
import { VISIT_STATES, VisitChip } from './visitStates'
import { VisitSummaryRow } from './VisitSummaryRow'
import { ErrorBloque, FilasFantasma } from './resumenEstados'
import { useAbrirFicha } from './useAbrirFicha'
import { VisitDetail } from './track/VisitDetail'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import { oneOf } from '../lib/router'
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
 * Cuántas filas muestra una tarjeta antes de mandar el resto al pie.
 *
 * Tres es el número que pidió el Director, y tiene una razón que se ve en pantalla: con cuatro
 * tarjetas en el mosaico, la que se estira decide el alto de su columna y empuja a la de abajo
 * fuera de vista. Tres filas dejan las cuatro comparables de un vistazo, que es lo que un resumen
 * tiene que dar; lo que no entra NO se esconde — cada pie dice cuántas faltan y cómo verlas.
 */
const MAX_FILAS = 3

/**
 * El pie "Ver más" que NAVEGA: a la izquierda el texto, a la derecha el nombre del submódulo
 * revelado al apuntarlo. Lo llevan las tarjetas cuya lista completa existe como pantalla —Alertas y
 * Próximas visitas—, porque ahí "ver más" es literalmente ir a verla.
 *
 * VA EN UN `<button>` A ANCHO COMPLETO, y ahí se separa del mock a propósito. En el handoff el
 * listener de hover vive en un `<span>` que **no tiene ningún `onClick`**: es un pie que parece un
 * link y no navega, y eso en esta app no se dibuja. Al hacerlo botón, el blanco de clic es toda la
 * fila (mejor, no peor) y el revelado dispara también con `:focus-visible`.
 *
 * `.spira-no-press` porque hereda la micro-interacción global y se levantaría 1px: acá el realce es
 * el revelado del rótulo, no un salto. Mismo criterio que `PatientLink`.
 */
function VerMas({ nombre, restantes, onClick }: { nombre: string; restantes: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="spira-row-link spira-no-press spira-dest-group"
      onClick={onClick}
      aria-label={restantes > 0 ? `Ver las ${restantes} restantes en ${nombre}` : `Ver todo en ${nombre}`}
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
      Ver más{restantes > 0 ? ` (${restantes})` : ''}
      <ChipDestino nombre={nombre} />
    </button>
  )
}

/**
 * El pie "Ver más" que DESPLIEGA ahí mismo, para las tarjetas que no tienen una pantalla a la que
 * mandar: Reportes pendientes (Coordinación no tiene submódulo Reportes) y Dispensaciones
 * solicitadas (viven en Farmacia, que quien coordina puede no tener).
 *
 * Es deliberadamente DISTINTO del que navega, y se nota a simple vista: dice cuántas faltan y lleva
 * un chevron en vez del rótulo de un submódulo. Dos acciones distintas no pueden verse iguales — un
 * mismo "Ver más" que a veces te saca de la pantalla y a veces no es de las cosas que se aprenden
 * sólo probando.
 *
 * `aria-expanded` porque es lo que convierte esto en un control entendible para un lector de
 * pantalla: sin él, "Ver más" y "Ver menos" son dos botones distintos apareciendo y desapareciendo.
 */
function VerMasLocal({ restantes, expandido, onToggle }: {
  restantes: number
  expandido: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="spira-row-link spira-no-press"
      onClick={onToggle}
      aria-expanded={expandido}
      aria-label={expandido ? 'Ver menos' : `Ver las ${restantes} restantes`}
      style={{
        ...filaAncha,
        alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto',
        fontSize: 12.5, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
      }}
    >
      {expandido ? 'Ver menos' : `Ver más (${restantes})`}
      <Icon name={expandido ? 'chevronUp' : 'chevronDown'} size={14} stroke={2.4} />
    </button>
  )
}

/** Cabecera de tarjeta con ícono, título y un dato al margen. */
function CardHeader({ icon, color, titulo, extra }: {
  icon: 'box' | 'clipboardCheck' | 'calendar'; color: string; titulo: string; extra?: ReactNode
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
 * El vacío de una tarjeta cuando el ámbito es "Lo mío".
 *
 * NO ES DECORACIÓN: sin esto, una tarjeta vacía dice "no hay nada que hacer", y acá puede
 * significar "no lo hiciste vos". La diferencia importa — del otro lado puede haber un reporte
 * venciendo. Por eso el texto nombra el motivo y ofrece la salida en el mismo lugar donde apareció
 * la duda, en vez de mandar a buscarla arriba.
 *
 * El botón es un `<button>` de verdad y no un span pulsable: es el único camino de teclado a "Todo"
 * desde acá, y mudarlo a un div lo dejaría sin foco sin que se note mirando la pantalla.
 */
function VacioDelAmbito({ texto, onVerTodo }: { texto: string; onVerTodo: () => void }) {
  return (
    <div style={{ padding: '14px 0 4px', fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
      {texto}{' '}
      <button
        type="button"
        onClick={onVerTodo}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          font: 'inherit', fontWeight: 700, color: 'var(--spira-acc-deep-track)',
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}
      >
        Ver todo
      </button>
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
 * · **Un pie que navegue.** Coordinación no tiene submódulo "Reportes" al que mandar, así que el
 *   pie DESPLIEGA la lista acá mismo en vez de prometer un lugar que no existe. Lo que sí navega es
 *   cada FILA, y va al tablero de SU protocolo con la pestaña ya abierta, que es donde ese reporte
 *   se gestiona de verdad.
 *
 * La barra de progreso son los EVOLUCIONADOS sobre el total, que es el único par de números que
 * significa algo acá: cuántos de los reportes en juego ya están cerrados.
 */
function ReportesCard({ rows, loading, error, onReintentar, onOpenReportes, onOpenPatient, vacioDelAmbito }: {
  rows: ReportStatusRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  /** Abre el tablero de reportes DEL PROTOCOLO de esa fila (detalle del protocolo, pestaña abierta). */
  onOpenReportes?: (protocolId: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  const [expandido, setExpandido] = useState(false)
  /* `esTarjeta` = el procedimiento está marcado realizado. Antes de eso el plazo no arrancó y el
     reporte no es todavía nada que gestionar (misma regla que el tablero, ya testeada). `pendientes`
     usa `esReportePendiente` —no un filtro repetido acá— porque es la MISMA definición que decide el
     aviso de "Lo mío" vacío más abajo en la vista: que coincidan dejó de ser un acuerdo tácito entre
     dos filtros y pasó a ser una sola función. */
  const tarjetas = rows.filter(esTarjeta)
  const resueltos = tarjetas.filter((r) => r.stage === 'evolucionado').length
  const pendientes = rows.filter(esReportePendiente)
  const pct = tarjetas.length === 0 ? 0 : Math.round((resueltos / tarjetas.length) * 100)
  const visibles = expandido ? pendientes : pendientes.slice(0, MAX_FILAS)
  const restantes = pendientes.length - visibles.length

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
        vacioDelAmbito ?? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            {tarjetas.length === 0 ? 'Sin reportes en juego.' : 'Todos los reportes están cerrados.'}
          </div>
        )
      ) : (
        <div style={{ marginTop: 8 }}>
          {visibles.map((r, i) => {
            const plazo = dueLabel(r)
            const abrir = onOpenReportes ? () => onOpenReportes(r.protocol_id) : undefined
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
                aria-label={abrir ? `Abrir los reportes pendientes de ${r.protocol_code} — ${r.report_name} de ${r.patient_name}, ${plazo.texto}` : undefined}
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
      {(restantes > 0 || expandido) && (
        <VerMasLocal restantes={restantes} expandido={expandido} onToggle={() => setExpandido((v) => !v)} />
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
 * Resumen del módulo Track: KPIs + reportes pendientes + alertas + dispensaciones pedidas + visitas
 * por reprogramar.
 *
 * Rediseñado el 2026-09-01 desde `docs/design_handoff_resumen_tareas_enfoque/`. Lo que cambió y por
 * qué está en `docs/plan-resumen-coordinacion-enfoque.md` (decisiones D1 a D12); lo que NO se portó
 * del handoff está igual de documentado ahí, y vale la pena saberlo antes de "completarlo": las
 * tarjetas de Tareas personales, Reportes pendientes y Pacientes piden datos que la base no tiene.
 *
 * Cada fila lleva a SU ítem: una visita por reprogramar abre su detalle en Visitas del día
 * (saltando a su fecha, que es donde el menú ⋯ ofrece "Reprogramar"), una alerta lleva a Alertas
 * —que abre ahí el modal— y una dispensación abre la visita de la que salió. Las alertas son las VIGENTES —`useActiveAlerts` deja afuera las descartadas
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
  /* Las dos consultas conviven: el KPI de arriba cuenta las PRÓXIMAS (7 días) y la tarjeta de abajo
     lista las ATRASADAS. Son dos preguntas distintas —qué se viene y qué quedó colgado— y el
     Director quiso conservar las dos (2026-09-05). */
  const upcoming = useUpcomingVisits()
  const porReprogramar = useVisitsPorReprogramar()
  const alerts = useActiveAlerts()
  const solicitudes = useSolicitudesPendientes()
  const reportes = useReportesPendientes()

  /* ┌─ El ámbito: "Lo mío" (por defecto) o "Todo" ────────────────────────────────────────────┐
     La pantalla YA venía filtrada por la RLS al nivel de protocolo, sin que ninguna palabra lo
     dijera (ver `data/reportStatus.ts` y `data/pharma/dispensations.ts`). Esto hace dos cosas: lo
     vuelve visible, y lo estrecha un paso más — de "mis protocolos" a "lo que yo hice".

     EL ALTERNADOR NO ES UN LUJO. Filtrar a "lo que yo atendí" es MÁS ANGOSTO que lo de hoy: si una
     compañera atendió una visita de mi protocolo, no cargó el reporte y se fue de licencia, sin
     escape ese pendiente no aparece en la pantalla de nadie. "Todo" es esa salida, y no expone ni
     un dato de más: muestra exactamente lo que la RLS ya deja ver.

     SE LLAMA "Todo" Y NO "Mi protocolo" porque para gerencia —que no coordina ninguno y ve el centro
     entero— lo segundo sería mentira. "Todo" es literal para los dos y evita una rama de copy por
     rol.

     VA EN LA URL con `mode: 'replace'` (el default): un filtro no es navegación, y si apilara,
     salir del Resumen después de un rato serían quince "atrás". Mismo criterio que el día y el
     buscador de Visitas del día.
     └──────────────────────────────────────────────────────────────────────────────────────────┘ */
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const coordinaciones = useMyCoordinations(userId)
  const [ambito, setAmbito] = useUrlState<Ambito>('ambito', 'mio', { codec: oneOf(AMBITOS) })

  const misProtocolos = useMemo(
    () => new Set((coordinaciones.data ?? []).map((c) => c.protocol_id)),
    [coordinaciones.data],
  )

  /* Quien no coordina NINGÚN protocolo (gerencia, farmacia) no ve el alternador y la pantalla le
     queda como siempre: para esa persona "Lo mío" no significa nada y sólo daría cuatro tarjetas
     vacías. Se deduce del dato, sin rol nuevo ni configuración.

     Mientras `useMyCoordinations` carga, `misProtocolos` está vacío — así que el alternador aparece
     recién cuando se sabe que hay coordinaciones, y no parpadea. */
  const esCoordinador = misProtocolos.size > 0
  const ambitoEfectivo: Ambito = esCoordinador ? ambito : 'todo'

  /* La visita abierta en el modal, DESDE ACÁ y sin salir del Resumen.

     Nace por la tarjeta de dispensaciones: llevaba a `track/visitas` con el `visitId`, y esa vista
     busca la visita ENTRE LAS DEL DÍA CARGADO (DayVisitsView:151). Como una solicitud puede ser de
     una visita de cualquier fecha y la fila no trae la suya, el salto aterrizaba en la lista de hoy
     sin abrir nada — un clic que parecía no hacer efecto. `VisitDetail` no tiene ese problema: trae
     sus datos por id (`useVisit`) y resuelve los permisos solo, así que abre cualquier visita
     independientemente de la fecha.

     Y es mejor destino, no sólo uno que funciona: el pedido de medicación se mira y se resuelve en
     la visita, no en una lista. Mismo criterio que Alertas, que abre su modal ahí adentro en vez de
     saltar a otra pantalla.

     `useUrlEntity` da push al abrir y replace al cerrar: el atrás del navegador CIERRA el modal en
     vez de sacarte del Resumen, y la URL con `?visita=` se puede compartir. */
  const [visitaAbierta, setVisitaAbierta] = useUrlEntity('visita')

  const abrirFicha = useAbrirFicha({
    module,
    onNavigate,
    volver: () => ({ moduleKey: module.key, subKey: submodule.key, label: 'Volver al resumen', hint: 'Volver al resumen de Coordinación' }),
  })

  /* `coordinaciones` entra acá y en el `loading` de las cuatro tarjetas, y NO por prolijidad:
     mientras esa consulta no resuelve, `misProtocolos` está vacío ⇒ `esCoordinador` da false ⇒
     `ambitoEfectivo` cae a "todo" — si otra consulta resuelve primero, la pantalla pinta KPIs y
     listas SIN filtrar y se encogen un instante después. `coordinaciones.error` NO entra: con error,
     `coordinaciones.data` queda `null` y `misProtocolos` cae al mismo vacío que con loading —
     `ambitoEfectivo` ya degrada solo a "todo", que es la dirección segura, sin que haga falta
     gatear nada. */
  const cargandoKpis = protocols.loading || patients.loading || upcoming.loading || alerts.loading || coordinaciones.loading

  /* Los KPIs de protocolos y pacientes NO se filtran, y no es un olvido: ya vienen scopeados por
     RLS (policies "ver protocolos asignados" 0006:92 y "ver pacientes de mis protocolos" 0006:128),
     y además un protocolo no se "atiende" — no tiene versión "lo que yo hice". */
  const allProtocols = protocols.data ?? []
  const allPatients = patients.data ?? []

  /* Las cuatro listas del mosaico, cada una con SU definición de "mío" (spec, D2). El ámbito manda
     sobre toda la pantalla —KPIs incluidos— porque un número y su lista tienen que contar lo mismo:
     si el KPI dijera 7 y la tarjeta listara 3, el que está mal es el que mira. */
  /* Próximas visitas SÍ usa `esDeMisProtocolos` a secas: son futuras, así que ninguna tiene
     coordinador todavía y no hay nada más fino que preguntar. */
  const upcomingRows = filtrarPorAmbito(ambitoEfectivo, upcoming.data ?? [], (v) =>
    esDeMisProtocolos(v, misProtocolos))
  /* Por reprogramar usa `esMiaSinAtender`, LA MISMA QUE ALERTAS, y no `esDeMisProtocolos` como
     nació: sus filas tienen `real_date is null` por definición, que es exactamente la población
     para la que existe esa regla. Con la regla floja, una visita asignada a OTRA coordinadora
     quedaba FUERA de Alertas y DENTRO de acá — dos tarjetas de la misma pantalla discrepando sobre
     si la fila es tuya, que es la clase de incoherencia que hace desconfiar de la pantalla entera.
     Se cazó mirando prod el 2026-09-05, no leyendo el código. */
  const reprogramarRows = filtrarPorAmbito(ambitoEfectivo, porReprogramar.data ?? [], (v) =>
    esMiaSinAtender(v, userId, misProtocolos))
  /* Alertas usa `esMiaSinAtender` y NO `loAtendiYo` a secas —la única de las cuatro que se aparta—
     porque la alerta más grave (ventana vencida) exige `real_date is null` (0102) y `real_date`
     lo escribe la MISMA operación que sella `coordinator_id`: esa alerta NUNCA tiene coordinador,
     así que filtrar con `loAtendiYo` borraría la clase entera apenas alguien prenda "Lo mío". Acá
     "mía" es la atendí yo, o nadie la atendió todavía y es de un protocolo que coordino. Ver el
     comentario de `esMiaSinAtender` en `ambito.ts`. */
  const alertRows = filtrarPorAmbito(ambitoEfectivo, alerts.visitAlerts, (a) =>
    esMiaSinAtender(a, userId, misProtocolos))
  const solicitudRows = filtrarPorAmbito(ambitoEfectivo, solicitudes.data ?? [], (s) =>
    loPediYo(s, userId))
  const reporteRows = filtrarPorAmbito(ambitoEfectivo, reportes.data ?? [], (r) =>
    loAtendiYo(r, userId))

  /* El aviso sólo tiene sentido si hay algo del otro lado. Ofrecer "Ver todo" cuando "Todo" también
     está vacío manda a alguien a confirmar una nada — y en esta pantalla un viaje en falso cuesta
     confianza. Por eso se compara contra la lista SIN filtrar, que la vista ya tiene a mano — y con
     el MISMO criterio de vacío que usa cada tarjeta (ver `hayEnTodo` de Reportes más abajo: no
     alcanza un `.length > 0` crudo si la tarjeta decide su vacío con otro criterio).

     La condición de dos partes (`ambitoEfectivo === 'mio' && hayEnTodo`) vive en `hayAvisoDeAmbito`
     y tiene su test — acá sólo queda la construcción del elemento React. En ámbito "Todo" devuelve
     `undefined` y cada tarjeta cae a su vacío de siempre: ahí "no hay nada" es la verdad completa y
     no hay a dónde mandar a nadie. */
  const avisoDeAmbito = (texto: string, hayEnTodo: boolean) =>
    hayAvisoDeAmbito(ambitoEfectivo, hayEnTodo)
      ? <VacioDelAmbito texto={texto} onVerTodo={() => setAmbito('todo')} />
      : undefined

  const activeProtocols = allProtocols.filter((p) => p.status === 'activo').length
  const activePatients = allPatients.filter((p) => p.status === 'activo').length
  const overdueItems = alertRows.filter((a) => a.computed_status === 'item_vencido').length

  const irAAlertas = () => onNavigate?.('track', 'alertas')


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* El alternador sólo existe para quien coordina algo (ver `esCoordinador`). Se apoya en
          SegmentedControl, que ya resuelve el `role="radiogroup"` (con `aria-label` propio) y no se
          dibuja a mano para no repetir la accesibilidad. EL TECLADO NO LO RESUELVE: son N `<button>`
          nativos sin flechas ni roving tabindex — se navega con Tab y se activa con Espacio/Enter,
          que alcanza para WCAG 2.1.1 pero no es lo mismo que un radiogroup con flechas. El realce del
          seleccionado es el del componente: ELEVACIÓN (fondo sólido + sombra), sin borde ni fondo
          de color y sin nada agregado desde un handler. */}
      {esCoordinador && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SegmentedControl<Ambito>
            options={[{ value: 'mio', label: 'Lo mío' }, { value: 'todo', label: 'Todo' }]}
            value={ambito}
            onChange={setAmbito}
            label="Ámbito del resumen"
          />
        </div>
      )}

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
          │ Reportes pendientes      │ Dispensaciones solicit.  │
          │  (lo que hay que cerrar) │  (lo que estás esperando)│
          ├──────────────────────────┼──────────────────────────┤
          │ Alertas                  │ Por reprogramar          │
          │  (lo que se pasó)        │  (lo que quedó colgado)  │
          └──────────────────────────┴──────────────────────────┘

        La izquierda es TRABAJO PROPIO —reportes que cerrar, desvíos que resolver—; a la derecha,
        arriba, lo que depende de otros: pedidos que Farmacia tiene que atender. Esa es la lectura
        que hace que la columna izquierda se mire primero.

        LA TARJETA DE ABAJO A LA DERECHA CAMBIÓ DE EJE el 2026-09-05: era "Próximas visitas · 7
        días" —quién viene— y pasó a ser "Por reprogramar" —qué quedó sin resolver. Es un cambio
        deliberado y con un costo asumido: el Resumen deja de anunciar la semana que viene. Se
        cambió porque no hay ninguna otra pantalla que junte las visitas atrasadas (Visitas del día
        muestra UN día, Alertas sólo las de ventana vencida), y ésta es la que más se mira.

        Sigue ABAJO de todo en su columna (pedido del Director): es la única lista que crece sin
        techo, así que arriba empujaría a la de dispensaciones fuera de vista.

        Cuando entren las Tareas personales van arriba a la derecha; por eso cada tarjeta es un
        componente con nombre y esta grilla son cuatro líneas.

        `align-items: start` para que ninguna columna estire sus tarjetas al alto de la otra: sin
        eso, una tarjeta de dos renglones al lado de una lista larga se dibuja con un vacío enorme.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <ReportesCard
            rows={reporteRows}
            loading={reportes.loading || coordinaciones.loading}
            error={reportes.error}
            onReintentar={reportes.refetch}
            /* Al tablero de reportes DEL PROTOCOLO de esa fila, con la pestaña ya abierta —
               `/coordinacion/pacientes/<código>?tab=reportes`. Ahí es donde el reporte se mueve de
               etapa; abrir la visita sería dejar a la persona a un paso todavía. */
            onOpenReportes={onNavigate && ((protocolId) => onNavigate('track', 'protocolos', { protocolId, protocolTab: 'reportes' }))}
            onOpenPatient={abrirFicha}
            /* `ReportesCard` no se considera vacía con un `.length > 0` crudo: usa `esReportePendiente`
               (el procedimiento está realizado y el reporte no llegó a `evolucionado`; ver esa
               función en `estados.ts`, la MISMA que usa la tarjeta puertas adentro). Comparar acá
               contra el dato crudo podía ofrecer "Ver todo" cuando del otro lado sólo había reportes
               cerrados por otra persona — un viaje en falso a "Todos los reportes están cerrados",
               justo lo que este aviso existe para evitar. */
            vacioDelAmbito={avisoDeAmbito('No atendiste visitas con reportes pendientes.',
              (reportes.data ?? []).some(esReportePendiente))}
          />
          <AlertasCard
            rows={alertRows}
            loading={alerts.loading || coordinaciones.loading}
            error={alerts.error}
            onReintentar={alerts.refetch}
            onOpenAlerta={onNavigate && ((visitId) => onNavigate('track', 'alertas', { visitId }))}
            onOpenPatient={abrirFicha}
            onVerTodo={onNavigate ? irAAlertas : undefined}
            vacioDelAmbito={avisoDeAmbito('Ninguna de tus visitas está en alerta.',
              alerts.visitAlerts.length > 0)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <DispensacionesCard
            rows={solicitudRows}
            loading={solicitudes.loading || coordinaciones.loading}
            error={solicitudes.error}
            onReintentar={solicitudes.refetch}
            /* Abre el modal ACÁ, no salta a Visitas. Ver el comentario de `visitaAbierta`: esa
               vista busca la visita entre las del día cargado, y una solicitud puede ser de
               cualquier fecha — el salto aterrizaba en la lista de hoy sin abrir nada. */
            onOpenVisit={(visitId) => setVisitaAbierta(visitId)}
            onOpenPatient={abrirFicha}
            vacioDelAmbito={avisoDeAmbito('No pediste medicación que siga abierta.',
              (solicitudes.data ?? []).length > 0)}
          />
          <PorReprogramarCard
            rows={reprogramarRows}
            accent={accent}
            loading={porReprogramar.loading || coordinaciones.loading}
            error={porReprogramar.error}
            onReintentar={porReprogramar.refetch}
            /* A Visitas del día con la fecha puesta: ahí vive el menú ⋯ que reprograma. El salto
               funciona con fechas pasadas justamente porque va con `visitDate` — sin eso aterriza
               en la lista de hoy sin abrir nada (ver el comentario de `visitaAbierta`). */
            onOpenVisit={onNavigate && ((visitId, visitDate) => onNavigate('track', 'visitas', { visitId, visitDate }))}
            onOpenPatient={abrirFicha}
            vacioDelAmbito={avisoDeAmbito('No hay visitas por reprogramar en tus protocolos.',
              (porReprogramar.data ?? []).length > 0)}
          />
        </div>
      </div>

      {visitaAbierta && (
        <VisitDetail
          visitId={visitaAbierta}
          accent={accent}
          onClose={() => setVisitaAbierta(null)}
          /* Lo que se hace en el modal puede cerrar la solicitud o mover la visita, así que las dos
             tarjetas que dependen de eso se refrescan al volver. Las otras dos no: sus datos no los
             toca este modal, y refetchearlas de más haría parpadear media pantalla al cerrar. */
          onChanged={() => { solicitudes.refetch(); porReprogramar.refetch(); upcoming.refetch() }}
          /* El mismo gesto que ya tienen las filas: `abrirFicha` cae solo a `undefined` sin
             `onNavigate`, y ahí el encabezado del modal degrada a texto pelado. */
          onOpenPatient={abrirFicha}
        />
      )}
    </div>
  )
}

/** Alertas vigentes: cabecera teñida por la PEOR presente, filas planas con punto de severidad. */
function AlertasCard({ rows, loading, error, onReintentar, onOpenAlerta, onOpenPatient, onVerTodo, vacioDelAmbito }: {
  rows: TrackVisitRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenAlerta?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  onVerTodo?: () => void
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  /* El contador de la cabecera cuenta TODAS, no las visibles: recortar la lista no puede cambiar
     cuántas alertas hay — ése es el número que importa. YA NO es el mismo que muestra la campana:
     `NotificationsMenu` usa `useActiveAlerts` sin filtrar por ámbito, así que con "Lo mío" puesto
     acá cuentan menos alertas que las que la campana anuncia (a propósito — es el punto del
     alternador). */
  const visibles = rows.slice(0, MAX_FILAS)
  const restantes = rows.length - visibles.length
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <AlertCardHeader severidad={severidadMaxima(rows)} cantidad={rows.length} />
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="las alertas" onReintentar={onReintentar} />
      ) : rows.length === 0 ? (
        vacioDelAmbito ?? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            Sin alertas. Todo al día.
          </div>
        )
      ) : (
        <>
          {/* Sin `marginTop` propio: la separación con la banda teñida la pone ahora la cabecera
              (su margen inferior), para que las dos pantallas que la usan respiren igual. */}
          <div>
            {visibles.map((a, i) => {
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
      {/* Gateado por `rows.length > 0`: con la tarjeta vacía, "Ver todo" (cambia
          el ámbito, del `vacioDelAmbito` de arriba) y "Ver más · Alertas" (navega a otra pantalla)
          son dos affordances que navegan a lugares distintos — con las dos presentes a la vez, cuál
          hace qué deja de ser obvio. */}
      {onVerTodo && rows.length > 0 && <VerMas nombre="Alertas" restantes={restantes} onClick={onVerTodo} />}
    </div>
  )
}

/**
 * Visitas SIN ATENDER que quedaron fuera de fecha: o el paciente no vino y se marcó la falta, o
 * simplemente se pasó la fecha citada y nadie la tocó. La más atrasada primero.
 *
 * REEMPLAZÓ A "Próximas visitas · 7 días" el 2026-09-05 (ver `docs/plan-por-reprogramar.md`), y con
 * ella se fue el AGRUPADO POR DÍA. Hacia adelante agrupar ordenaba —en siete días varias visitas
 * caen el mismo día—; hacia atrás las fechas están dispersas, así que daría un encabezado por fila:
 * tres encabezados para las tres que entran. En su lugar cada fila lleva su atraso en la `nota`,
 * que dice lo mismo en un tercio del espacio y agrega hace cuánto, que es lo que decide a cuál
 * agarrar primero.
 *
 * SE SOLAPA CON ALERTAS A PROPÓSITO. Una visita en ventana vencida está en las dos tarjetas de esta
 * pantalla, y no es un descuido: Alertas dice "hay un desvío que documentar o descartar" y ésta dice
 * "hay que darle fecha nueva" — dos acciones distintas sobre la misma fila. Y los ciclos son
 * distintos: una alerta DESCARTADA (0070) desaparece de Alertas y de la campana, y la visita sigue
 * sin fecha. Si esta tarjeta la excluyera "porque ya está en Alertas", se caería de las dos.
 *
 * EL PIE DESPLIEGA ACÁ MISMO y no navega, igual que Dispensaciones y por el mismo criterio: no
 * existe ninguna pantalla con esta lista. Visitas del día muestra UN día, así que mandar ahí desde
 * una lista de atrasadas repartidas en semanas sería prometer algo que no se va a mostrar. Lo que sí
 * navega es cada FILA, y va a la visita, que es donde se reprograma.
 */
function PorReprogramarCard({ rows, accent, loading, error, onReintentar, onOpenVisit, onOpenPatient, vacioDelAmbito }: {
  rows: TrackVisitRow[]
  accent: string
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string, visitDate?: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  const [expandido, setExpandido] = useState(false)
  const visibles = expandido ? rows : rows.slice(0, MAX_FILAS)
  const restantes = rows.length - visibles.length
  /* UN SOLO `hoy` para toda la tarjeta. Si cada fila lo pidiera por su cuenta, una lista dibujada
     al filo de la medianoche contaría los días contra dos fechas distintas y dos filas de la misma
     jornada dirían antigüedades incoherentes. */
  const hoy = todayISO()
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        icon="calendar"
        color="var(--spira-acc-deep-warn)"
        titulo="Por reprogramar"
        extra={
          rows.length > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
              {rows.length} {rows.length === 1 ? 'visita' : 'visitas'}
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <FilasFantasma />
      ) : error ? (
        <ErrorBloque que="las visitas por reprogramar" onReintentar={onReintentar} />
      ) : rows.length === 0 ? (
        vacioDelAmbito ?? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            No hay visitas por reprogramar.
          </div>
        )
      ) : (
        <div style={{ marginTop: 8 }}>
          {visibles.map((v) => (
            <VisitSummaryRow
              key={v.id}
              visit={v}
              accent={accent}
              /* Eje CLÍNICO, como en la tarjeta que reemplazó: lo que importa es el estado del
                 expediente. El chip y la nota NO dicen lo mismo aunque se parezcan — el chip da el
                 estado que ve el sponsor ("Ventana vencida", "Por reprogramar") y la nota da el
                 hecho y su antigüedad, que es lo que ordena el trabajo. Sin ProcDots: estas visitas
                 no se atendieron, así que hechos/total sería siempre 0. */
              chip={<VisitChip status={v.computed_status} compact />}
              nota={notaDeAtraso(v, hoy)}
              onClick={() => onOpenVisit?.(v.id, v.estimated_date ?? undefined)}
              ariaLabel={`Abrir la visita de ${v.patient_name} — ${visitTitle(v)}`}
              onOpenPatient={onOpenPatient && (() => onOpenPatient(v.patient_id, v.protocol_id))}
            />
          ))}
        </div>
      )}
      {(restantes > 0 || expandido) && (
        <VerMasLocal restantes={restantes} expandido={expandido} onToggle={() => setExpandido((x) => !x)} />
      )}
    </div>
  )
}

/** Lo que Coordinación pidió a Farmacia y todavía espera. */
function DispensacionesCard({ rows, loading, error, onReintentar, onOpenVisit, onOpenPatient, vacioDelAmbito }: {
  rows: SolicitudPendienteRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId?: string) => void
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  const [expandido, setExpandido] = useState(false)
  const visibles = expandido ? rows : rows.slice(0, MAX_FILAS)
  const restantes = rows.length - visibles.length
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
        vacioDelAmbito ?? (
          <div style={{ fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
            Sin dispensaciones pendientes.
          </div>
        )
      ) : (
        <div style={{ marginTop: 8 }}>
          {visibles.map((s, i) => (
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
      {/* El pie DESPLIEGA acá mismo y no navega (D11 + D15): Farmacia › Dispensaciones exige un
          módulo que quien coordina puede no tener, así que mandar ahí le dejaría un pie muerto a
          media plantilla. El destino por fila ya es la visita, que sí está garantizado. */}
      {(restantes > 0 || expandido) && (
        <VerMasLocal restantes={restantes} expandido={expandido} onToggle={() => setExpandido((v) => !v)} />
      )}
    </div>
  )
}
