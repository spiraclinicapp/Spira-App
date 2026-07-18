import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { DispensationLineRow, RequestItemRow } from '../../../data/pharma'

/**
 * Fila de un renglón, compartida por los cuatro paneles del cajón.
 *
 * Dos fuentes distintas según el momento:
 *   · Mientras se prepara → `RequestItemRow` (lo PEDIDO). El lote todavía no se eligió, así que
 *     dice "por asignar (FEFO)": es la verdad, no un placeholder.
 *   · Desde que está lista → `DispensationLineRow` (lo PREPARADO), con lote y vencimiento reales
 *     tomados del snapshot que se imprime en el comprobante.
 */
export function ItemRow({ name, dosis, quantity, lot, scanned, onUnscan }: {
  name: string
  dosis: string | null
  quantity: number
  /** Lote real, o null si todavía no se asignó (se muestra la leyenda FEFO). */
  lot: string | null
  /** null = esta fila no participa del escaneo (paneles de lista/entregada/rechazada). */
  scanned: boolean | null
  onUnscan?: () => void
}) {
  const ok = scanned === true
  return (
    <div style={{ ...row, background: ok ? OK_TINT : 'var(--spira-white)' }}>
      <span style={{ color: ok ? 'var(--spira-good)' : 'var(--spira-faint)', flex: '0 0 auto', display: 'flex' }}>
        <Icon name={ok ? 'check' : 'barcode'} size={16} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>{name}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 2 }}>
          {dosis && <span>{dosis}</span>}
          {dosis && <span style={dot} />}
          <span className="spira-mono">{lot ? `lote ${lot}` : '— por asignar (FEFO)'}</span>
        </div>
      </div>

      <span className="spira-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--spira-ink)', flex: '0 0 auto' }}>
        {quantity}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--spira-muted)' }}> u.</span>
      </span>

      {scanned !== null && (
        <span style={{ fontSize: 11.5, color: ok ? 'var(--spira-good)' : 'var(--spira-muted)', flex: '0 0 auto', minWidth: 74, textAlign: 'right' }}>
          {ok ? 'Confirmado' : 'A escanear'}
        </span>
      )}

      {/* Corregir un escaneo equivocado sin tener que cancelar toda la preparación. */}
      {ok && onUnscan && (
        <button type="button" onClick={onUnscan} title="Deshacer este escaneo" aria-label={`Deshacer el escaneo de ${name}`} style={undoBtn}>
          <Icon name="x" size={14} color="var(--spira-muted)" />
        </button>
      )}
    </div>
  )
}

/** Adapta un renglón pedido (durante la preparación). */
export function fromRequestItem(i: RequestItemRow) {
  return {
    name: i.medication?.name ?? 'Medicamento',
    dosis: i.medication?.dosis ?? null,
    quantity: i.quantity,
    lot: null,
    scanned: i.scanned_at !== null,
  }
}

/** Adapta un renglón ya preparado (con lote real del snapshot). */
export function fromDispensationLine(l: DispensationLineRow) {
  return {
    name: l.medication?.name ?? 'Medicamento',
    dosis: null,
    quantity: l.quantity,
    lot: l.lot_number,
    scanned: null as boolean | null,
  }
}

const OK_TINT = 'rgba(92, 138, 90, 0.12)'

const row: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
  border: '1px solid var(--spira-line)', borderRadius: 10,
}

const dot: CSSProperties = {
  width: 3, height: 3, borderRadius: '50%', background: 'var(--spira-line-2)', flex: '0 0 auto',
}

const undoBtn: CSSProperties = {
  flex: '0 0 auto', width: 26, height: 26, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer',
}
