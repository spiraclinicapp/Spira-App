import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { formatNumberAR, formatPctAR, sharePct } from '../../../lib/numbers'
import { formatShortAR } from '../../../lib/dates'
import { agruparSemanas, mediaMovil7 } from './serie'
import type { PuntoSerie } from './serie'
import { card, th } from './estilos'

/**
 * El gráfico de unidades por día, con su tabla semanal debajo.
 *
 * SVG A MANO, sin librería de gráficos. El repo tiene cuatro dependencias y ninguna de UI más allá
 * de react-day-picker; meter recharts sería gastar un token de innovación en un gráfico de barras
 * cuya geometría ya está especificada al píxel. Es el mismo criterio con el que están dibujados
 * `Icon.tsx` y `Vilano.tsx`.
 *
 * LA TABLA SEMANAL ES EL EQUIVALENTE TEXTUAL DEL GRÁFICO, y por eso el `<svg>` va con
 * `role="img"` + `aria-describedby` apuntándole: quien no puede ver el gráfico tiene los mismos
 * números en una tabla de verdad, no una descripción aproximada.
 *
 *   ┌─ geometría ───────────────────────────────────────────────────────────┐
 *   │  W=1000  H=250   L=42 (margen izq)  R=12  T=18  B=32                  │
 *   │  iw = (W-L-R)/n        ancho de columna                               │
 *   │  bw = iw * 0.6         ancho de barra, centrada en su columna         │
 *   │  y(v) = T + (H-T-B) * (1 - v/MAX)                                     │
 *   │  MAX = el tope redondeado hacia arriba de la serie (mínimo 40)        │
 *   └───────────────────────────────────────────────────────────────────────┘
 */

const W = 1000, H = 250, L = 42, R = 12, T = 18, B = 32

