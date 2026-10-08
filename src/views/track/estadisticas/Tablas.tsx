import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { formatNumberAR, formatShareAR, sharePct } from '../../../lib/numbers'
import { formatMinutosLargo } from './agregados'
import type { FilaPorEstudio, FilaPorVisitaDeEstudio, ResultadoPorVisita, Tiempos } from './agregados'
import {
  barFill, barTrack, chevron, chevronAbierto, dash, filaDetalle, filaExpandible, subLine, tabla, tablaWrap, td, tdNum, tfootTd, th,
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

/* ─────────────────────────── Tiempos por visita ─────────────────────────── */

/**
 * Estudio → sus visitas (Director, 2026-10-08): "la V5 de ACT18301 tarda, en promedio, esto". La
 * fila del estudio resume; al abrirla aparece cada visita del cuadro en el orden del recorrido.
 * Las sub-filas van en la MISMA tabla, no en un bloque aparte, para que los minutos de la V5 queden
 * en columna con los del estudio y se lean de un vistazo.
 */
export function TablaPorVisita({ r }: { r: ResultadoPorVisita }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={tablaWrap}>
      <table style={tabla}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }} />
            <th style={th}>Estudio · visita</th>
            <th style={{ ...th, textAlign: 'center' }}>Visitas</th>
            <th style={{ ...th, textAlign: 'center' }}>Espera</th>
            <th style={{ ...th, textAlign: 'center' }}>Atención</th>
            <th style={{ ...th, textAlign: 'center' }}>Estadía total</th>
            <th style={{ ...th, textAlign: 'center' }}>Más larga</th>
          </tr>
        </thead>
        <tbody>
          {r.filas.map((f) => (
            <FragmentoEstudio key={f.protocolId} fila={f} abierto={abiertos.has(f.protocolId)} onToggle={() => toggle(f.protocolId)} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={tfootTd} />
            <td style={tfootTd}>Promedio general</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatNumberAR(r.visitas)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(r.esperaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(r.atencionProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(r.estadiaProm)}</td>
            <td style={{ ...tfootTd, textAlign: 'center' }}>{formatMinutosLargo(r.estadiaMax)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function FragmentoEstudio({ fila, abierto, onToggle }: { fila: FilaPorVisitaDeEstudio; abierto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr style={filaExpandible} onClick={onToggle} aria-expanded={abierto}>
        <td style={td}>
          <span style={{ ...chevron, ...(abierto ? chevronAbierto : null) }}>
            <Icon name="chevronRight" size={14} stroke={2} />
          </span>
        </td>
        <td style={td}>
          <div style={{ fontWeight: 600 }}>{fila.protocolCode}</div>
          <div style={subLine}>{fila.protocolName}</div>
        </td>
        <CeldasTiempos t={fila} />
      </tr>
      {abierto && fila.porVisita.map((v) => (
        <tr key={v.clave} style={filaDetalle}>
          <td style={td} />
          <td style={{ ...td, paddingLeft: 28 }}>{v.label}</td>
          <CeldasTiempos t={v} />
        </tr>
      ))}
    </>
  )
}

/**
 * Las cinco columnas de números. Si un promedio sale de MENOS visitas que las contadas (faltan
 * sellos), lo dice debajo — "sobre 2" — en vez de presentar un promedio parcial como si fuera de
 * todas. La Atención va en negrita: es la que se usa para estimar cuánto dura la visita, y la que
 * más cobertura tiene (la salida casi nunca se marca, así que la estadía suele quedar en guion).
 */
function CeldasTiempos({ t }: { t: Tiempos }) {
  return (
    <>
      <td style={tdNum}>{formatNumberAR(t.visitas)}</td>
      <td style={tdNum}><Minutos valor={t.esperaProm} sobre={t.cobertura.espera} de={t.visitas} /></td>
      <td style={{ ...tdNum, fontWeight: 600 }}><Minutos valor={t.atencionProm} sobre={t.cobertura.atencion} de={t.visitas} /></td>
      <td style={tdNum}><Minutos valor={t.estadiaProm} sobre={t.cobertura.estadia} de={t.visitas} /></td>
      <td style={{ ...tdNum, color: 'var(--spira-muted)' }}>{formatMinutosLargo(t.estadiaMax)}</td>
    </>
  )
}

function Minutos({ valor, sobre, de }: { valor: number | null; sobre: number; de: number }) {
  if (valor == null) return <span style={dash}>—</span>
  return (
    <>
      {formatMinutosLargo(valor)}
      {sobre < de && <div style={{ ...subLine, fontWeight: 400 }}>sobre {formatNumberAR(sobre)}</div>}
    </>
  )
}
