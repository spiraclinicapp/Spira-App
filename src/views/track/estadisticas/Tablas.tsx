import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { formatNumberAR, formatShareAR, sharePct } from '../../../lib/numbers'
import { formatMinutosLargo } from './agregados'
import type { FilaPorEstudio, FilaPorTipo } from './agregados'
import {
  barFill, barTrack, chevron, chevronAbierto, dash, detalleInner, detalleLinea,
  filaDetalle, filaExpandible, subLine, tabla, tablaWrap, td, tdNum, tfootTd, th,
} from './estilos'

/* ───────────────────────────── Por estudio ───────────────────────────── */

export function TablaPorEstudio({
  filas, totalVisitas, totalPerdidas, totalEnVentana, totalPendientes, accentSolid,
}: {
  filas: FilaPorEstudio[]
  totalVisitas: number
  totalPerdidas: number
  totalEnVentana: { si: number; de: number }
  totalPendientes: number
  accentSolid: string
}) {
  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={th}>Estudio</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas</th>
            <th style={{ ...th, textAlign: 'center' }}>Perdidas</th>
            <th style={{ ...th, textAlign: 'center' }}>En ventana</th>
            <th style={{ ...th, textAlign: 'center' }}>Pendientes abiertos</th>
            <th style={{ ...th, textAlign: 'right', width: 180 }}>Participación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.protocolId}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{f.protocolCode}</div>
                <div style={subLine}>{f.protocolName}</div>
              </td>
              <td style={tdNum}>{formatNumberAR(f.visitas)}</td>
              <td style={tdNum}>{f.perdidas > 0 ? formatNumberAR(f.perdidas) : <span style={dash}>—</span>}</td>
              <td style={tdNum}>
                {f.enVentana.de > 0 ? formatShareAR(f.enVentana.si, f.enVentana.de) : <span style={dash}>sin ventana</span>}
              </td>
              <td style={tdNum}>{f.pendientes > 0 ? formatNumberAR(f.pendientes) : <span style={dash}>—</span>}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <BarraParticipacion parte={f.visitas} total={totalVisitas} color={accentSolid} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={tfootTd}>Total</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(totalVisitas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(totalPerdidas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>
              {totalEnVentana.de > 0 ? formatShareAR(totalEnVentana.si, totalEnVentana.de) : '—'}
            </td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(totalPendientes)}</td>
            <td style={{ ...tfootTd, textAlign: 'right' }}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function BarraParticipacion({ parte, total, color }: { parte: number; total: number; color: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, width: 44 }}>{formatShareAR(parte, total)}</span>
      <span style={{ ...barTrack, width: 70 }}>
        <span style={barFill(sharePct(parte, total), color)} />
      </span>
    </div>
  )
}

/* ─────────────────────── Promedio por tipo de visita ─────────────────────── */

export function TablaPorTipo({
  filas, totalVisitas, esperaProm, atencionProm, estadiaProm, estadiaMax, accentSolid,
}: {
  filas: FilaPorTipo[]
  totalVisitas: number
  esperaProm: number | null
  atencionProm: number | null
  estadiaProm: number | null
  estadiaMax: number | null
  accentSolid: string
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const maxAtencion = Math.max(1, ...filas.map((f) => f.atencionProm ?? 0))

  function toggle(tipo: string) {
    setAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }} />
            <th style={th}>Tipo de visita</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas</th>
            <th style={{ ...th, textAlign: 'center' }}>Espera</th>
            <th style={{ ...th, textAlign: 'center' }}>Atención</th>
            <th style={{ ...th, textAlign: 'center' }}>Estadía total</th>
            <th style={{ ...th, textAlign: 'center' }}>Más larga</th>
            <th style={{ ...th, textAlign: 'right', width: 160 }}>Atención relativa</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const abierta = abiertas.has(f.tipo)
            return (
              <FragmentoFilaTipo
                key={f.tipo}
                fila={f}
                abierta={abierta}
                onToggle={() => toggle(f.tipo)}
                maxAtencion={maxAtencion}
                accentSolid={accentSolid}
              />
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={tfootTd} />
            <td style={tfootTd}>Promedio general</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(totalVisitas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(esperaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(atencionProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(estadiaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(estadiaMax)}</td>
            <td style={{ ...tfootTd, textAlign: 'right' }}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function FragmentoFilaTipo({
  fila, abierta, onToggle, maxAtencion, accentSolid,
}: {
  fila: FilaPorTipo
  abierta: boolean
  onToggle: () => void
  maxAtencion: number
  accentSolid: string
}) {
  const coberturaIncompleta = fila.cobertura.atencion < fila.visitas
  return (
    <>
      <tr style={filaExpandible} onClick={onToggle}>
        <td style={td}>
          <span style={{ ...chevron, ...(abierta ? chevronAbierto : null) }}>
            <Icon name="chevronRight" size={14} stroke={2} />
          </span>
        </td>
        <td style={td}>{fila.label}</td>
        <td style={tdNum}>{formatNumberAR(fila.visitas)}</td>
        <td style={tdNum}>{formatMinutosLargo(fila.esperaProm)}</td>
        <td style={{ ...tdNum, fontWeight: 600 }}>{formatMinutosLargo(fila.atencionProm)}</td>
        <td style={tdNum}>{formatMinutosLargo(fila.estadiaProm)}</td>
        <td style={{ ...tdNum, color: 'var(--spira-muted)' }}>{formatMinutosLargo(fila.estadiaMax)}</td>
        <td style={{ ...td, textAlign: 'right' }}>
          <BarraAtencion valor={fila.atencionProm} max={maxAtencion} color={accentSolid} />
        </td>
      </tr>
      {abierta && (
        <tr style={filaDetalle}>
          <td colSpan={8}>
            <div style={detalleInner}>
              <div style={{ fontWeight: 600, color: 'var(--spira-ink)', fontSize: 12.5 }}>
                Atención promedio por estudio · minutos y cantidad de visitas
              </div>
              {fila.porEstudio.map((e) => {
                const max = Math.max(1, ...fila.porEstudio.map((x) => x.atencionProm ?? 0))
                return (
                  <div key={e.protocolCode} style={detalleLinea}>
                    <span style={subLine}>{e.protocolCode} · {e.protocolName}</span>
                    <span style={{ ...barTrack, height: 5 }}>
                      <span style={barFill(sharePct(e.atencionProm ?? 0, max), accentSolid)} />
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5, textAlign: 'right' }}>
                      {formatMinutosLargo(e.atencionProm)} <span style={{ color: 'var(--spira-ink-soft)' }}>· {e.visitas}</span>
                    </span>
                  </div>
                )
              })}
              {coberturaIncompleta && (
                <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
                  El promedio de atención sale de {formatNumberAR(fila.cobertura.atencion)} de {formatNumberAR(fila.visitas)} visitas:
                  el resto no tiene marcado el inicio y el cierre de atención.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function BarraAtencion({ valor, max, color }: { valor: number | null; max: number; color: string }) {
  if (valor == null) return <span style={dash}>—</span>
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'flex-end' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{formatMinutosLargo(valor)}</span>
      <span style={{ ...barTrack, width: 70 }}>
        <span style={barFill(sharePct(valor, max), color)} />
      </span>
    </div>
  )
}
