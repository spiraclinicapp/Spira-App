import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { Badge } from '../../../components/Badge'
import { formatDayMonthYear, todayISO } from '../../../lib/dates'
import type { ReceptionRow } from '../../../data/pharma'
import { ESTADO_CFG, estadoFromExpiry } from '../expiryState'
import { KIND_CHIP } from './ambitos'

/**
 * Una recepción en la lista: cabecera con lo que llegó y, debajo, el detalle por renglón.
 *
 * Extraída de `RecepcionView.tsx` sin cambios de comportamiento (misma estructura, mismos
 * estilos) para que el reskin del handoff "2c" se escriba sobre un archivo que hace una sola
 * cosa. Mismo criterio que `views/pharma/dispensaciones/`.
 */
export function ReceptionCard({ r, canManage, busy, highlight, accentSolid, onVerify }: {
  r: ReceptionRow
  canManage: boolean
  busy: boolean
  highlight: boolean
  accentSolid: string
  onVerify: () => void
}) {
  const verificada = r.status === 'verificada'
  const kind = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const esIp = r.tipo === 'investigacion'
  // Las recepciones IP no tienen reception_items: llevan la cantidad total de kits (macro, 0038).
  const kits = r.total_kits ?? 0
  const totalItems = esIp ? kits : r.items.reduce((s, it) => s + it.quantity, 0)
  const first = esIp ? 'Producto de Investigación' : (r.items[0]?.medication?.name ?? '—')
  const extra = esIp ? 0 : r.items.length - 1
  // Hoy (ISO local) para el estado de vencimiento de cada renglón (forma+color vía ESTADO_CFG).
  const hoyISO = todayISO()

  const cardStyle: CSSProperties = {
    ...rowCard,
    ...(highlight ? { boxShadow: 'var(--spira-shadow-sm)', borderColor: accentSolid } : {}),
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={iconSq}>
          <Icon name={esIp ? 'flask' : 'pill'} size={20} color="var(--spira-pharma-solid)" stroke={1.9} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {first}
            {extra > 0 && <span style={{ color: 'var(--spira-muted)', fontWeight: 500 }}> +{extra} más</span>}
          </div>
          {(r.protocol || r.notes) && (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.protocol && <span className="spira-mono" style={{ color: 'var(--spira-pharma-solid)' }}>{r.protocol.code}</span>}
              {r.notes && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.protocol ? '· ' : ''}{r.notes}</span>}
            </div>
          )}
        </div>
        <Badge color={kind.color} bg={kind.bg} dot>{kind.label}</Badge>
        <Badge tone={verificada ? 'good' : 'warn'}>{verificada ? 'Verificada' : 'Pendiente'}</Badge>
        <div style={{ textAlign: 'right', minWidth: 64, whiteSpace: 'nowrap' }}>
          <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 18 }}>{totalItems}</span>
          <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
            {' '}{esIp ? (totalItems === 1 ? 'kit' : 'kits') : (totalItems === 1 ? 'ítem' : 'ítems')}
          </span>
        </div>
        {canManage && !verificada && (
          <button onClick={onVerify} disabled={busy} style={{ ...verifyBtn, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="check" size={15} color="var(--spira-on-accent)" /> {busy ? 'Verificando…' : 'Verificar'}
          </button>
        )}
      </div>
      {r.items.length > 0 && (
        <div style={lotsPanelWrap}>
          <div style={lotsPanel}>
            <div style={{ ...lotRow, ...lotHead }}>
              <span style={{ justifySelf: 'start' }}>Medicamento</span><span>Código</span><span>Lote</span>
              <span>Vence</span><span>Laboratorio</span><span>Cant.</span>
            </div>
            {r.items.map((it) => {
              const est = estadoFromExpiry(it.expiry_date, hoyISO)
              const cfg = ESTADO_CFG[est]
              const ean = it.medication?.codes?.[0]?.code ?? ''
              return (
                <div key={it.id} style={lotRow}>
                  <span style={lotCell}>
                    <span style={lotName}>{it.medication?.name ?? '—'}</span>
                    {it.medication?.drug?.name && <span style={lotMeta}>{it.medication.drug.name}</span>}
                  </span>
                  <span style={lotBcCell}>
                    {ean
                      ? <span className="spira-mono" style={lotEan}>{ean}</span>
                      : <span style={lotEanEmpty}>— sin código —</span>}
                  </span>
                  <span><span style={lotTag} className="spira-mono">{it.lot_number}</span></span>
                  <span
                    style={{ ...lotVence, color: cfg.color }}
                    title={cfg.label}
                    aria-label={`Vencimiento ${it.expiry_date ? formatDayMonthYear(it.expiry_date) : 'sin fecha'}, ${cfg.label}`}
                  >
                    {cfg.icon && <Icon name={cfg.icon} size={13} color={cfg.color} />}
                    <span className="spira-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {it.expiry_date ? formatDayMonthYear(it.expiry_date) : '—'}
                    </span>
                  </span>
                  <span>{it.medication?.laboratorio?.name && <span style={labChip}>{it.medication.laboratorio.name}</span>}</span>
                  <span style={lotQty}><b>{it.quantity}</b><span style={lotQtyUnit}>u.</span></span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Borde en longhands, NO en la abreviada: el `highlight` pisa solo `borderColor` por spread
// condicional y al apagarse React borra esa longhand — con la abreviada el color caería a
// `currentColor` en vez de volver a la línea cálida. Ver `chipBtn` en SearchableSelect.tsx.
const rowCard: CSSProperties = { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)', borderRadius: 14, background: 'var(--spira-white)', padding: '13px 16px', boxShadow: 'var(--spira-shadow-sm)', transition: 'border-color 0.2s, box-shadow 0.2s' }
const iconSq: CSSProperties = { width: 40, height: 40, flex: '0 0 auto', borderRadius: 11, background: 'rgba(15, 95, 87,.13)', display: 'grid', placeItems: 'center' }
const verifyBtn: CSSProperties = {
  height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13,
  display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
}

// ── Panel de detalle por renglón (Medicamento · Código · Lote · Vence · Laboratorio · Cant.) ──
// El wrap scrollea en horizontal en ventanas angostas (min-width del panel) en vez de aplastar
// las columnas: no se esconde ningún dato (vista auditable). Vencimiento con forma+color vía ESTADO_CFG.
const lotsPanelWrap: CSSProperties = { marginTop: 14, marginBottom: 2, overflowX: 'auto' }
const lotsPanel: CSSProperties = { minWidth: 680, border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-surface)', overflow: 'hidden' }
const lotRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.8fr 1.1fr 0.85fr 1.1fr 1fr 0.6fr',
  alignItems: 'center', justifyItems: 'center', gap: 18, padding: '13px 20px', fontSize: 13,
  borderTop: '1px solid var(--spira-line)',
}
const lotHead: CSSProperties = { borderTop: 'none', background: 'var(--spira-white)', padding: '11px 20px', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--spira-faint)', fontWeight: 700 }
const lotCell: CSSProperties = { minWidth: 0, justifySelf: 'start', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }
const lotName: CSSProperties = { maxWidth: '100%', color: 'var(--spira-ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotMeta: CSSProperties = { maxWidth: '100%', fontSize: 11, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotBcCell: CSSProperties = { justifySelf: 'center' }
const lotEan: CSSProperties = { fontSize: 12.5, letterSpacing: '0.03em', color: 'var(--spira-ink)', fontVariantNumeric: 'tabular-nums' }
const lotEanEmpty: CSSProperties = { fontSize: 11.5, color: 'var(--spira-faint)' }
const lotTag: CSSProperties = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 7, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', fontSize: 12.5, fontWeight: 500, color: 'var(--spira-ink)', width: 'max-content' }
const lotVence: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const labChip: CSSProperties = { maxWidth: '100%', display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 11px', borderRadius: 999, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', fontSize: 11.5, fontWeight: 500, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const lotQty: CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const lotQtyUnit: CSSProperties = { color: 'var(--spira-faint)', fontSize: 11.5, marginLeft: 2 }
