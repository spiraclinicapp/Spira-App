import { Fragment, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { Icon } from '../../../components/Icon'
import { FilterDropdown } from '../../../components/FilterDropdown'
import { ClearFilters, FilterSearch } from '../../../components/FilterBar'
import { Modal } from '../../../components/Modal'
import { formatAR, formatDayMonth, formatTimeAR, minutesBetween } from '../../../lib/dates'
import { formatNumberAR, formatShareAR, sharePct } from '../../../lib/numbers'
import type { VisitaEquipo } from '../../../data/trackReports'
import { formatMinutosLargo } from './agregados'
import {
  contarFiltros, FILTROS_VACIOS, filtrarDetalle, opcionesDetalle, resumenDetalle, SIN_ASIGNAR, tonoDesvio,
} from './agregadosEquipo'
import type {
  FilaCarga, FilaDetalle, FilaTiempos, FiltrosDetalle, OrdenDetalle, RangoEspera, ResultadoCarga,
  ResultadoProyeccion, ResultadoTiempos, TonoDesvio,
} from './agregadosEquipo'
import { TIPO_VISITA_LABELS } from './tipoVisita'
import {
  barFill, barTrack, chevron, chevronAbierto, dash, detalleInner, filaDetalle, filaExpandible,
  subLine, tabla, tablaWrap, td, tdNum, tfootTd, th,
} from './estilos'

/*
 * La zona de equipo de Coordinación › Estadísticas: los números por PERSONA (handoff
 * `design_handoff_coordinacion_estadisticas`). Toda la pantalla es de jefatura, así que no lleva
 * banda ni solapa aparte (las variantes A/B/C del mock sólo cambiaban cómo separarla del resto).
 *
 * Tres desvíos del mock, a propósito:
 *  · Filtros con los desplegables de la app (`FilterDropdown`), no `<select>` nativos: son los de
 *    Visitas y Pendientes, y el handoff mismo pide usar el combo del codebase.
 *  · Tooltips nativos (`title`), no el globo propio del prototipo.
 *  · La proyección sin línea de capacidad: ese dato no existe (Director, 2026-09-23).
 */

const unDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function nombreDeCoordinadora(v: VisitaEquipo): string {
  return v.coordinator_id ? (v.coordinator_name?.trim() || 'Sin nombre') : 'Sin asignar'
}

function visitaTitulo(v: VisitaEquipo): string {
  return v.visit_name ?? 'Visita suelta'
}

/* ───────────────────────────── piezas comunes ───────────────────────────── */

function Chevron({ abierta }: { abierta: boolean }) {
  return (
    <span style={{ ...chevron, ...(abierta ? chevronAbierto : null) }}>
      <Icon name="chevronRight" size={14} stroke={2} />
    </span>
  )
}

function Barra({ pct, color, ancho = 70 }: { pct: number; color: string; ancho?: number | string }) {
  return (
    <span style={{ ...barTrack, width: ancho, display: 'inline-block' }}>
      <span style={{ ...barFill(pct, color), display: 'block' }} />
    </span>
  )
}

const tonoPill: Record<TonoDesvio, string> = {
  ok: 'var(--spira-acc-deep-good)',
  medio: 'var(--spira-acc-deep-warn)',
  alto: 'var(--spira-acc-deep-danger)',
}

/** El desvío en una pastilla: texto en el tono PROFUNDO sobre superficie clara — AA en los dos temas
 *  (un tinte + su tono a secas queda debajo de 4,5:1, ya pasó con los chips). */
function PillDesvio({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={dash}>—</span>
  const signo = pct > 0 ? '+' : pct < 0 ? '−' : '±'
  return (
    <span
      style={{
        display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums', background: 'var(--spira-surface)',
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)', color: tonoPill[tonoDesvio(pct)],
      }}
      title="Atención promedio de esta persona contra el promedio de todo el equipo en el período"
    >
      {signo}{Math.abs(pct)} %
    </span>
  )
}

const botonTexto: CSSProperties = {
  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
  borderRadius: 9, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 12.5, color: 'var(--spira-ink)',
}

const miniThStyle: CSSProperties = { ...th, position: 'sticky', top: 0, background: 'var(--spira-white)', padding: '8px 12px 7px' }
const miniTd: CSSProperties = { padding: '7px 12px', borderBottom: '1px solid var(--spira-line)', fontSize: 12.5 }

/** Las visitas de una persona, en chico: lo que se abre adentro de las tablas de equipo. */
function MiniVisitas({ visitas, onAbrir }: { visitas: VisitaEquipo[]; onAbrir: (v: VisitaEquipo) => void }) {
  if (visitas.length === 0) return null
  return (
    <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--spira-line)', borderRadius: 10, background: 'var(--spira-white)' }}>
      <table style={{ ...tabla, fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={miniThStyle}>Fecha</th>
            <th style={miniThStyle}>Paciente</th>
            <th style={miniThStyle}>Estudio · visita</th>
            <th style={{ ...miniThStyle, textAlign: 'center' }}>Espera</th>
            <th style={{ ...miniThStyle, textAlign: 'center' }}>Atención</th>
            <th style={{ ...miniThStyle, textAlign: 'center' }}>Estadía</th>
          </tr>
        </thead>
        <tbody>
          {visitas.map((v) => (
            <tr key={v.id} className="spira-row-link spira-no-press" style={{ cursor: 'pointer' }} onClick={() => onAbrir(v)} title="Ver los sellos de esta visita">
              <td style={{ ...miniTd, fontVariantNumeric: 'tabular-nums' }}>{v.real_date ? formatAR(v.real_date) : '—'}</td>
              <td style={miniTd}>{v.patient_name}</td>
              <td style={miniTd}>{v.protocol_code} · {visitaTitulo(v)}</td>
              <td style={{ ...miniTd, textAlign: 'center' }}>{duracion(v.arrived_at, v.attended_at)}</td>
              <td style={{ ...miniTd, textAlign: 'center' }}>{duracion(v.attended_at, v.ready_at)}</td>
              <td style={{ ...miniTd, textAlign: 'center' }}>{duracion(v.arrived_at, v.left_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function duracion(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return '—'
  return formatMinutosLargo(minutesBetween(desde, hasta))
}

/* ───────────────────────────── Carga de trabajo mensual ───────────────────────────── */

/** Una barra por día del mes. El pico va lleno; los días sin visitas, una rayita. */
function MiniDias({ fila, dias, accentSolid }: { fila: FilaCarga; dias: string[]; accentSolid: string }) {
  const max = Math.max(1, ...fila.serie)
  const prom = fila.porDia
  const marcas = [0, 6, 13, dias.length - 1].filter((i, k, a) => i < dias.length && a.indexOf(i) === k)
  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 3, height: 58, borderBottom: '1px solid var(--spira-line-2)' }}>
        {fila.serie.map((n, i) => {
          const pico = fila.pico?.fecha === dias[i]
          return (
            <span
              key={dias[i]}
              title={`${formatDayMonth(dias[i])} · ${n === 1 ? '1 visita' : `${n} visitas`}`}
              style={{
                flex: 1, borderRadius: '3px 3px 0 0',
                height: n === 0 ? '4%' : `${Math.max(8, (n / max) * 100)}%`,
                background: n === 0 ? 'var(--spira-line)' : accentSolid,
                opacity: n === 0 || pico ? 1 : 0.62,
              }}
            />
          )
        })}
        {prom != null && (
          <span
            aria-hidden
            style={{
              position: 'absolute', left: 0, right: 0, top: (1 - prom / max) * 58,
              borderTop: `1px dashed ${accentSolid}`, opacity: 0.5, pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <div style={{ position: 'relative', height: 16, marginTop: 4, fontSize: 10.5, color: 'var(--spira-ink-soft)' }}>
        {marcas.map((i) => (
          <span key={i} style={{ position: 'absolute', left: `${(i / Math.max(1, dias.length - 1)) * 100}%`, transform: i === 0 ? 'none' : i === dias.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
            {formatDayMonth(dias[i])}
          </span>
        ))}
      </div>
    </div>
  )
}

export function TablaCarga({
  carga, accentSolid, onVerEnDetalle, onAbrir,
}: {
  carga: ResultadoCarga
  accentSolid: string
  onVerEnDetalle: (clave: string) => void
  onAbrir: (v: VisitaEquipo) => void
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setAbiertas((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }} />
            <th style={th}>Coordinadora</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas del mes</th>
            <th style={{ ...th, textAlign: 'center' }}>Días con visitas</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas por día</th>
            <th style={{ ...th, textAlign: 'center' }}>Día pico</th>
            <th style={{ ...th, textAlign: 'center' }}>Pendientes abiertos</th>
            <th style={{ ...th, textAlign: 'right', width: 160 }}>Carga relativa</th>
          </tr>
        </thead>
        <tbody>
          {carga.filas.map((f) => {
            const abierta = abiertas.has(f.clave)
            const sinVisitas = f.serie.filter((n) => n === 0).length
            return (
              <Fragment key={f.clave}>
                <tr style={filaExpandible} onClick={() => toggle(f.clave)} aria-expanded={abierta}>
                  <td style={td}><Chevron abierta={abierta} /></td>
                  <td style={{ ...td, fontWeight: 600, color: f.clave === SIN_ASIGNAR ? 'var(--spira-ink-soft)' : undefined }}>{f.nombre}</td>
                  <td style={tdNum}>{formatNumberAR(f.visitas)}</td>
                  <td style={tdNum}>{formatNumberAR(f.diasConVisitas)}</td>
                  <td style={tdNum}>{f.porDia == null ? <span style={dash}>—</span> : unDecimal.format(f.porDia)}</td>
                  <td style={tdNum}>{f.pico ? `${f.pico.visitas} (${formatDayMonth(f.pico.fecha)})` : <span style={dash}>—</span>}</td>
                  <td style={tdNum}>{f.pendientes > 0 ? formatNumberAR(f.pendientes) : <span style={dash}>—</span>}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{formatShareAR(f.visitas, carga.totalVisitas)}</span>
                      <Barra pct={sharePct(f.visitas, carga.totalVisitas)} color={accentSolid} />
                    </span>
                  </td>
                </tr>
                {abierta && (
                  <tr style={filaDetalle}>
                    <td colSpan={8}>
                      <div style={detalleInner}>
                        {f.visitas > 0 && <MiniDias fila={f} dias={carga.dias} accentSolid={accentSolid} />}
                        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
                          {f.visitas === 0
                            ? 'No atendió visitas en el mes. Las pendientes que se le cuentan son visitas que tiene asignadas.'
                            : `Pico el ${formatDayMonth(f.pico!.fecha)} con ${f.pico!.visitas === 1 ? '1 visita' : `${f.pico!.visitas} visitas`} · ${f.diasConVisitas} de ${carga.dias.length} días con visitas · ${sinVisitas} sin visitas. La línea punteada es su promedio por día con visitas.`}
                        </div>
                        <MiniVisitas visitas={f.atendidas} onAbrir={onAbrir} />
                        {f.visitas > 0 && (
                          <button type="button" className="spira-card-link" style={botonTexto} onClick={() => onVerEnDetalle(f.clave)}>
                            <Icon name="list" size={14} /> Ver sus visitas del período en el detalle
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={tfootTd} />
            <td style={tfootTd}>{carga.coordinadoras === 1 ? '1 coordinadora' : `${carga.coordinadoras} coordinadoras`}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(carga.totalVisitas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(carga.totalDias)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{carga.porDia == null ? '—' : unDecimal.format(carga.porDia)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{carga.pico ? `${carga.pico.visitas} (${formatDayMonth(carga.pico.fecha)})` : '—'}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(carga.totalPendientes)}</td>
            <td style={{ ...tfootTd, textAlign: 'right' }}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ───────────────────────────── Tiempos por coordinadora ───────────────────────────── */

export function TablaTiempos({
  tiempos, accentSolid, onVerEnDetalle, onAbrir,
}: {
  tiempos: ResultadoTiempos
  accentSolid: string
  onVerEnDetalle: (clave: string) => void
  onAbrir: (v: VisitaEquipo) => void
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setAbiertas((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const personas = tiempos.filas.filter((f) => f.clave !== SIN_ASIGNAR).length

  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }} />
            <th style={th}>Coordinadora</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas atendidas</th>
            <th style={{ ...th, textAlign: 'center' }}>Espera</th>
            <th style={{ ...th, textAlign: 'center' }}>Atención</th>
            <th style={{ ...th, textAlign: 'center' }}>Estadía total</th>
            <th style={{ ...th, textAlign: 'right', width: 170 }}>Atención vs. promedio</th>
          </tr>
        </thead>
        <tbody>
          {tiempos.filas.map((f) => (
            <FilaTiemposRow key={f.clave} f={f} abierta={abiertas.has(f.clave)} onToggle={() => toggle(f.clave)} accentSolid={accentSolid} onVerEnDetalle={onVerEnDetalle} onAbrir={onAbrir} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={tfootTd} />
            <td style={tfootTd}>{personas === 1 ? '1 coordinadora' : `${personas} coordinadoras`}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(tiempos.visitas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(tiempos.esperaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(tiempos.atencionProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(tiempos.estadiaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'right' }}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function FilaTiemposRow({
  f, abierta, onToggle, accentSolid, onVerEnDetalle, onAbrir,
}: {
  f: FilaTiempos
  abierta: boolean
  onToggle: () => void
  accentSolid: string
  onVerEnDetalle: (clave: string) => void
  onAbrir: (v: VisitaEquipo) => void
}) {
  const maxTipo = Math.max(1, ...f.porTipo.map((t) => t.atencionProm ?? 0))
  return (
    <>
      <tr style={filaExpandible} onClick={onToggle} aria-expanded={abierta}>
        <td style={td}><Chevron abierta={abierta} /></td>
        <td style={{ ...td, fontWeight: 600, color: f.clave === SIN_ASIGNAR ? 'var(--spira-ink-soft)' : undefined }}>{f.nombre}</td>
        <td style={tdNum}>{formatNumberAR(f.visitas)}</td>
        <td style={tdNum}>{formatMinutosLargo(f.esperaProm)}</td>
        <td style={{ ...tdNum, fontWeight: 600 }}>{formatMinutosLargo(f.atencionProm)}</td>
        <td style={tdNum}>{formatMinutosLargo(f.estadiaProm)}</td>
        <td style={{ ...td, textAlign: 'right' }}><PillDesvio pct={f.desvioPct} /></td>
      </tr>
      {abierta && (
        <tr style={filaDetalle}>
          <td colSpan={7}>
            <div style={detalleInner}>
              <div style={{ fontWeight: 600, color: 'var(--spira-ink)', fontSize: 12.5 }}>Atención promedio por tipo de visita · minutos y cantidad de visitas</div>
              {f.porTipo.map((t) => (
                <div key={t.tipo} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                  <span style={subLine}>{t.label}</span>
                  <Barra pct={sharePct(t.atencionProm ?? 0, maxTipo)} color={accentSolid} ancho={120} />
                  <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {formatMinutosLargo(t.atencionProm)} <span style={{ color: 'var(--spira-ink-soft)' }}>· {t.visitas}</span>
                  </span>
                </div>
              ))}
              {f.coberturaAtencion < f.visitas && (
                <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
                  La atención sale de {formatNumberAR(f.coberturaAtencion)} de {formatNumberAR(f.visitas)} visitas: el resto no tiene marcado el inicio y el fin de atención.
                </div>
              )}
              <MiniVisitas visitas={f.atendidas} onAbrir={onAbrir} />
              <button type="button" className="spira-card-link" style={botonTexto} onClick={() => onVerEnDetalle(f.clave)}>
                <Icon name="list" size={14} /> Ver estas {f.visitas} visitas en el detalle completo
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/* ───────────────────────────── Detalle visita por visita ───────────────────────────── */

const ESPERA_OPCIONES: { value: RangoEspera; label: string }[] = [
  { value: '', label: 'Cualquier espera' },
  { value: 'a', label: 'Hasta 20 min' },
  { value: 'b', label: '21 a 30 min' },
  { value: 'c', label: 'Más de 30 min' },
]

const ORDEN_OPCIONES: { value: OrdenDetalle; label: string }[] = [
  { value: 'fecha', label: 'Más recientes' },
  { value: 'esp', label: 'Mayor espera' },
  { value: 'aten', label: 'Mayor atención' },
  { value: 'est', label: 'Mayor estadía' },
  { value: 'pac', label: 'Paciente (A–Z)' },
]

const tdDenso: CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--spira-line)', fontSize: 12.5, verticalAlign: 'top' }
const thDenso: CSSProperties = { ...th, padding: '10px 12px 8px' }

/** Un sello: la hora y quién la marcó. Es el punto del bloque — auditar quién registró cada cosa. */
function Sello({ ts, quien }: { ts: string | null; quien: string | null }) {
  if (!ts) return <span style={dash}>—</span>
  return (
    <div>
      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatTimeAR(ts)}</div>
      <div style={{ fontSize: 11, color: 'var(--spira-ink-soft)' }}>{quien ?? 'sin registro'}</div>
    </div>
  )
}

function Chip({ children, onQuitar }: { children: ReactNode; onQuitar: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px 2px 9px', borderRadius: 999, background: 'var(--spira-white)', border: '1px solid var(--spira-line-2)', fontSize: 12 }}>
      {children}
      <button type="button" onClick={onQuitar} aria-label="Quitar este filtro" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}>
        <Icon name="x" size={11} color="var(--spira-muted)" />
      </button>
    </span>
  )
}

export function DetalleVisitas({
  filas, filtros, setFiltros, accentSolid, onAbrir, anclaRef,
}: {
  filas: FilaDetalle[]
  filtros: FiltrosDetalle
  setFiltros: (f: FiltrosDetalle) => void
  accentSolid: string
  onAbrir: (v: VisitaEquipo) => void
  anclaRef: Ref<HTMLDivElement>
}) {
  const opciones = opcionesDetalle(filas)
  const visibles = filtrarDetalle(filas, filtros)
  const resumen = resumenDetalle(visibles)
  const n = contarFiltros(filtros)
  const poner = (over: Partial<FiltrosDetalle>) => setFiltros({ ...filtros, ...over })
  const nombreCoord = opciones.coordinadoras.find((c) => c.value === filtros.coord)?.label

  const chips: { key: string; texto: string; quitar: () => void }[] = []
  if (filtros.q.trim()) chips.push({ key: 'q', texto: `Búsqueda: ${filtros.q.trim()}`, quitar: () => poner({ q: '' }) })
  if (filtros.coord) chips.push({ key: 'coord', texto: `Coordinadora: ${nombreCoord ?? '—'}`, quitar: () => poner({ coord: '' }) })
  if (filtros.est) chips.push({ key: 'est', texto: `Estudio: ${filtros.est}`, quitar: () => poner({ est: '' }) })
  if (filtros.tipo) chips.push({ key: 'tipo', texto: `Tipo: ${TIPO_VISITA_LABELS[filtros.tipo]}`, quitar: () => poner({ tipo: '' }) })
  if (filtros.esp) chips.push({ key: 'esp', texto: `Espera: ${ESPERA_OPCIONES.find((o) => o.value === filtros.esp)?.label}`, quitar: () => poner({ esp: '' }) })
  if (filtros.fecha) chips.push({ key: 'fecha', texto: `Día: ${formatAR(filtros.fecha)}`, quitar: () => poner({ fecha: '' }) })

  // Separadores de día: sólo con "Más recientes", que es el único orden donde un día queda junto.
  const conDias = filtros.orden === 'fecha'
  const cuentaPorDia = new Map<string, number>()
  if (conDias) for (const x of visibles) cuentaPorDia.set(x.v.real_date ?? '', (cuentaPorDia.get(x.v.real_date ?? '') ?? 0) + 1)

  return (
    <>
      <div ref={anclaRef} style={{ scrollMarginTop: 16, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '11px 14px' }}>
          <FilterDropdown accent={accentSolid} value={filtros.coord} onChange={(v) => poner({ coord: v })} menuLabel="Coordinadora" neutralLabel="Coordinadora" icon="users" deselectable
            options={[{ value: '', label: 'Todas las coordinadoras' }, ...opciones.coordinadoras]} />
          <FilterDropdown accent={accentSolid} value={filtros.est} onChange={(v) => poner({ est: v })} menuLabel="Estudio" neutralLabel="Estudio" icon="file" deselectable
            options={[{ value: '', label: 'Todos los estudios' }, ...opciones.estudios.map((e) => ({ value: e.value, label: `${e.value} · ${e.nombre}` }))]} />
          <FilterDropdown accent={accentSolid} value={filtros.tipo} onChange={(v) => poner({ tipo: v as FiltrosDetalle['tipo'] })} menuLabel="Tipo de visita" neutralLabel="Tipo" icon="activity" deselectable
            options={[{ value: '', label: 'Todos los tipos' }, ...opciones.tipos]} />
          <FilterDropdown accent={accentSolid} value={filtros.esp} onChange={(v) => poner({ esp: v as RangoEspera })} menuLabel="Espera" neutralLabel="Espera" icon="clock" deselectable
            options={ESPERA_OPCIONES} />
          <FilterDropdown accent={accentSolid} value={filtros.fecha} onChange={(v) => poner({ fecha: v })} menuLabel="Día" neutralLabel="Día" icon="calendar" deselectable
            options={[{ value: '', label: 'Todos los días' }, ...opciones.fechas.map((d) => ({ value: d, label: formatAR(d) }))]} />
          <FilterDropdown accent={accentSolid} value={filtros.orden} onChange={(v) => poner({ orden: v as OrdenDetalle })} menuLabel="Ordenar" prefix="Ordenar" icon="sliders" deselectable
            options={ORDEN_OPCIONES} />
          <FilterSearch value={filtros.q} onChange={(q) => poner({ q })} placeholder="Paciente, código o visita" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--spira-surface)', borderTop: '1px solid var(--spira-line)', borderRadius: '0 0 16px 16px', fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
          <span><b style={{ color: 'var(--spira-ink)' }}>{formatNumberAR(visibles.length)}</b> de {formatNumberAR(filas.length)} visitas</span>
          {chips.length === 0 ? <span>· sin filtros</span> : chips.map((c) => <Chip key={c.key} onQuitar={c.quitar}>{c.texto}</Chip>)}
          {n > 0 && <span style={{ marginLeft: 'auto' }}><ClearFilters n={n} onClear={() => setFiltros({ ...FILTROS_VACIOS, orden: filtros.orden })} /></span>}
        </div>
      </div>

      <div style={tablaWrap}>
        <table style={{ ...tabla, fontSize: 12.5, minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={thDenso}>Paciente</th>
              <th style={thDenso}>Estudio · visita</th>
              <th style={thDenso}>Tipo</th>
              <th style={thDenso}>Llegada</th>
              <th style={thDenso}>Inicia atención</th>
              <th style={thDenso}>Fin de atención</th>
              <th style={thDenso}>Salida</th>
              <th style={{ ...thDenso, textAlign: 'center' }}>Espera</th>
              <th style={{ ...thDenso, textAlign: 'center' }}>Atención</th>
              <th style={{ ...thDenso, textAlign: 'center' }}>Estadía</th>
              <th style={{ ...thDenso, width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={11} style={{ ...tdDenso, textAlign: 'center', padding: '26px 12px', color: 'var(--spira-ink-soft)' }}>
                  Ninguna visita cumple con estos filtros.{' '}
                  {n > 0 && <ClearFilters n={n} onClear={() => setFiltros({ ...FILTROS_VACIOS, orden: filtros.orden })} />}
                </td>
              </tr>
            )}
            {visibles.map((x, i) => {
              const v = x.v
              const nuevoDia = conDias && (i === 0 || visibles[i - 1].v.real_date !== v.real_date)
              const cuantas = cuentaPorDia.get(v.real_date ?? '') ?? 0
              return (
                <Fragment key={v.id}>
                  {nuevoDia && (
                    <tr>
                      <td colSpan={11} style={{ ...tdDenso, background: 'var(--spira-surface)', color: 'var(--spira-ink-soft)', padding: '7px 12px' }}>
                        <b style={{ color: 'var(--spira-ink)' }}>{v.real_date ? formatAR(v.real_date) : '—'}</b>
                        {' · '}{cuantas === 1 ? '1 visita' : `${cuantas} visitas`}
                        {filtros.coord && nombreCoord ? ` de ${nombreCoord}` : ''}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={tdDenso}>
                      <div style={{ fontWeight: 600 }}>{v.patient_name}</div>
                      {v.patient_code && <div className="spira-mono" style={{ fontSize: 11, color: 'var(--spira-ink-soft)' }}>{v.patient_code}</div>}
                    </td>
                    <td style={tdDenso}>
                      <div style={{ fontWeight: 600 }}>{v.protocol_code}</div>
                      <div style={{ fontSize: 11, color: 'var(--spira-ink-soft)' }}>{visitaTitulo(v)}</div>
                    </td>
                    <td style={{ ...tdDenso, color: 'var(--spira-ink-soft)' }}>{TIPO_VISITA_LABELS[x.tipo]}</td>
                    <td style={tdDenso}><Sello ts={v.arrived_at} quien={v.arrived_by_name} /></td>
                    <td style={tdDenso}><Sello ts={v.attended_at} quien={v.coordinator_id ? nombreDeCoordinadora(v) : null} /></td>
                    <td style={tdDenso}><Sello ts={v.ready_at} quien={v.ready_by_name} /></td>
                    <td style={tdDenso}><Sello ts={v.left_at} quien={v.left_by_name} /></td>
                    <td style={{ ...tdDenso, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: x.espera != null && x.espera > 30 ? 700 : 400, color: x.espera != null && x.espera > 30 ? 'var(--spira-acc-deep-warn)' : undefined }}>
                      {formatMinutosLargo(x.espera)}
                    </td>
                    <td style={{ ...tdDenso, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{formatMinutosLargo(x.atencion)}</td>
                    <td style={{ ...tdDenso, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{formatMinutosLargo(x.estadia)}</td>
                    <td style={tdDenso}>
                      <button type="button" className="spira-card-link" onClick={() => onAbrir(v)} aria-label={`Ver los sellos de la visita de ${v.patient_name}`} title="Ver los sellos de esta visita"
                        style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer', padding: 0 }}>
                        <Icon name="externalLink" size={14} />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={11} style={{ ...tfootTd, fontWeight: 400, color: 'var(--spira-ink-soft)' }}>
                <b style={{ color: 'var(--spira-ink)' }}>{formatNumberAR(resumen.visitas)}</b> {resumen.visitas === 1 ? 'visita' : 'visitas'} a la vista
                {' · '}espera promedio {formatMinutosLargo(resumen.espera)}
                {' · '}atención {formatMinutosLargo(resumen.atencion)}
                {' · '}estadía {formatMinutosLargo(resumen.estadia)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

/* ───────────────────────────── Modal de la visita ───────────────────────────── */

export function ModalVisita({ v, onClose, onAbrirVisita, accentSolid }: {
  v: VisitaEquipo
  onClose: () => void
  onAbrirVisita: () => void
  accentSolid: string
}) {
  const pasos: { hito: string; ts: string | null; quien: string | null }[] = [
    { hito: 'Llegada', ts: v.arrived_at, quien: v.arrived_by_name },
    { hito: 'Inicia atención', ts: v.attended_at, quien: v.coordinator_id ? nombreDeCoordinadora(v) : null },
    { hito: 'Fin de atención', ts: v.ready_at, quien: v.ready_by_name },
    { hito: 'Salida', ts: v.left_at, quien: v.left_by_name },
  ]
  const metricas: [string, string][] = [
    ['Espera', duracion(v.arrived_at, v.attended_at)],
    ['Atención', duracion(v.attended_at, v.ready_at)],
    ['Estadía total', duracion(v.arrived_at, v.left_at)],
  ]
  let anterior: string | null = null

  return (
    <Modal
      title={`${v.patient_name} · ${visitaTitulo(v)}`}
      subtitle={`${v.protocol_code} · ${v.real_date ? formatAR(v.real_date) : '—'} · ${nombreDeCoordinadora(v)}`}
      onClose={onClose}
      maxWidth={620}
      icon="clock"
      accent={accentSolid}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {metricas.map(([k, val]) => (
          <div key={k} style={{ background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--spira-ink-soft)' }}>{k}</div>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 20, fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
          </div>
        ))}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {pasos.map((p, i) => {
          const delta = p.ts && anterior ? minutesBetween(anterior, p.ts) : null
          if (p.ts) anterior = p.ts
          return (
            <li key={p.hito} style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', gap: 12, paddingBottom: i === pasos.length - 1 ? 0 : 14, position: 'relative' }}>
              {i < pasos.length - 1 && <span aria-hidden style={{ position: 'absolute', left: 8, top: 16, bottom: 0, width: 1, background: 'var(--spira-line-2)' }} />}
              <span aria-hidden style={{ width: 11, height: 11, marginTop: 3, borderRadius: '50%', background: p.ts ? 'var(--spira-white)' : 'var(--spira-line)', border: `2px solid ${p.ts ? accentSolid : 'var(--spira-line-2)'}` }} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.hito}</div>
                <div style={{ fontSize: 12, color: 'var(--spira-ink-soft)' }}>
                  {p.ts ? (p.quien ? `marcó ${p.quien}` : 'sin registro de quién lo marcó') : 'no se marcó'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.ts ? formatTimeAR(p.ts) : '—'}</div>
                {delta != null && <div style={{ fontSize: 11.5, color: 'var(--spira-acc-deep-track)', fontVariantNumeric: 'tabular-nums' }}>+{formatMinutosLargo(delta)}</div>}
              </div>
            </li>
          )
        })}
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--spira-line)' }}>
        <span style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', flex: 1, lineHeight: 1.45 }}>
          Los sellos son los que registró cada persona en el momento; no se editan desde acá.
        </span>
        <button type="button" className="spira-card-link" style={botonTexto} onClick={onClose}>Cerrar</button>
        <button type="button" onClick={onAbrirVisita}
          style={{ ...botonTexto, background: accentSolid, borderColor: accentSolid, color: 'var(--spira-on-accent)' }}>
          Abrir la visita
        </button>
      </div>
    </Modal>
  )
}

/* ───────────────────────────── Proyección ───────────────────────────── */

const COLORES_ESTUDIO = ['var(--spira-track)', 'var(--spira-lab)', 'var(--spira-warn)']

export function Proyeccion({ p, accentSolid }: { p: ResultadoProyeccion; accentSolid: string }) {
  const maxSemana = Math.max(1, ...p.semanas.map((s) => s.visitas))
  const partes = [
    ...p.estudios.map((e, i) => ({ key: e.protocolCode, label: `${e.protocolCode} · ${e.protocolName}`, visitas: e.visitas, color: COLORES_ESTUDIO[i] })),
    ...(p.otros.visitas > 0 ? [{ key: '__otros', label: p.otros.estudios === 1 ? 'Otro estudio' : `Otros ${p.otros.estudios} estudios`, visitas: p.otros.visitas, color: 'var(--spira-faint)' }] : []),
  ]
  const card: CSSProperties = { background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }
  const titulo: CSSProperties = { fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
      <div style={card}>
        <div style={titulo}>Visitas agendadas por semana</div>
        {p.semanas.map((s) => (
          <div key={s.desde} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 40px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: 'var(--spira-ink-soft)' }}>{formatDayMonth(s.desde)} – {formatDayMonth(s.hasta)}</span>
            <Barra pct={sharePct(s.visitas, maxSemana)} color={accentSolid} ancho="100%" />
            <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatNumberAR(s.visitas)}</span>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', borderTop: '1px solid var(--spira-line)', paddingTop: 9 }}>
          Lo que ya está agendado desde mañana. Todavía no hay un dato de capacidad del equipo para compararlo.
        </div>
      </div>
      <div style={card}>
        <div style={titulo}>Dónde se concentra</div>
        {partes.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>No hay visitas agendadas para las próximas cuatro semanas.</div>
        ) : (
          <>
            {partes.map((x) => (
              <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: x.color, flex: '0 0 auto' }} />
                <span style={{ flex: 1, minWidth: 0 }}>{x.label}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{x.visitas === 1 ? '1 visita' : `${formatNumberAR(x.visitas)} visitas`}</b>
              </div>
            ))}
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--spira-surface)' }}>
              {partes.map((x) => <span key={x.key} style={{ width: `${sharePct(x.visitas, p.total)}%`, background: x.color }} />)}
            </div>
          </>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', borderTop: '1px solid var(--spira-line)', paddingTop: 9 }}>
          {formatNumberAR(p.total)} {p.total === 1 ? 'visita agendada' : 'visitas agendadas'} para las próximas cuatro semanas.
        </div>
      </div>
    </div>
  )
}
