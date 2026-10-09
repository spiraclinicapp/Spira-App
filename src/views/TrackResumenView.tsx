import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { PatientLink, PatientLinkArrow } from '../components/PatientLink'
import { useAuth } from '../lib/auth'
import { AlertCardHeader } from './AlertCardHeader'
import { CabeceraDeTarjeta, card, ChipDestino, DetalleConEstado, filaAncha, FilaDeResumen, MAX_FILAS } from './resumen/piezas'
import { GRAVEDAD, ordenarPorGravedad, severidadMaxima } from './alertSeverity'
import { DESTINO_PENDIENTES, DESTINO_REPORTES, DESTINO_TAREAS, KPI_DESTINOS, nombreDeDestino } from './resumen/destinos'
import type { KpiKey } from './resumen/destinos'
import { proximoDiaConVisitas } from './resumen/proximoDia'
import { personaActiva } from '../lib/inscripcion'
import { AMBITOS, esMiaSinAtender, esDeMisProtocolos, esReporteMio, esTareaMia, filtrarPorAmbito, hayAvisoDeAmbito, loAtendiYo, loPediYo } from './resumen/ambito'
import type { Ambito } from './resumen/ambito'
import { useProtocols, useMyCoordinations } from '../data/protocols'
import { usePatients } from '../data/patients'
import { useUpcomingVisits } from '../data/visits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useSolicitudesPendientes, ESTADO_SOLICITUD } from '../data/pharma'
import type { SolicitudPendienteRow } from '../data/pharma'
import { useMyTasks } from '../data/tareas'
import { estaHecha } from './tareas/estados'
import { TareasCard } from './resumen/TareasCard'
import { SoloLoMio } from './resumen/SoloLoMio'
import { setReportStage, useReportesPendientes } from '../data/reportStatus'
import type { FilaReportePendiente } from '../data/reportStatus'
import { esReportePendiente, esTarjeta, reporteTitulo } from './track/reportes/estados'
import type { ReportStage } from './track/reportes/estados'
import { agruparPorVisita, aplicarEtapas, claveReporte, textoPlazo, totales } from './track/reportes/porPaciente'
import {
  AccionDeReporte, BarraDeReportes, ConteoDeReportes, EstadoDeReporte, estiloPlazo,
} from './track/reportes/piezasPaciente'
import type { TrackVisitRow } from '../data/visits'
import { visitTitle } from '../lib/visits'
import { dayLabel, formatAR, fromNow, todayISO } from '../lib/dates'
import { GLOSARIO_ESTADOS } from '../lib/glosario'
import { VISIT_STATES, VisitChip } from './visitStates'
import { VisitSummaryRow } from './VisitSummaryRow'
import { CuerpoDeTarjeta, VacioSimple } from './resumenEstados'
import { useAbrirFicha } from './useAbrirFicha'
import { VisitDetail } from './track/VisitDetail'
import { useUrlEntity, useUrlState } from '../lib/useUrlState'
import { oneOf } from '../lib/router'
import type { ViewProps } from './types'

/** El punto de color de una fila plana: sustituye a la superficie teñida como marca de severidad. */
function Punto({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: '0 0 auto', marginTop: 6 }} />
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
      </div>
      {/* EL RÓTULO DE DESTINO VA EN EL RENGLÓN DEL NÚMERO, no en el del rótulo. Invisible y todo,
          `.spira-dest` ocupa su ancho desde el primer render (el revelado es opacidad + transform,
          para no correr el layout), y en el renglón del rótulo ese hueco se lo comía al texto: a
          1346px de ventana el KPI decía «Prot…» y «Paci…» SIEMPRE, sin hover. Al lado del número
          sobra lugar —son dos o tres cifras—, y si la tarjeta se angosta lo que se recorta es el
          rótulo de destino (`minWidth: 0`), que es secundario, y nunca el dato. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <div style={{ flex: '0 0 auto', fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 38, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {cargando ? <span style={{ color: 'var(--spira-muted)' }}>—</span> : value}
        </div>
        {navega && (
          <span style={{ marginLeft: 'auto', minWidth: 0, display: 'flex', overflow: 'hidden' }}>
            <ChipDestino nombre={nombre} />
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

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
      {/* "Ver todo" cuando no quedó nada afuera: el `aria-label` de arriba YA decía eso, así que el
          texto visible y lo que anuncia el lector de pantalla se contradecían. Y "Ver más" sobre una
          lista completa promete filas que no hay — el pie igual tiene sentido (la pantalla destino
          muestra cada visita con sus procedimientos y sus acciones), pero eso es "ver todo", no
          "ver más". Lo destapó la tarjeta de un solo día, donde entran las tres filas casi siempre. */}
      {restantes > 0 ? `Ver más (${restantes})` : 'Ver todo'}
      <ChipDestino nombre={nombre} />
    </button>
  )
}

/**
 * El pie "Ver más" que DESPLIEGA ahí mismo, para las tarjetas que no tienen una pantalla a la que
 * mandar: hoy, Dispensaciones solicitadas (viven en Farmacia, que quien coordina puede no tener).
 * Reportes pendientes también lo usaba hasta el 2026-10-04, cuando Coordinación ganó su pantalla
 * de Reportes y el pie pasó a ser el `VerMas` que navega.
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
        {/* Mismo nombre que el switch apagado: este botón hace exactamente eso. */}
        Ver lo de todos
      </button>
    </div>
  )
}