export function GraficoDiario({ serie, id = 'grafico-diario' }: { serie: PuntoSerie[]; id?: string }) {
  const [hover, setHover] = useState<number | null>(null)

  const { iw, bw, barras, media, etiquetas, grilla } = useMemo(() => {
    const n = Math.max(serie.length, 1)
    const pico = Math.max(...serie.map((p) => p.unidades), 0)
    /* Tope redondeado al múltiplo de 40 de arriba, con piso en 40: un eje fijo en 160 como el del
       prototipo recorta las barras el día que el centro despache más, y un eje que se autoescala
       a cualquier número deja etiquetas como "137". */
    const max = Math.max(40, Math.ceil(pico / 40) * 40)
    const iw = (W - L - R) / n
    const bw = iw * 0.6
    const y = (v: number) => T + (H - T - B) * (1 - v / max)

    const barras = serie.map((p, i) => ({
      x: L + iw * i + (iw - bw) / 2, y: y(p.unidades), alto: y(0) - y(p.unidades), punto: p, i,
    }))

    const promedios = mediaMovil7(serie.map((p) => p.unidades))
    const media = promedios
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${L + iw * i + iw / 2} ${y(v)}`)
      .join(' ')

    const paso = Math.max(1, Math.ceil(serie.length / 11))
    const etiquetas = serie
      .map((p, i) => ({ i, texto: formatShortAR(p.fecha) }))
      .filter(({ i }) => i % paso === 0)
      .map((e) => ({ ...e, x: L + iw * e.i + iw / 2 }))

    const pasos = 4
    const grilla = Array.from({ length: pasos + 1 }, (_, k) => {
      const v = (max / pasos) * k
      return { v, y: y(v) }
    })

    return { iw, bw, barras, media, etiquetas, grilla }
  }, [serie])

  const semanas = useMemo(() => agruparSemanas(serie), [serie])
  const totalPeriodo = serie.reduce((a, p) => a + p.unidades, 0)
  const maxSemana = Math.max(...semanas.map((s) => s.unidades), 1)
  const activo = hover != null ? serie[hover] : null

  return (
    <div style={{ ...card, padding: '16px 18px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 14, fontWeight: 700 }}>
          Unidades dispensadas por día
        </div>
        <div style={leyenda}>
          <span style={item}><i style={{ ...swatch, background: 'var(--spira-primary)' }} />Día hábil</span>
          <span style={item}><i style={{ ...swatch, background: 'rgba(15,95,87,0.32)' }} />Fin de semana</span>
          <span style={item}><i style={{ width: 15, borderTop: '2.2px solid var(--spira-primary)' }} />Media 7 días</span>
        </div>
      </div>

      <div style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label="Unidades dispensadas por día del período"
          aria-describedby={`${id}-tabla`}
        >
          {grilla.map((g) => (
            <g key={g.v}>
              <line x1={L} x2={W - R} y1={g.y} y2={g.y} strokeWidth={1}
                stroke={g.v === 0 ? 'var(--spira-line-2)' : 'var(--spira-line)'} />
              <text x={L - 8} y={g.y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--spira-ink-soft)">
                {g.v}
              </text>
            </g>
          ))}

          {barras.map((b) => (
            <rect key={b.i} x={b.x} y={b.y} width={bw} height={Math.max(0, b.alto)} rx={3}
              fill={b.punto.finDeSemana ? 'rgba(15,95,87,0.32)' : 'var(--spira-primary)'} />
          ))}

          {serie.length > 1 && (
            <path d={media} fill="none" stroke="var(--spira-primary)" strokeWidth={2.2}
              strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
          )}

          {etiquetas.map((e) => (
            <text key={e.i} x={e.x} y={H - 11} textAnchor="middle" fontSize={10} fill="var(--spira-ink-soft)">
              {e.texto}
            </text>
          ))}

          {/* Zonas de hover por COLUMNA y no por barra: con una barra de 3 unidades el blanco de
              18px de ancho sería casi imposible de acertar con el mouse. */}
          {barras.map((b) => (
            <rect key={`hz-${b.i}`} x={L + iw * b.i} y={T} width={iw} height={H - T - B}
              fill="transparent" onMouseEnter={() => setHover(b.i)} />
          ))}
        </svg>

        {activo && (
          <div style={{
            position: 'absolute', left: `${((L + iw * hover! + iw / 2) / W) * 100}%`, top: 0,
            transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: 4,
            background: 'var(--spira-ink)', color: 'var(--spira-on-accent)',
            borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 600,
            whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
          }}>
            {formatShortAR(activo.fecha)} · {formatNumberAR(activo.unidades)} u.
            {activo.finDeSemana && ' · fin de semana'}
          </div>
        )}
      </div>

      <table id={`${id}-tabla`} style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid var(--spira-line)', marginTop: 10 }}>
        <caption style={{ captionSide: 'top', textAlign: 'left', fontSize: 11.5, color: 'var(--spira-ink-soft)', padding: '8px 0 0' }}>
          El mismo período, semana por semana.
        </caption>
        <thead>
          <tr>
            {['Semana', 'Días', 'Unidades', 'Prom./día', 'Máximo', 'Mínimo', '% del total'].map((h, i) => (
              <th key={h} style={{ ...th, ...miniTh, textAlign: i === 0 ? 'left' : 'right', paddingLeft: i === 0 ? 0 : 6 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((s) => (
            <tr key={s.label}>
              <td style={{ ...miniTd, textAlign: 'left', paddingLeft: 0 }}>{s.label}</td>
              <td style={miniTd}>{s.dias}</td>
              <td style={miniTd}>
                {formatNumberAR(s.unidades)}
                <span style={microBar}>
                  <span style={{ display: 'block', height: '100%', width: `${sharePct(s.unidades, maxSemana)}%`, background: 'var(--spira-pharma-solid)' }} />
                </span>
              </td>
              <td style={miniTd}>{formatNumberAR(s.promedio)}</td>
              <td style={miniTd}>{formatNumberAR(s.maximo)}</td>
              <td style={miniTd}>{formatNumberAR(s.minimo)}</td>
              <td style={miniTd}>{formatPctAR(s.pct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...miniTd, ...totalTd, textAlign: 'left', paddingLeft: 0 }}>Total del período</td>
            <td style={{ ...miniTd, ...totalTd }}>{serie.length}</td>
            <td style={{ ...miniTd, ...totalTd }}>{formatNumberAR(totalPeriodo)}</td>
            <td style={{ ...miniTd, ...totalTd }}>{formatNumberAR(serie.length === 0 ? 0 : totalPeriodo / serie.length)}</td>
            <td style={{ ...miniTd, ...totalTd }}>{formatNumberAR(Math.max(...serie.map((p) => p.unidades), 0))}</td>
            <td style={{ ...miniTd, ...totalTd }}>{formatNumberAR(Math.min(...serie.map((p) => p.unidades), 0))}</td>
            <td style={{ ...miniTd, ...totalTd }}>{formatPctAR(totalPeriodo === 0 ? 0 : 100)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const leyenda: CSSProperties = {
  marginLeft: 'auto', display: 'flex', gap: 14, flexWrap: 'wrap',
  fontSize: 11.5, color: 'var(--spira-ink-soft)', alignItems: 'center',
}
const item: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 }
const swatch: CSSProperties = { width: 11, height: 11, borderRadius: 3, display: 'inline-block' }
const miniTh: CSSProperties = { fontSize: 9.5, padding: '9px 6px 6px', borderBottom: 'none' }
const miniTd: CSSProperties = {
  fontSize: 12, padding: 6, textAlign: 'right',
  borderTop: '1px solid var(--spira-line)', fontVariantNumeric: 'tabular-nums',
}
const totalTd: CSSProperties = { fontWeight: 700, borderTop: '1px solid var(--spira-line-2)' }
const microBar: CSSProperties = {
  display: 'inline-block', width: 46, height: 4, borderRadius: 2,
  background: 'var(--spira-line)', marginLeft: 8, verticalAlign: 'middle', overflow: 'hidden',
}
