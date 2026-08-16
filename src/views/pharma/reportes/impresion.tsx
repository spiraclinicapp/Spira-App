import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { formatAR, formatDateTimeAR, formatShortAR, formatTimeAR } from '../../../lib/dates'
import { formatNumberAR, formatPctAR } from '../../../lib/numbers'
import type { FilaDetalle, FilaMedicamento, FilaProtocolo, Totales } from './agregados'
import type { Rango } from '../../../data/pharma/reportModel'

/**
 * El sistema de impresión: un registro declarativo y dos hojas.
 *
 * POR QUÉ UN REGISTRO Y NO UN COMPONENTE POR REPORTE. Son doce hojas que comparten membrete,
 * período y línea de filtros. Escritas una por una, el día que la Fundación cambie el pie de
 * página hay que tocar doce archivos y el que se olvide sale impreso distinto y firmado. Acá el
 * encabezado existe UNA vez y cada reporte declara su título y su cuerpo.
 *
 * LA EXCEPCIÓN ESTÁ DECLARADA, no disuelta en el patrón: el reporte de dispensaciones tiene
 * formato acordado con la Fundación, no lleva el encabezado genérico, usa otro formato de rango
 * (corto, con em dash) y declara SÓLO el período, sin filtros. Meterlo al molde llenaría el
 * registro de banderas para un solo caso, así que es su propio componente y el registro lo marca
 * con `propia: true`.
 *
 * La hoja se PORTALEA a <body> (ver tokens.css, bloque de impresión): así el `@media print` puede
 * sacar la app del flujo con `display:none` en vez del truco de `visibility`, que preserva el
 * layout y deja páginas en blanco al final de un documento largo.
 */

export interface ContextoReporte {
  rango: Rango
  filtros: string
  generadoPor: string
  emitidoEn: string
  totales: Totales
  ingresos: { unidades: number; recepciones: number; kits: number }
  minutosPromedio: number | null
  cumplimientoPct: number | null
  rechazados: number
  vencidos: { unidades: number; lotes: number }
  protocolos: FilaProtocolo[]
  medicamentos: FilaMedicamento[]
  detalle: FilaDetalle[]
  diaMax: { fecha: string; unidades: number } | null
  diaMin: { fecha: string; unidades: number } | null
  dias: number
}

type Par = [string, string]

interface DefinicionReporte {
  titulo: string
  /** Pares clave-valor del cuerpo. */
  pares?: (c: ContextoReporte) => Par[]
  /** Tablas que se anexan debajo de los pares. */
  tablas?: ('protocolos' | 'medicamentos')[]
  /** Formato propio, sin el encabezado estándar (la hoja acordada con la Fundación). */
  propia?: boolean
}

const u = (n: number) => `${formatNumberAR(n)} u.`

