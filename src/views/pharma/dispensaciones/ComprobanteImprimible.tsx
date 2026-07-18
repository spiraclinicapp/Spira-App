import type { CSSProperties } from 'react'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { formatAR, formatDateTimeAR } from '../../../lib/dates'

/**
 * La hoja del comprobante. NO es la pantalla impresa: es un documento propio que solo existe bajo
 * `@media print` (las reglas viven en tokens.css, bloque "impresión del comprobante").
 *
 * El comprobante ES la nota fuente: se imprime, se sella y se firma junto con la medicación al
 * momento del retiro, y va a la carpeta del paciente. Por eso:
 *   · el paciente se identifica por CÓDIGO IVRS, nunca por nombre (privacidad transversal);
 *   · lote y vencimiento salen del snapshot de `dispensation_items`, que se copia justamente para
 *     que el papel no cambie si el lote se modifica después;
 *   · el espacio de sello y firma es el punto del documento, no un adorno;
 *   · negro sobre blanco: la paleta Sereno es para pantalla, esto sale en una láser monocromo.
 */
export function ComprobanteImprimible({ r, disp }: {
  r: DispensationRequestRow
  disp: DispensationRow
}) {
  const paciente = r.visit?.enrollment?.patient?.code ?? '—'
  const protocolo = r.visit?.enrollment?.protocol?.code ?? '—'

  return (
    <div className="spira-print-only" aria-hidden="true">
      <div style={head}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700 }}>
          Spira · Fundación Scherbovsky
        </div>
        <div style={{ fontSize: 11 }}>Farmacia de investigación</div>
      </div>

      <div style={titleRow}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em' }}>
          COMPROBANTE DE DISPENSACIÓN
        </span>
        <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 22, fontWeight: 700 }}>
          N° {disp.correlative_number}
        </span>
      </div>

      <table style={meta}>
        <tbody>
          <tr>
            <td style={label}>Paciente</td><td style={value}>{paciente}</td>
            <td style={label}>Protocolo</td><td style={value}>{protocolo}</td>
          </tr>
          <tr>
            <td style={label}>Dispensación</td><td style={value}>{disp.dispensation_code ?? '—'}</td>
            <td style={label}>Origen</td><td style={value}>{r.source === 'manual' ? 'Coordinación' : r.source}</td>
          </tr>
          <tr>
            <td style={label}>Fecha</td>
            {/* Entregada → fecha y hora reales del retiro. Todavía no → la fecha de impresión,
                que es lo único cierto en ese momento (el comprobante se imprime antes de entregar). */}
            <td style={value} colSpan={3}>
              {disp.delivered_at ? formatDateTimeAR(disp.delivered_at) : formatDateTimeAR(new Date().toISOString())}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginTop: 16, marginBottom: 6 }}>
        MEDICACIÓN ENTREGADA
      </div>
      <div style={{ borderTop: '1px solid #000' }}>
        {disp.items.map((l) => (
          <div key={l.id} style={itemRow}>
            <div style={{ fontWeight: 600 }}>{l.medication?.name ?? 'Medicamento'}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>
              lote {l.lot_number ?? '—'}
              {l.expiry_date && ` · vence ${formatAR(l.expiry_date)}`}
              {' · '}{l.quantity} u.
            </div>
          </div>
        ))}
      </div>

      <div style={firmas}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, marginBottom: 34 }}>Dispensó</div>
          <div style={linea} />
          <div style={{ fontSize: 10 }}>aclaración y sello</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, marginBottom: 34 }}>Retiró</div>
          <div style={linea} />
          <div style={{ fontSize: 10 }}>aclaración y firma</div>
        </div>
      </div>
    </div>
  )
}

const head: CSSProperties = { borderBottom: '1px solid #000', paddingBottom: 8, marginBottom: 14 }

const titleRow: CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
  borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 12,
}

const meta: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 }
const label: CSSProperties = { padding: '3px 10px 3px 0', fontSize: 11, whiteSpace: 'nowrap' }
const value: CSSProperties = { padding: '3px 22px 3px 0', fontWeight: 600 }

const itemRow: CSSProperties = { padding: '7px 0', borderBottom: '1px solid #999', fontSize: 12 }

const firmas: CSSProperties = { display: 'flex', gap: 40, marginTop: 40 }
const linea: CSSProperties = { borderTop: '1px solid #000', marginBottom: 4 }