/**
 * Tarjeta "Reportes pendientes": UNA FILA POR PACIENTE EN UNA VISITA, los más urgentes arriba, que se
 * despliega para actuar ahí mismo (handoff `design_handoff_reportes_pendientes` §6, plan
 * `docs/plan-reportes-pendientes.md`, PR2). Antes era una fila por reporte: un paciente con tres
 * informes ocupaba las tres filas de la tarjeta.
 *
 * Usa las MISMAS reglas y piezas que `Coordinación › Reportes` (`porPaciente.ts`,
 * `piezasPaciente.tsx`): si la tarjeta tuviera su propia cuenta, el Resumen y la pantalla dirían cosas
 * distintas del mismo paciente.
 *
 * LO QUE SE APARTA DEL HANDOFF, y por qué:
 *
 * · **Tres filas y no cinco** (12A). El mosaico está medido para `MAX_FILAS` (ver el comentario de la
 *   grilla, más abajo): cinco filas desplegables empujaban Pendientes fuera de la línea de flotación.
 * · **El pie dice «Ver los N pacientes en Reportes»** (`PieDeReportes`), como el handoff, y NO es el
 *   `VerMas` de Pendientes y Tareas. Salió con el `VerMas` en la #376 y el Director lo pidió como el
 *   handoff (2026-10-04): acá el pie no dice «cuántas filas más», dice a cuántos pacientes vas a ver
 *   allá. N son PACIENTES DISTINTOS EN EL DESTINO (2A): la pantalla de Reportes no tiene ámbito, así
 *   que con «Lo mío» puede haber más allá que acá, y el número tiene que describir a dónde se va. El
 *   nombre de la pantalla sale del registry («Reportes», como en el menú), no del texto del mock.
 * · **Ahora SÍ hay acciones en la tarjeta**, y es un cambio de criterio a sabiendas: la versión vieja no
 *   las tenía porque mover un reporte «no se hace de pasada». Lo que lo vuelve razonable es que la
 *   acción pasa por la misma RPC (`set_report_stage`, permiso y autor del lado del servidor) y que se
 *   llega a ella desplegando, no de un clic suelto sobre la fila.
 *
 * Mover un reporte NO recarga la tarjeta: la etapa nueva se aplica sobre las filas en memoria, y la
 * fila se queda en su lugar diciendo «Listo» hasta la próxima carga (la cabecera de `porPaciente.ts`
 * explica por qué la base decide qué se ve y lo actual cómo se ve).
 */