export const REPORTES: Record<string, DefinicionReporte> = {
  resumen: {
    titulo: 'RESUMEN DEL PERÍODO',
    pares: (c) => [
      ['Unidades dispensadas', `${u(c.totales.unidades)} en ${formatNumberAR(c.totales.dispensaciones)} dispensaciones`],
      ['Unidades ingresadas', `${u(c.ingresos.unidades)} en ${formatNumberAR(c.ingresos.recepciones)} recepciones verificadas`],
      ['Balance del período', `${c.ingresos.unidades - c.totales.unidades >= 0 ? '+' : ''}${u(c.ingresos.unidades - c.totales.unidades)} de saldo`],
      ['Producto de investigación', `${formatNumberAR(c.totales.kits)} kits entregados · ${formatNumberAR(c.ingresos.kits)} recibidos`],
      ['Pacientes distintos atendidos', formatNumberAR(c.totales.pacientes)],
      ['Droga más dispensada', c.medicamentos[0] ? `${c.medicamentos[0].medicationName} — ${u(c.medicamentos[0].unidades)} (${formatPctAR(c.medicamentos[0].pct)})` : 'sin dispensaciones'],
      ['Protocolo con más dispensaciones', c.protocolos[0] ? `${c.protocolos[0].protocolCode} — ${formatNumberAR(c.protocolos[0].dispensaciones)} (${formatPctAR(c.protocolos[0].pct)})` : 'sin dispensaciones'],
      ['Tiempo promedio hasta la entrega', c.minutosPromedio == null ? 'sin datos' : `${formatNumberAR(c.minutosPromedio)} min`],
      ['Cumplimiento del pedido', c.cumplimientoPct == null ? 'sin datos' : formatPctAR(c.cumplimientoPct)],
      ['Pedidos rechazados o cancelados', formatNumberAR(c.rechazados)],
      ['Stock vencido sin usar (al día de hoy)', `${u(c.vencidos.unidades)} en ${formatNumberAR(c.vencidos.lotes)} lotes`],
    ],
  },
  dispensadas: {
    titulo: 'UNIDADES DISPENSADAS',
    pares: (c) => [
      ['Total del período', u(c.totales.unidades)],
      ['Dispensaciones', formatNumberAR(c.totales.dispensaciones)],
      ['Promedio por dispensación', c.totales.dispensaciones === 0 ? '—' : u(c.totales.unidades / c.totales.dispensaciones)],
      ['Promedio diario', c.dias === 0 ? '—' : u(c.totales.unidades / c.dias)],
    ],
    tablas: ['protocolos'],
  },
  ingresadas: {
    titulo: 'UNIDADES INGRESADAS',
    pares: (c) => [
      ['Total del período', u(c.ingresos.unidades)],
      ['Recepciones verificadas', formatNumberAR(c.ingresos.recepciones)],
      ['Kits de investigación recibidos', formatNumberAR(c.ingresos.kits)],
    ],
  },
  balance: {
    titulo: 'BALANCE DEL PERÍODO',
    pares: (c) => [
      ['Ingresadas', u(c.ingresos.unidades)],
      ['Dispensadas', u(c.totales.unidades)],
      ['Saldo', `${c.ingresos.unidades - c.totales.unidades >= 0 ? '+' : ''}${u(c.ingresos.unidades - c.totales.unidades)}`],
      ['Nota', 'El saldo es sólo de unidades. Los kits de investigación se informan aparte.'],
    ],
  },
  pacientes: {
    titulo: 'PACIENTES ATENDIDOS',
    pares: (c) => [
      ['Pacientes distintos', formatNumberAR(c.totales.pacientes)],
      ['Dispensaciones por paciente', c.totales.pacientes === 0 ? '—' : `${formatNumberAR(c.totales.dispensaciones / c.totales.pacientes)} promedio`],
    ],
    tablas: ['protocolos'],
  },
  tiempos: {
    titulo: 'TIEMPO HASTA LA ENTREGA',
    pares: (c) => [
      ['Promedio del período', c.minutosPromedio == null ? 'sin datos' : `${formatNumberAR(c.minutosPromedio)} min`],
      ['Muestra', `${formatNumberAR(c.totales.dispensaciones)} dispensaciones entregadas`],
      ['Qué mide', 'Desde que la farmacia abre la dispensación hasta que el paciente la retira. Incluye la espera del retiro.'],
    ],
  },
  cumplimiento: {
    titulo: 'CUMPLIMIENTO DEL PEDIDO',
    pares: (c) => [
      ['Entregado sobre solicitado', c.cumplimientoPct == null ? 'sin datos' : formatPctAR(c.cumplimientoPct)],
      ['Unidades entregadas', u(c.totales.unidades)],
      ['Qué mide', 'Cuánto de lo que Coordinación pidió llegó a entregarse. No es adherencia del paciente.'],
    ],
  },
  medicamentos: { titulo: 'MEDICAMENTOS MÁS DISPENSADOS', tablas: ['medicamentos'] },
  protocolos: { titulo: 'DISPENSACIONES POR PROTOCOLO', tablas: ['protocolos'] },
  rechazadas: {
    titulo: 'PEDIDOS RECHAZADOS O CANCELADOS',
    pares: (c) => [
      ['Total del período', formatNumberAR(c.rechazados)],
      ['Nota', 'Se informan PEDIDOS y no unidades: los renglones de un pedido cancelado se borran, así que las unidades involucradas ya no existen en el sistema.'],
    ],
  },
  vencidos: {
    titulo: 'STOCK VENCIDO SIN USAR',
    pares: (c) => [
      ['Unidades inmovilizadas', u(c.vencidos.unidades)],
      ['Lotes', formatNumberAR(c.vencidos.lotes)],
      ['Corte', 'Al día de hoy, no del período del informe: un lote está vencido ahora.'],
    ],
  },
  evolucion: {
    titulo: 'EVOLUCIÓN DIARIA',
    pares: (c) => [
      ['Días del período', formatNumberAR(c.dias)],
      ['Promedio diario', c.dias === 0 ? '—' : u(c.totales.unidades / c.dias)],
      ['Día de mayor movimiento', c.diaMax ? `${formatShortAR(c.diaMax.fecha)} — ${u(c.diaMax.unidades)}` : '—'],
      ['Día de menor movimiento', c.diaMin ? `${formatShortAR(c.diaMin.fecha)} — ${u(c.diaMin.unidades)}` : '—'],
    ],
  },
  todo: {
    titulo: 'INFORME DE FARMACIA DEL PERÍODO',
    pares: (c) => REPORTES.resumen.pares!(c),
    tablas: ['protocolos', 'medicamentos'],
  },
  detalle: { titulo: 'REPORTE DE DISPENSACIONES', propia: true },
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA HOJA
   ───────────────────────────────────────────────────────────────────────────── */

export function HojaImpresa({ clave, ctx }: { clave: string | null; ctx: ContextoReporte }) {
  if (!clave) return null
  const def = REPORTES[clave]
  if (!def) return null
  const hoja = def.propia
    ? <HojaDispensaciones ctx={ctx} />
    : <HojaEstandar def={def} ctx={ctx} />
  return createPortal(
    <div className="spira-print-doc" aria-hidden="true">{hoja}</div>,
    document.body,
  )
}

function HojaEstandar({ def, ctx }: { def: DefinicionReporte; ctx: ContextoReporte }) {
  const pares = def.pares?.(ctx) ?? []
  return (
    <>
      <Membrete />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 13, letterSpacing: '0.07em' }}>{def.titulo}</b>
        <span style={{ marginLeft: 'auto', fontSize: 10.5 }}>
          emitido {formatDateTimeAR(ctx.emitidoEn)}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <FilaKv k="Período" v={`${formatAR(ctx.rango.desde)} – ${formatAR(ctx.rango.hasta)}`} />
          <FilaKv k="Filtros" v={ctx.filtros} />
          <FilaKv k="Generado por" v={ctx.generadoPor} />
        </tbody>
      </table>

      {pares.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14 }}>
          <tbody>{pares.map(([k, v]) => <FilaKv key={k} k={k} v={v} />)}</tbody>
        </table>
      )}

      {def.tablas?.includes('protocolos') && (
        <Seccion titulo="Dispensaciones por protocolo">
          <table style={tablaImpresa}>
            <thead>
              <tr>
                <th style={thImpresa}>Protocolo</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Dispensaciones</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Unidades</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Pacientes</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Participación</th>
              </tr>
            </thead>
            <tbody>
              {ctx.protocolos.map((f) => (
                <tr key={f.protocolCode}>
                  <td style={tdImpresa}>
                    {f.protocolCode}
                    {f.protocolName && <span style={{ color: '#444' }}> · {f.protocolName}</span>}
                  </td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.dispensaciones)}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.unidades)}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.pacientes)}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatPctAR(f.pct)}</td>
                </tr>
              ))}
              <SinDatos cantidad={ctx.protocolos.length} columnas={5} />
            </tbody>
          </table>
        </Seccion>
      )}

      {def.tablas?.includes('medicamentos') && (
        <Seccion titulo="Medicamentos más dispensados">
          <table style={tablaImpresa}>
            <thead>
              <tr>
                <th style={thImpresa}>Droga y presentación</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Unidades</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Dispensaciones</th>
                <th style={{ ...thImpresa, textAlign: 'right' }}>Participación</th>
              </tr>
            </thead>
            <tbody>
              {ctx.medicamentos.map((f) => (
                <tr key={f.medicationName}>
                  <td style={tdImpresa}>{f.medicationName}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.unidades)}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatNumberAR(f.dispensaciones)}</td>
                  <td style={{ ...tdImpresa, textAlign: 'right' }}>{formatPctAR(f.pct)}</td>
                </tr>
              ))}
              <SinDatos cantidad={ctx.medicamentos.length} columnas={4} />
            </tbody>
          </table>
        </Seccion>
      )}

      <PieDePagina emitidoEn={ctx.emitidoEn} />
    </>
  )
}

