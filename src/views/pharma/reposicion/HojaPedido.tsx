import { Fragment, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { formatAR } from '../../../lib/dates'
import { diaMes, notaDeReimpresion } from '../../../data/pharma'
import type { Periodo, PedidoMedicacion } from '../../../data/pharma'
import { FilaKv, Membrete, PieDePagina, tablaImpresa, tdImpresa, thImpresa } from '../reportes/impresion'

/**
 * La hoja A4 del pedido (mock «La hoja que va a la farmacia»): va a la farmacia y vuelve con la medicación.
 * Las tres últimas columnas —entregado, lote, vence— van VACÍAS para completarlas a mano, con dos renglones
 * por medicamento por si la farmacia entrega dos lotes (RD11). Un pedido anulado se reimprime marcado. Una
 * REIMPRESIÓN lleva la fecha y, debajo de cada renglón, lo que ya llegó y lo que no va a llegar: es la hoja
 * con la que se reclama, y sin eso la farmacia volvería a entregar lo recibido (revisión de ingeniería, 10).
 * Se portalea a <body> con `.spira-print-doc`, el mismo mecanismo que las hojas de Estadísticas.
 */

export interface DatosHoja {
  numero: number
  estudio: { code: string; name: string }
  periodo: Periodo
  /** Día de emisión (hora AR). */
  emitidoEl: string
  emitidoPor: string | null
  anulado: boolean
  /** El día de la reimpresión; null en la primera, que sale al emitir. */
  reimpresion: string | null
  /** `nota`: «recibido 5 · falta 1», «no va a llegar»… null si no llegó nada (o es la primera). */
  renglones: { nombre: string; presentacion: string | null; pedido: number; nota: string | null }[]
}

/** La hoja para REIMPRIMIR un pedido ya emitido. La primera la arma «Armar pedido» con lo que se emitió. */
export function datosDeHoja(p: PedidoMedicacion, estudio: { code: string; name: string }, hoy: string): DatosHoja {
  return {
    numero: p.numero,
    estudio: { code: estudio.code, name: estudio.name },
    periodo: { desde: p.periodo_desde, hasta: p.periodo_hasta },
    emitidoEl: p.emitido_el,
    emitidoPor: p.emitido_por_nombre,
    anulado: p.estado === 'anulado',
    reimpresion: hoy,
    renglones: p.renglones.map((r) => ({ nombre: r.medication_name, presentacion: r.presentacion, pedido: r.pedido, nota: notaDeReimpresion(r) })),
  }
}

/** Mismo mecanismo que Estadísticas: se monta la hoja y recién en el efecto siguiente se imprime. */
export function useImpresion(): { hoja: DatosHoja | null; imprimir: (d: DatosHoja) => void } {
  const [hoja, setHoja] = useState<DatosHoja | null>(null)
  useEffect(() => {
    if (!hoja) return
    const t = window.setTimeout(() => { window.print(); setHoja(null) }, 60)
    return () => window.clearTimeout(t)
  }, [hoja])
  return { hoja, imprimir: setHoja }
}

const celda = (extra: CSSProperties = {}): CSSProperties => ({ ...tdImpresa, padding: '12px 8px 12px 0', ...extra })
const PUNTEADA: CSSProperties = { borderBottom: '1px dotted #bbb' }

export function HojaPedido({ d }: { d: DatosHoja | null }) {
  if (!d) return null
  const total = d.renglones.reduce((s, r) => s + r.pedido, 0)
  return createPortal(
    <div className="spira-print-doc" aria-hidden="true">
      <Membrete />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 10 }}>
        <b style={{ fontSize: 13, letterSpacing: '0.07em' }}>
          PEDIDO DE MEDICACIÓN{d.anulado ? ' · ANULADO' : ''}{d.reimpresion ? ` · REIMPRESIÓN · ${diaMes(d.reimpresion)}` : ''}
        </b>
        <span className="spira-mono" style={{ marginLeft: 'auto', fontFamily: 'var(--spira-font-display)', fontSize: 26, fontWeight: 800 }}>Nº {d.numero}</span>
      </div>
      {d.anulado && (
        <div style={{ margin: '0 0 12px', padding: '8px 12px', border: '2px solid #000', fontSize: 12, fontWeight: 700 }}>
          Este pedido está anulado: no se entrega.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 18 }}>
        <tbody>
          <FilaKv k="Estudio" v={`${d.estudio.code} · ${d.estudio.name}`} />
          <FilaKv k="Para el período" v={`${formatAR(d.periodo.desde)} al ${formatAR(d.periodo.hasta)}`} />
          <FilaKv k="Emitido" v={`${formatAR(d.emitidoEl)}${d.emitidoPor ? ` · ${d.emitidoPor}` : ''}`} />
        </tbody>
      </table>
      <table style={tablaImpresa}>
        <thead>
          <tr>
            <th style={{ ...thImpresa, width: '32%' }}>Medicamento</th>
            <th style={{ ...thImpresa, width: '14%' }}>Presentación</th>
            <th style={{ ...thImpresa, width: '9%', textAlign: 'right' }}>Pedido</th>
            <th style={{ ...thImpresa, width: '13%', paddingLeft: 18 }}>Entregado</th>
            <th style={{ ...thImpresa, width: '16%', paddingLeft: 12 }}>Lote</th>
            <th style={{ ...thImpresa, width: '16%', paddingLeft: 12 }}>Vence</th>
          </tr>
        </thead>
        <tbody>
          {d.renglones.map((r) => (
            <Fragment key={`${r.nombre}·${r.presentacion ?? ''}`}>
              <tr>
                <td style={celda(PUNTEADA)}>
                  <b>{r.nombre}</b>
                  {r.nota && <div style={{ fontSize: 10.5, marginTop: 3 }}>{r.nota}</div>}
                </td>
                <td style={celda(PUNTEADA)}>{r.presentacion ?? '—'}</td>
                <td style={celda({ ...PUNTEADA, textAlign: 'right' })}><b className="spira-mono">{r.pedido}</b></td>
                <td style={celda({ ...PUNTEADA, paddingLeft: 18 })} />
                <td style={celda({ ...PUNTEADA, paddingLeft: 12 })} />
                <td style={celda({ ...PUNTEADA, paddingLeft: 12 })} />
              </tr>
              <tr>
                <td style={celda()} /><td style={celda()} /><td style={celda()} />
                <td style={celda({ paddingLeft: 18 })} /><td style={celda({ paddingLeft: 12 })} /><td style={celda({ paddingLeft: 12 })} />
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, marginTop: 8 }}>
        Total pedido: <b className="spira-mono">{total} {total === 1 ? 'envase' : 'envases'}</b> de {d.renglones.length} {d.renglones.length === 1 ? 'medicamento' : 'medicamentos'}. Si un medicamento llega en dos lotes, usá el segundo renglón.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 40, marginTop: 64 }}>
        <div style={{ borderTop: '1px solid #000', paddingTop: 5, fontSize: 10 }}>Entregó (farmacia) · firma y aclaración</div>
        <div style={{ borderTop: '1px solid #000', paddingTop: 5, fontSize: 10 }}>Recibió · firma y aclaración</div>
      </div>
      <div style={{ marginTop: 22, padding: '9px 12px', border: '1px solid #000', fontSize: 11, fontWeight: 700 }}>
        Devolver esta hoja junto con la medicación. En Recepción se recibe con el número del pedido.
      </div>
      <PieDePagina emitidoEn={new Date().toISOString()} />
    </div>,
    document.body,
  )
}