function ReportesCard({ rows, origen, loading, error, onReintentar, onOpenPatient, pacientesEnDestino, nombreDestino, onVerTodo, vacioDelAmbito, canOperate, accentSolid, onMovido }: {
  /** Las filas del ÁMBITO elegido (Lo mío / Todo). */
  rows: FilaReportePendiente[]
  /**
   * Lo que trajo el servidor, sin filtrar, para saber CUÁNDO hubo una carga nueva. `rows` se recalcula
   * en cada dibujo de la vista y no sirve para eso: con él, el overlay se vaciaría a cada render.
   */
  origen: unknown
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  /** Cuántos pacientes distintos muestra la pantalla de Reportes (sin ámbito). */
  pacientesEnDestino: number
  nombreDestino: string | null
  onVerTodo?: () => void
  vacioDelAmbito?: ReactNode
  canOperate: boolean
  accentSolid: string
  /** Avisa que un reporte cambió, para refrescar lo de al lado (el KPI de reportes vencidos). */
  onMovido: () => void
}) {
  const [overlay, setOverlay] = useState<Map<string, ReportStage>>(() => new Map())
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set())
  const [ocupados, setOcupados] = useState<Set<string>>(() => new Set())
  /* El «en vuelo» en un ref: dos clics en el mismo tick leen el mismo estado (ver el submódulo). */
  const enVuelo = useRef<Set<string>>(new Set())
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  useEffect(() => { setOverlay(new Map()) }, [origen])
  const now = useMemo(() => Date.now(), [origen])

  const actuales = aplicarEtapas(rows, overlay)
  const visitas = agruparPorVisita(rows, actuales, now)
  /* La barra de la cabecera sale de lo ACTUAL: un reporte evolucionado recién la mueve en el acto. */
  const tarjetas = actuales.filter(esTarjeta)
  const resueltos = tarjetas.filter((r) => r.stage === 'evolucionado').length
  const pct = tarjetas.length === 0 ? 0 : Math.round((resueltos / tarjetas.length) * 100)
  const visibles = visitas.slice(0, MAX_FILAS)

  const mover = async (r: FilaReportePendiente, destino: ReportStage) => {
    const clave = claveReporte(r)
    if (enVuelo.current.has(clave)) return
    enVuelo.current.add(clave)
    setOcupados((s) => new Set(s).add(clave))
    setErrorAccion(null)
    const res = await setReportStage(r.visit_id, r.report_definition_id, destino)
    enVuelo.current.delete(clave)
    setOcupados((s) => { const n = new Set(s); n.delete(clave); return n })
    if (res.error) { setErrorAccion(res.error); return }
    setOverlay((m) => new Map(m).set(clave, destino))
    onMovido()
  }

  const alternar = (visitId: string) => setAbiertas((s) => {
    const n = new Set(s)
    if (n.has(visitId)) n.delete(visitId)
    else n.add(visitId)
    return n
  })

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <CabeceraDeTarjeta
        icon="fileText"
        titulo="Reportes pendientes"
        extra={tarjetas.length > 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '0 0 auto' }}>
            <span
              style={{ width: 96, height: 5, borderRadius: 'var(--spira-radius-pill)', background: 'var(--spira-line)', overflow: 'hidden', flex: '0 0 auto' }}
              role="img"
              aria-label={`${resueltos} de ${tarjetas.length} reportes evolucionados`}
            >
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--spira-acc-deep-track)' }} />
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }} aria-hidden="true">
              {resueltos} de {tarjetas.length}
            </span>
          </span>
        ) : undefined}
      />
      <CuerpoDeTarjeta
        loading={loading}
        error={error}
        que="los reportes pendientes"
        onReintentar={onReintentar}
        vacia={visitas.length === 0}
        vacio={<VacioSimple>{tarjetas.length === 0 ? 'Sin reportes en juego.' : 'Todos los reportes están evolucionados.'}</VacioSimple>}
        vacioDelAmbito={vacioDelAmbito}
      >
        <div style={{ marginTop: 8 }}>
          {visibles.map((v, i) => {
            const abierta = abiertas.has(v.visitId)
            const plazo = v.plazo.tipo === 'listo' ? null : textoPlazo(v.plazo, true)
            return (
              <div key={v.visitId}>
                <FilaDeResumen
                  primera={i === 0}
                  expandido={abierta}
                  onAbrir={() => alternar(v.visitId)}
                  ariaLabel={`${v.patientName}, ${v.protocolCode} ${v.visitLabel}: ${abierta ? 'cerrar' : 'ver'} sus reportes`}
                  punto={
                    <Icon name="chevronRight" size={15} color="var(--spira-ink-soft)" style={{ flex: '0 0 auto', transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform .15s var(--spira-ease-out)' }} />
                  }
                  titular={
                    <>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        <PatientLink onOpen={onOpenPatient && (() => onOpenPatient(v.patientId, v.protocolId))} label={`Abrir la ficha de ${v.patientName}`}>
                          {v.patientName}
                        </PatientLink>
                      </span>
                      {onOpenPatient && <PatientLinkArrow />}
                    </>
                  }
                  detalle={
                    /* Nombre arriba e IVRS acá, en mono: la regla de identidad de la casa (D4). El
                       tono del plazo lo decide `estiloPlazo`, que sabe si venció. */
                    <DetalleConEstado
                      contexto={<>{v.ivrs && <><span className="spira-mono">{v.ivrs}</span> · </>}{v.protocolCode} · {v.visitLabel}</>}
                      estado={plazo}
                      tono={estiloPlazo(v.plazo).color}
                    />
                  }
                  derecha={
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                      <BarraDeReportes reportes={v.reportes} ancho={72} alto={7} now={now} />
                      <ConteoDeReportes conteo={v.conteo} vencida={v.vencida} corto />
                    </span>
                  }
                />
                {abierta && (
                  <div style={panelResumen}>
                    {v.reportes.map((r, j) => (
                      <div key={r.report_definition_id} style={{ ...renglonResumen, ...(j === 0 ? { borderTopWidth: 0 } : null) }}>
                        {/* Sin el prefijo «Informe» (handoff §6.3): en una tarjeta angosta es la palabra
                            que sobra, y adentro de «Reportes pendientes» se sobreentiende. */}
                        <span title={reporteTitulo(r.report_name, r.procedure_name)} style={{ fontSize: 13, color: 'var(--spira-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {r.report_name.replace(/^informe\s+/i, '')}
                        </span>
                        <EstadoDeReporte reporte={r} now={now} variante="texto" />
                        {canOperate
                          ? <AccionDeReporte reporte={r} compacta busy={ocupados.has(claveReporte(r))} accentSolid={accentSolid} onStage={(d) => void mover(r, d)} />
                          : <span />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {errorAccion && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '8px 0 2px' }}>
              <Icon name="alertCircle" size={14} color="var(--spira-danger)" />
              {errorAccion}
            </div>
          )}
        </div>
      </CuerpoDeTarjeta>
      {onVerTodo && nombreDestino && visitas.length > 0 && pacientesEnDestino > 0 && (
        <PieDeReportes pacientes={pacientesEnDestino} nombre={nombreDestino} onClick={onVerTodo} />
      )}
    </div>
  )
}

/**
 * El pie de la tarjeta de reportes (handoff §6.4): «Ver los N pacientes en Reportes» a lo ancho, con la
 * flecha a la derecha. El texto ya dice a dónde va, así que no lleva el chip de destino del `VerMas`.
 *
 * Misma caja y mismo resaltado que los otros pies (`filaAncha`, `.spira-row-link`) y el mismo color:
 * `--spira-acc-deep-track` y NO `--spira-primary`, aunque el handoff diga primary — en oscuro el primario
 * daba 2,14:1 sobre la tarjeta (ver el comentario de `VerMas`).
 */
function PieDeReportes({ pacientes, nombre, onClick }: { pacientes: number; nombre: string; onClick: () => void }) {
  const texto = pacientes === 1 ? `Ver el paciente en ${nombre}` : `Ver los ${pacientes} pacientes en ${nombre}`
  return (
    <button
      type="button"
      className="spira-row-link spira-no-press"
      onClick={onClick}
      style={{
        ...filaAncha,
        alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto', padding: '12px 20px',
        fontSize: 13, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
      }}
    >
      {texto}
      <Icon name="arrowRight" size={15} stroke={2.2} />
    </button>
  )
}

/* El panel de una fila abierta: sangra a los bordes de la tarjeta como la fila (ver `filaAncha`), con
   el fondo del resaltado para leerse como un solo bloque con ella. */
const panelResumen: CSSProperties = {
  width: 'calc(100% + 40px)', margin: '0 -20px', padding: '0 20px 10px 46px',
  background: 'var(--spira-surface)',
}
const renglonResumen: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, alignItems: 'center',
  padding: '7px 0', borderWidth: 0, borderTopWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
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
    <FilaDeResumen
      primera={primera}
      onAbrir={abrir}
      ariaLabel={`Abrir la visita de ${paciente?.full_name ?? 'el paciente'} — ${titulo}, ${estado.label}`}
      titular={
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{titulo}</span>
          <span style={{ color: 'var(--spira-muted)', fontWeight: 400, flex: '0 0 auto' }}>·</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${paciente?.full_name ?? ''}`}>
              {paciente?.full_name ?? '—'}
            </PatientLink>
          </span>
          {onOpenPatient && paciente && <PatientLinkArrow />}
        </>
      }
      detalle={
        <DetalleConEstado
          contexto={`solicitada ${fromNow(s.created_at)}`}
          estado={estado.label}
          tono={estado.tono}
        />
      }
    />
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
export function TrackResumenView({ module, submodule, onNavigate, setHeader }: ViewProps) {
  const accent = module.accent
  const protocols = useProtocols()
  const patients = usePatients()
  const upcoming = useUpcomingVisits()
  const alerts = useActiveAlerts()
  const solicitudes = useSolicitudesPendientes()
  const reportes = useReportesPendientes()
  const tareas = useMyTasks()

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
  const { profile, hasMinRole, modules } = useAuth()
  const userId = profile?.id ?? null
  /* Mover un reporte desde la tarjeta: el mismo criterio que el tablero y la pantalla de Reportes.
     Quien sólo mira, despliega y lee, sin botones. La que manda es la RPC. */
  const puedeMoverReportes = modules.includes('gerencia') || hasMinRole('track', 'operator')
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

  /* El alternador va EN EL RENGLÓN DEL TÍTULO, a la derecha — el slot `content` del shell, el mismo
     que usan la fecha de Visitas del día y la cola del médico. Antes ocupaba un renglón propio arriba
     de los KPIs, sin nada al lado: un escalón vacío que empujaba todo el mosaico hacia abajo.

     `setHeader` guarda un ELEMENTO YA CONSTRUIDO en el estado del shell, que queda congelado hasta que
     este efecto vuelva a correr: por eso `ambito` está en las deps — sin él el switch se quedaría
     dibujado en la posición vieja. Para quien no coordina nada, el encabezado queda el genérico. */
  useEffect(() => {
    setHeader?.(esCoordinador
      ? { content: <SoloLoMio activo={ambito === 'mio'} onCambiar={(mio) => setAmbito(mio ? 'mio' : 'todo')} color={module.accentSolid} /> }
      : null)
    return () => setHeader?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCoordinador, ambito, module.accentSolid, setHeader])

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
  /* Próximas visitas usa `esDeMisProtocolos` a secas: son futuras, así que ninguna tiene
     coordinador todavía y no hay nada más fino que preguntar. */
  const upcomingRows = filtrarPorAmbito(ambitoEfectivo, upcoming.data ?? [], (v) =>
    esDeMisProtocolos(v, misProtocolos))
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
  /* Reportes usa `esReporteMio` y NO `loAtendiYo`, desde el 2026-09-22: un reporte pendiente es
     trabajo DEL ESTUDIO y lo ve cualquiera que lo tenga asignado, no sólo quien atendió la visita —
     el informe llega de la plataforma días después y lo levanta el que está. Para quien sólo coordina
     estudios la RLS ya devuelve nada más que los suyos, así que esta tarjeta muestra lo mismo en los
     dos ámbitos; la diferencia queda para gerencia. Ver `esReporteMio` en `ambito.ts`. */
  const reporteRows = filtrarPorAmbito(ambitoEfectivo, reportes.data ?? [], (r) =>
    esReporteMio(r, userId, misProtocolos))
  /* Tareas: "Lo mío" = las que tengo que hacer yo; "Todo" suma las que creé y le encargué a otro
     —que es justo lo que la RLS de la 0108 devuelve—. Ver `esTareaMia`. */
  const tareaRows = filtrarPorAmbito(ambitoEfectivo, tareas.data ?? [], (t) => esTareaMia(t, userId))

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
  /* Mismo criterio que Inicio: personas con alguna participación abierta (0127). */
  const activePatients = allPatients.filter(personaActiva).length
  /* EL KPI «VENCIDOS» CUENTA LO MISMO QUE LA TARJETA PENDIENTES Y LLEVA AHÍ (critique 2026-10-08,
     decisión del Director). Antes se llamaba «Reportes vencidos», contaba sólo `item_vencido` y
     llevaba a Pendientes: el número no coincidía con el de su destino, el mismo reporte aparecía con
     cuatro nombres en la pantalla, y la ventana vencida —lo más grave— no figuraba en ningún número.
     Ahora el número grande, la cabecera de la tarjeta y la pantalla de destino cuentan lo mismo
     (`alertRows`, ya filtrado por ámbito), y el subtítulo nombra lo más grave que haya adentro. */
  const vencidos = alertRows.length
  const peorVencido = severidadMaxima(alertRows)
  const ventanasVencidas = alertRows.filter((a) => a.computed_status === 'ventana_vencida').length
  const subVencidos = ventanasVencidas > 0
    ? `${ventanasVencidas} con ventana vencida`
    : vencidos > 0 ? 'para resolver' : 'todo al día'

  /* EL PRÓXIMO DÍA CON VISITAS, y no "mañana" a secas.
     El pedido fue "las del día siguiente únicamente", y tomado al pie de la letra la tarjeta queda
     vacía TODOS los viernes (mañana es sábado) y en cada feriado — un renglón muerto una vez por
     semana, por diseño. Mostrar el próximo día que efectivamente tiene visitas dice lo mismo, nunca
     miente, y el rótulo aclara cuál es ("Mañana", "Lunes 08/09").

     Se busca sobre `upcomingRows`, que ya viene ordenada por fecha y filtrada por ámbito, así que
     el primer elemento posterior a hoy YA es el próximo día. `> hoy` y no `>= hoy`: las de hoy son
     el trabajo de hoy y viven en Visitas del día; esta tarjeta mira lo que viene.

     El horizonte es el de la consulta (7 días). Si no hay ninguna en esa ventana, la tarjeta lo
     dice — el vacío es honesto y acotado, no un "no hay nada" sobre un rango indefinido.

     La regla vive en `proximoDiaConVisitas`, con test: elegir mal el día no rompe nada, dibuja
     prolijamente la jornada equivocada. */
  const { dia: proximoDia, visitas: visitasDelProximoDia } =
    proximoDiaConVisitas(upcomingRows, todayISO())

  const irAAlertas = () => onNavigate?.('track', 'alertas')
  const nombrePendientes = nombreDeDestino(DESTINO_PENDIENTES)
  const nombreVisitas = nombreDeDestino(KPI_DESTINOS.visitas)
  const nombreTareas = nombreDeDestino(DESTINO_TAREAS)
  const nombreReportes = nombreDeDestino(DESTINO_REPORTES)
  /* Cuántos PACIENTES muestra la pantalla de Reportes: SIN ámbito, porque ella no lo tiene (2A). El pie
     de la tarjeta cuenta lo que hay en el destino, no lo que queda del ámbito. Pacientes distintos y no
     filas: el pie dice «pacientes», y uno con dos visitas pendientes es uno (`totales`). */
  const pacientesEnReportes = useMemo(() => {
    const todas = reportes.data ?? []
    return totales(agruparPorVisita(todas, todas, Date.now())).pacientes
  }, [reportes.data])

  /* CUÁNTAS DE LAS PRÓXIMAS SON TUYAS. Va en el SUBTÍTULO del KPI y no como KPI propio, aunque el
     handoff pida una tarjeta entera para "Visitas asignadas a mí": el campo existe
     (`v_track_visits` proyecta `coordinator_id` desde la 0065) pero en visitas FUTURAS casi nunca
     está poblado — se sella al ATENDER (`start_visit_attention`, 0102) o a mano desde el encabezado
     de la visita, que es opcional y hoy casi no se usa. Un KPI en cero permanente no se lee como
     "no tenés nada": se lee como que la app está rota.

     Y sólo aparece cuando hay alguna: un "0 asignadas a mí" todos los días es ruido con forma de
     dato. El día que el equipo empiece a asignar coordinador por adelantado, esto pide su tarjeta.

     Se cuenta sobre `upcomingRows` —ya filtradas por ámbito— y no sobre el dato crudo: el número
     grande y su subtítulo tienen que contar lo mismo. Y usa `loAtendiYo`, que YA tiene la guarda
     del `userId` nulo y su test; escribir `=== userId` a mano acá reintroduce el bug de declarar
     tuyas todas las visitas sin coordinador durante el render en que la sesión no resolvió. */
  const asignadasAMi = upcomingRows.filter((v) => loAtendiYo(v, userId)).length


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs — los cuatro navegan a su submódulo (D8). El rótulo del chip sale del registry. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <KpiCard kpi="protocolos" onNavigate={onNavigate} label="Protocolos activos" value={activeProtocols} sub={`${allProtocols.length} en total`} dot={accent} cargando={cargandoKpis} />
        <KpiCard kpi="pacientes" onNavigate={onNavigate} label="Pacientes activos" value={activePatients} sub={`${allPatients.length} registrados`} dot={accent} cargando={cargandoKpis} />
        <KpiCard kpi="vencidos" onNavigate={onNavigate} label="Vencidos" value={vencidos} sub={subVencidos} dot={peorVencido ? VISIT_STATES[peorVencido].color : accent} cargando={cargandoKpis} />
        <KpiCard kpi="visitas" onNavigate={onNavigate} label="Próximas visitas" value={upcomingRows.length} sub={asignadasAMi > 0 ? `${asignadasAMi} ${asignadasAMi === 1 ? 'asignada' : 'asignadas'} a mí` : 'próximos 7 días'} dot={accent} cargando={cargandoKpis} />
      </div>

      {/*
        EL MOSAICO — cinco tarjetas, dos columnas (D2 + D13 + la decisión 12 del 2026-09-06).

          ┌──────────────────────────┬──────────────────────────┐
          │ Reportes pendientes      │ Tareas personales        │
          │  (lo que hay que cerrar) │  (lo que anotaste vos)   │
          ├──────────────────────────┼──────────────────────────┤
          │ Pendientes               │ Dispensaciones solicit.  │
          │  (lo que se pasó)        │  (lo que estás esperando)│
          └──────────────────────────┼──────────────────────────┤
                 603 px              │ Próximas visitas         │
                                     │  (quién viene, un día)   │
                                     └──────────────────────────┘
                                                721 px

        EL EJE, REESCRITO al entrar Tareas: a la izquierda **los desvíos del estudio** —reportes que
        cerrar, pendientes que resolver—; a la derecha **lo tuyo y lo que viene**: tus tareas, lo que
        le pediste a Farmacia, quién llega mañana. Antes decía "izquierda = trabajo propio", y con
        las tareas personales a la derecha eso dejaba de ser cierto: un diagrama stale es peor que
        ninguno.

        POR QUÉ TAREAS VA ARRIBA A LA DERECHA Y NO SE MUEVE NADA MÁS. La review había propuesto mudar
        "Próximas visitas" a la izquierda para emparejar las columnas, estimando que las cinco
        tarjetas miden parecido. Medidas en el mock (`docs/mock-resumen-tareas-en-el-mosaico.html`):
        Reportes 271, Pendientes 289, Tareas 280, Próximas visitas 214 y Dispensaciones **171** —esta
        última es chica porque tiene dos filas y ningún pie—. Con esos números la recomendación se da
        vuelta: mudándola el desbalance es de **337 px** y "Próximas visitas" queda ENTERA debajo de
        la línea de flotación en 1536×864; dejándola es de **118 px** y la página mide 111 px menos.
        Si vas a reacomodar esto, medí antes: acá estimar ya falló una vez.

        LA DE ABAJO A LA DERECHA DIO DOS VUELTAS EL MISMO DÍA (2026-09-05) y las dos quedaron
        escritas para que no se relean como indecisión: era "Próximas visitas · 7 días", pasó a "Por
        reprogramar" y volvió a mirar hacia adelante, ahora en UN día. El motivo del segundo giro es
        el que importa: lo atrasado se muda a **Pendientes** como una clase de alerta más, donde
        `computed_status` ya resuelve la prioridad y sale UNA fila por visita — en vez de dos
        tarjetas de esta misma pantalla mostrando la misma visita, que es lo que había.

        Y con eso se arregla lo que la versión de siete días tenía mal: era la única lista que crecía
        sin techo y empujaba a la de Dispensaciones fuera de vista cada semana cargada. Una jornada
        entra en tres filas.

        Que cada tarjeta sea un componente con nombre y esta grilla sean cuatro líneas es lo que hizo
        que sumar la quinta fuera una línea, no un rediseño.

        `align-items: start` para que ninguna columna estire sus tarjetas al alto de la otra: sin
        eso, una tarjeta de dos renglones al lado de una lista larga se dibuja con un vacío enorme.
      */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <ReportesCard
            rows={reporteRows}
            origen={reportes.data}
            loading={reportes.loading || coordinaciones.loading}
            error={reportes.error}
            onReintentar={reportes.refetch}
            onOpenPatient={abrirFicha}
            /* El pie lleva a `Coordinación › Reportes` sin estudio elegido (handoff §6.4). Antes cada
               FILA navegaba al tablero de su protocolo, porque Coordinación no tenía una pantalla de
               reportes; ahora la fila despliega y el pie es el que va a la pantalla. */
            pacientesEnDestino={pacientesEnReportes}
            nombreDestino={nombreReportes}
            onVerTodo={onNavigate && (() => onNavigate(DESTINO_REPORTES.moduleKey, DESTINO_REPORTES.subKey))}
            canOperate={puedeMoverReportes}
            accentSolid={module.accentSolid}
            /* Mover un reporte puede sacar una visita de «item vencido»: el KPI de al lado lo cuenta. */
            onMovido={alerts.refetch}
            /* `ReportesCard` no se considera vacía con un `.length > 0` crudo: usa `esReportePendiente`
               (el procedimiento está realizado y el reporte no llegó a `evolucionado`; ver esa
               función en `estados.ts`, la MISMA que usa la tarjeta puertas adentro). Comparar acá
               contra el dato crudo podía ofrecer "Ver todo" cuando del otro lado sólo había reportes
               cerrados por otra persona — un viaje en falso a "Todos los reportes están cerrados",
               justo lo que este aviso existe para evitar.

               EL TEXTO YA NO DICE "no atendiste": desde que la tarjeta filtra por estudio y no por
               quién atendió (ver `esReporteMio`), "Lo mío" vacío significa que no hay pendientes en
               los estudios que coordinás. Y este aviso casi no se va a ver: sólo le aparece a
               gerencia, la única que tiene algo del otro lado. */
            vacioDelAmbito={avisoDeAmbito('No hay reportes pendientes en tus estudios.',
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
            nombreDestino={nombrePendientes}
            /* El registry manda; si el submódulo no estuviera, el fallback nombra la pantalla por
               lo que hace y no por una copia del rótulo. */
            titulo={nombrePendientes ?? 'Pendientes'}
            vacioDelAmbito={avisoDeAmbito('Ninguna de tus visitas está en alerta.',
              alerts.visitAlerts.length > 0)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <TareasCard
            rows={tareaRows}
            loading={tareas.loading || coordinaciones.loading}
            error={tareas.error}
            onReintentar={tareas.refetch}
            userId={userId}
            accent={accent}
            accentSolid={module.accentSolid}
            onVerTodas={onNavigate ? () => onNavigate(DESTINO_TAREAS.moduleKey, DESTINO_TAREAS.subKey) : undefined}
            nombreDestino={nombreTareas}
            onCambio={tareas.refetch}
            /* Mismo criterio de vacío que usa la tarjeta puertas adentro (`estaHecha`, no un
               `completed_at === null`): comparar contra el dato crudo podía ofrecer "Ver todo"
               cuando del otro lado sólo había tareas ya cerradas — un viaje en falso. */
            vacioDelAmbito={avisoDeAmbito('No tenés tareas asignadas.',
              (tareas.data ?? []).some((t) => !estaHecha(t, t.task_assignees)))}
          />
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
          <ProximasVisitasCard
            dia={proximoDia}
            rows={visitasDelProximoDia}
            loading={upcoming.loading || coordinaciones.loading}
            error={upcoming.error}
            onReintentar={upcoming.refetch}
            onOpenVisit={onNavigate && ((visitId, visitDate) => onNavigate('track', 'visitas', { visitId, visitDate }))}
            onOpenPatient={abrirFicha}
            /* Al MISMO día que muestra la tarjeta, no a "hoy": es lo que vuelve exacta la promesa
               del pie. Sin `proximoDia` no hay a dónde ir y el pie no se dibuja. */
            onVerMas={onNavigate && proximoDia ? () => onNavigate('track', 'visitas', { visitDate: proximoDia }) : undefined}
            nombreDestino={nombreVisitas}
            vacioDelAmbito={avisoDeAmbito('No hay visitas próximas en tus protocolos.',
              (upcoming.data ?? []).length > 0)}
          />
        </div>
      </div>

      {visitaAbierta && (
        <VisitDetail
          visitId={visitaAbierta}
          accent={accent}
          onClose={() => setVisitaAbierta(null)}
          /* Lo que se hace en el modal puede cerrar la solicitud, mover la visita o mover un reporte
             (el panel de reportes vive adentro de la visita), así que las tres tarjetas que dependen
             de eso se refrescan al volver. Las demás no: sus datos no los toca este modal, y
             refetchearlas de más haría parpadear media pantalla al cerrar. Reportes se sumó el
             2026-10-04, con la tarjeta nueva: sin esto quedaba vieja hasta recargar. */
          onChanged={() => { solicitudes.refetch(); upcoming.refetch(); reportes.refetch() }}
          /* El mismo gesto que ya tienen las filas: `abrirFicha` cae solo a `undefined` sin
             `onNavigate`, y ahí el encabezado del modal degrada a texto pelado. */
          onOpenPatient={abrirFicha}
        />
      )}
    </div>
  )
}

/** Alertas vigentes: cabecera teñida por la PEOR presente, filas planas con punto de severidad. */
function AlertasCard({ rows, loading, error, onReintentar, onOpenAlerta, onOpenPatient, onVerTodo, nombreDestino, titulo, vacioDelAmbito }: {
  rows: TrackVisitRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenAlerta?: (visitId: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  onVerTodo?: () => void
  /** Cómo se llama el submódulo destino, leído del registry por la vista. NO es un literal acá
   *  adentro: decía "Alertas" a mano y el día que el submódulo pasó a llamarse Pendientes habría
   *  quedado prometiendo una pantalla con otro nombre, sin un solo error. `null` = el destino no
   *  existe en el registry ⇒ no se dibuja el pie, mismo criterio que `KpiCard`. */
  nombreDestino?: string | null
  /** El rótulo de la banda teñida. Mismo origen que `nombreDestino` — el registry— y por eso en la
   *  práctica son el mismo texto: la tarjeta se llama como la pantalla a la que lleva. */
  titulo: string
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  /* El contador de la cabecera cuenta TODAS, no las visibles: recortar la lista no puede cambiar
     cuántas alertas hay — ése es el número que importa. YA NO es el mismo que muestra la campana:
     `NotificationsMenu` usa `useActiveAlerts` sin filtrar por ámbito, así que con "Lo mío" puesto
     acá cuentan menos alertas que las que la campana anuncia (a propósito — es el punto del
     alternador).

     LAS FILAS SE ORDENAN POR GRAVEDAD ANTES DE CORTAR (critique 2026-10-08). Venían en el orden de la
     consulta —fecha estimada— y la ventana vencida, que es la que tiñe de rojo la cabecera, podía
     quedar tercera o detrás de «Ver más». La regla vive en `ordenarPorGravedad`, con test. */
  const ordenadas = ordenarPorGravedad(rows)
  const visibles = ordenadas.slice(0, MAX_FILAS)
  const restantes = rows.length - visibles.length
  /* La leyenda nombra sólo los estados que se VEN en las filas, en orden de gravedad: explicar un
     punto que no está dibujado es ruido, y antes faltaba «Por reprogramar» aunque apareciera. */
  const estadosVisibles = GRAVEDAD.filter((s) => visibles.some((a) => a.computed_status === s))
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <AlertCardHeader titulo={titulo} severidad={severidadMaxima(rows)} cantidad={rows.length} />
      <CuerpoDeTarjeta
        loading={loading}
        error={error}
        que="las alertas"
        onReintentar={onReintentar}
        vacia={rows.length === 0}
        vacio={<VacioSimple>Sin alertas. Todo al día.</VacioSimple>}
        vacioDelAmbito={vacioDelAmbito}
      >
        <>
          {/* Sin `marginTop` propio: la separación con la banda teñida la pone ahora la cabecera
              (su margen inferior), para que las dos pantallas que la usan respiren igual. */}
          <div>
            {visibles.map((a, i) => {
              const c = VISIT_STATES[a.computed_status].color
              const vName = visitTitle(a)
              /* El motivo empieza con el MISMO nombre del estado que usan la leyenda, el chip y la
                 pantalla Pendientes (`VISIT_STATES`). Antes cada tarjeta lo contaba con palabras
                 propias —«Reporte de procedimiento fuera de plazo» al lado de una leyenda que decía
                 «Pendiente vencido»— y, peor, «Por reprogramar» caía en esa misma rama y se rotulaba
                 como un reporte fuera de plazo, que es falso. La ventana vencida suma su fecha porque
                 es lo que la define. */
              const motivo = a.computed_status === 'ventana_vencida'
                ? `${VISIT_STATES.ventana_vencida.label} el ${a.window_end ? formatAR(a.window_end) : '—'} · ${vName}`
                : `${VISIT_STATES[a.computed_status].label} · ${vName}`
              const abrir = onOpenAlerta ? () => onOpenAlerta(a.id) : undefined
              return (
                <FilaDeResumen
                  key={a.id}
                  primera={i === 0}
                  onAbrir={abrir}
                  ariaLabel={`Abrir en ${titulo} la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                  punto={<Punto color={c} />}
                  titular={
                    <>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
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
                    </>
                  }
                  detalle={motivo}
                />
              )
            })}
          </div>
          {/* La leyenda explica los PUNTOS, que es lo que ahora lleva la severidad. Los rótulos
              salen de VISIT_STATES para que no se separen de los chips del resto de la app el día
              que alguno se renombre. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, fontSize: 11.5, color: 'var(--spira-muted)' }}>
            {/* La leyenda explica cada estado al apuntarlo, y lleva la marca del glosario: aparece
                una sola vez en la tarjeta, así que enseña el gesto sin salpicar las filas. */}
            {estadosVisibles.map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: VISIT_STATES[s].color }} />
                <abbr className="spira-termino" title={GLOSARIO_ESTADOS[s]}>{VISIT_STATES[s].label}</abbr>
              </span>
            ))}
          </div>
        </>
      </CuerpoDeTarjeta>
      {/* Gateado por `rows.length > 0`: con la tarjeta vacía, "Ver todo" (cambia
          el ámbito, del `vacioDelAmbito` de arriba) y el pie que navega a otra pantalla
          son dos affordances que navegan a lugares distintos — con las dos presentes a la vez, cuál
          hace qué deja de ser obvio. */}
      {onVerTodo && nombreDestino && rows.length > 0 && (
        <VerMas nombre={nombreDestino} restantes={restantes} onClick={onVerTodo} />
      )}
    </div>
  )
}