/**
 * La hoja acordada con la Fundación. No lleva el encabezado estándar y declara SÓLO el período:
 * es requisito del formato, y por eso la línea de filtros de la pantalla lo aclara.
 *
 * El rango va en formato CORTO y con em dash (`7/7/2026 — 6/8/2026`), distinto del de las otras
 * hojas. Los dos formatos son intencionales.
 */
function HojaDispensaciones({ ctx }: { ctx: ContextoReporte }) {
  const corto = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${Number(d)}/${Number(m)}/${y}`
  }
  return (
    <>
      <div style={{ borderBottom: '1px solid #000', paddingBottom: 7, marginBottom: 12 }}>
        <b style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, display: 'block' }}>
          Spira · Fundación Scherbovsky
        </b>
        <span style={{ fontSize: 11 }}>Farmacia de investigación — reporte de dispensaciones</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #000', margin: '12px 0' }}>
        <Banda k="Período" v={`${corto(ctx.rango.desde)} — ${corto(ctx.rango.hasta)}`} />
        <Banda k="Total registros" v={formatNumberAR(ctx.detalle.length)} />
        <Banda k="Generado por" v={ctx.generadoPor} ultima />
      </div>

      <table style={tablaImpresa}>
        <thead>
          <tr>
            {['N°', 'Fecha', 'Hora', 'Paciente', 'Código', 'Protocolo', 'Medicamentos'].map((h) => (
              <th key={h} className="spira-print-invert" style={thNegra}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ctx.detalle.map((f) => (
            <tr key={f.dispensationId}>
              <td style={tdDetalle}>{f.numero}</td>
              <td style={tdDetalle}>{formatAR(f.fecha)}</td>
              <td style={tdDetalle}>{formatTimeAR(f.deliveredAt)}</td>
              <td style={tdDetalle}>{f.pacienteNombre ?? '—'}</td>
              <td style={tdDetalle}>{f.pacienteCodigo ?? '—'}</td>
              <td style={tdDetalle}>{f.protocolCode ?? '—'}</td>
              <td style={tdDetalle}>{f.medicamentos}</td>
            </tr>
          ))}
          {ctx.detalle.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdDetalle, textAlign: 'center', padding: '26px 0', color: '#666' }}>
                Sin dispensaciones en el período
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <PieDePagina emitidoEn={ctx.emitidoEn} />
    </>
  )
}

/* ── Piezas ──────────────────────────────────────────────────────────────────── */

function Membrete() {
  return (
    <div style={{ borderBottom: '1px solid #000', paddingBottom: 7, marginBottom: 12 }}>
      <b style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, display: 'block' }}>
        Spira · Fundación Scherbovsky
      </b>
      <span style={{ fontSize: 11 }}>Farmacia de investigación</span>
    </div>
  )
}

function PieDePagina({ emitidoEn }: { emitidoEn: string }) {
  return (
    <div style={{ display: 'flex', marginTop: 20, paddingTop: 8, borderTop: '1px solid #999', fontSize: 9, color: '#666' }}>
      <span>Spira · Farmacia — Fundación Scherbovsky</span>
      <span style={{ marginLeft: 'auto' }}>{formatDateTimeAR(emitidoEn)}</span>
    </div>
  )
}

function FilaKv({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: '5px 0', borderBottom: '1px solid #999', fontSize: 11.5, width: '46%' }}>{k}</td>
      <td style={{ padding: '5px 0', borderBottom: '1px solid #999', fontSize: 11.5, fontWeight: 700 }}>{v}</td>
    </tr>
  )
}

function Banda({ k, v, ultima }: { k: string; v: string; ultima?: boolean }) {
  return (
    <div style={{ padding: '8px 10px', borderRight: ultima ? 'none' : '1px solid #999' }}>
      <div style={{ fontSize: 8.5, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{v}</div>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 6px' }}>
        {titulo}
      </h4>
      {children}
    </section>
  )
}

function SinDatos({ cantidad, columnas }: { cantidad: number; columnas: number }) {
  if (cantidad > 0) return null
  return (
    <tr>
      <td colSpan={columnas} style={{ ...tdImpresa, textAlign: 'center', padding: '18px 0', color: '#666' }}>
        Sin registros en el período
      </td>
    </tr>
  )
}

const tablaImpresa = { width: '100%', borderCollapse: 'collapse' as const }
const thImpresa = {
  textAlign: 'left' as const, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, padding: '6px 8px 6px 0', borderBottom: '1px solid #000',
}
const tdImpresa = { padding: '6px 8px 6px 0', borderBottom: '1px solid #999', fontSize: 10.5, verticalAlign: 'top' as const }
/* Encabezado en negro pleno: es el formato acordado. `print-color-adjust: exact` fuerza al
   navegador a imprimir el fondo, que por defecto se descarta para ahorrar tinta. */
const thNegra = {
  background: '#000', color: '#fff', fontSize: 8.5, letterSpacing: '0.06em',
  textTransform: 'uppercase' as const, padding: '5px 7px', textAlign: 'left' as const,
  printColorAdjust: 'exact' as const, WebkitPrintColorAdjust: 'exact' as const,
}
const tdDetalle = { borderBottom: '1px solid #BBB', padding: '5px 7px', fontSize: 10, verticalAlign: 'top' as const }