/**
 * Quién viene el PRÓXIMO DÍA con visitas. Una sola jornada, no siete.
 *
 * Tercera forma de esta tarjeta y conviene saber por qué, porque las tres fueron deliberadas:
 * empezó como "Próximas visitas · 7 días" agrupadas por día, el 2026-09-05 pasó a "Por reprogramar"
 * (lo atrasado) y ese mismo día volvió a mirar hacia adelante, pero **en corto**. El motivo del
 * último giro: lo atrasado se muda a **Pendientes** como una clase de alerta más —donde
 * `computed_status` ya resuelve la prioridad y sale UNA fila por visita en vez de dos tarjetas
 * mostrando la misma—, y acá vuelve a hacer falta la pregunta que ninguna otra tarjeta contesta:
 * quién viene.
 *
 * UN DÍA Y NO SIETE porque el Resumen resume: siete días agrupados era la única lista que crecía
 * sin techo, y empujaba a la de Dispensaciones fuera de vista cada semana cargada. Con una jornada
 * entran las tres filas de siempre y el pie manda al resto.
 *
 * EL DÍA LO ELIGE LA VISTA (`proximoDia`), no esta tarjeta: acá sólo se muestra el que le den. Y no
 * es "mañana" a secas — ver el comentario de la vista: mañana un viernes es sábado, y la tarjeta
 * quedaría vacía una vez por semana por diseño.
 *
 * EL PIE NAVEGA, y por primera vez la promesa es exacta: va a Visitas del día CON ESE DÍA puesto,
 * así que la pantalla de destino muestra literalmente la lista que se estaba mirando. Las dos
 * versiones anteriores no podían decir eso — una prometía siete días que ninguna pantalla junta, la
 * otra atrasadas repartidas en semanas.
 */
function ProximasVisitasCard({ dia, rows, loading, error, onReintentar, onOpenVisit, onOpenPatient, onVerMas, nombreDestino, vacioDelAmbito }: {
  /** El día que se muestra, o `null` si no hay ninguno en el horizonte de la consulta. */
  dia: string | null
  /** Las visitas de ESE día, ya filtradas por la vista. */
  rows: TrackVisitRow[]
  loading: boolean
  error: string | null
  onReintentar: () => void
  onOpenVisit?: (visitId: string, visitDate?: string) => void
  onOpenPatient?: (patientId: string, protocolId: string) => void
  onVerMas?: () => void
  /** Cómo se llama el submódulo destino, leído del registry por la vista (ver `AlertasCard`). */
  nombreDestino?: string | null
  /** Qué mostrar EN LUGAR del vacío propio. La tarjeta no sabe qué es un ámbito ni quién sos: sólo
   *  muestra lo que le den. Así el que decide es el único que tiene el dato para decidirlo —la
   *  vista— y no hay que pasarle a cuatro componentes un ámbito, un usuario y un setter. */
  vacioDelAmbito?: ReactNode
}) {
  const visibles = rows.slice(0, MAX_FILAS)
  const restantes = rows.length - visibles.length
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
      <CabeceraDeTarjeta
        icon="calendar"
        titulo="Próximas visitas"
        /* QUÉ día, no "agrupadas por día": con una sola jornada en pantalla, el dato al margen que
           sirve es cuál es. `dayLabel` dice "Mañana" cuando corresponde y el nombre del día
           cuando no — que es justo la diferencia que hay que ver de un vistazo un viernes. */
        extra={dia ? (
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>{dayLabel(dia)}</span>
        ) : undefined}
      />
      <CuerpoDeTarjeta
        loading={loading}
        error={error}
        que="las próximas visitas"
        onReintentar={onReintentar}
        vacia={rows.length === 0}
        vacio={<VacioSimple>Sin visitas en los próximos 7 días.</VacioSimple>}
        vacioDelAmbito={vacioDelAmbito}
      >
        <div style={{ marginTop: 8 }}>
          {visibles.map((v, i) => (
            <VisitSummaryRow
              key={v.id}
              visit={v}
              primera={i === 0}
              /* Eje CLÍNICO, no operativo: estas visitas todavía no ocurrieron, así que "por
                 llegar" no querría decir nada. Sin la tira de indicadores por lo mismo: lo que la
                 visita lleva se mira cuando se la va a atender, no acá.

                 Y EL CHIP SÓLO CUANDO LA VISITA SE SALIÓ DE LO ESPERADO. `proxima` rotula
                 "Pendiente", que es el estado por defecto de toda visita futura: en una tarjeta que
                 muestra justamente las visitas que vienen, decía lo mismo en las tres filas, todos
                 los días. Un dato que nunca varía no informa — ocupa el margen derecho y le enseña
                 al ojo a ignorar esa columna, que es donde después aparece la ventana vencida. */
              chip={v.computed_status === 'proxima' ? null : <VisitChip status={v.computed_status} compact />}
              onClick={() => onOpenVisit?.(v.id, v.estimated_date ?? undefined)}
              ariaLabel={`Abrir la visita de ${v.patient_name} — ${visitTitle(v)}`}
              onOpenPatient={onOpenPatient && (() => onOpenPatient(v.patient_id, v.protocol_id))}
            />
          ))}
        </div>
      </CuerpoDeTarjeta>
      {onVerMas && nombreDestino && rows.length > 0 && (
        <VerMas nombre={nombreDestino} restantes={restantes} onClick={onVerMas} />
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
      <CabeceraDeTarjeta
        icon="box"
        titulo="Dispensaciones solicitadas"
        extra={
          rows.length > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
              {rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}
            </span>
          ) : undefined
        }
      />
      <CuerpoDeTarjeta
        loading={loading}
        error={error}
        que="las dispensaciones solicitadas"
        onReintentar={onReintentar}
        vacia={rows.length === 0}
        vacio={<VacioSimple>Sin dispensaciones pendientes.</VacioSimple>}
        vacioDelAmbito={vacioDelAmbito}
      >
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
      </CuerpoDeTarjeta>
      {/* El pie DESPLIEGA acá mismo y no navega (D11 + D15): Farmacia › Dispensaciones exige un
          módulo que quien coordina puede no tener, así que mandar ahí le dejaría un pie muerto a
          media plantilla. El destino por fila ya es la visita, que sí está garantizado. */}
      {(restantes > 0 || expandido) && (
        <VerMasLocal restantes={restantes} expandido={expandido} onToggle={() => setExpandido((v) => !v)} />
      )}
    </div>
  )
}
