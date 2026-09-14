import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { DispensationRequestRow } from '../../data/pharma'
import { historialPlegado } from './historialPlegadoModel'
import { pillBase } from './panelDispensacion'

const pieStyle: CSSProperties = {
  marginTop: 14, paddingTop: 11, borderTop: '1px solid var(--spira-line)',
  display: 'flex', flexDirection: 'column', gap: 9,
}
const toggleBtn: CSSProperties = {
  flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent',
  border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600,
  fontSize: 12.5, color: 'var(--spira-muted)',
}

/**
 * El historial de pedidos de la visita, plegado en una línea al pie de la tarjeta (plan D17).
 *
 * VA ÚLTIMO (D19): lo que ya pasó, después de todo lo que se está haciendo. Antes era una subsección
 * con una tarjeta completa por pedido y «Ver N más», y quedaba pegada al botón suelto del IP fuera de
 * cronograma, con la misma caja blanca: se leían como la misma cosa.
 *
 * Desplegado, un renglón por pedido en UNA sola caja. El texto del medio se corta con puntos
 * suspensivos; la fecha, el comprobante y el estado nunca. Con un rechazo vigente abre desplegado y
 * el motivo va en una segunda línea (reglas en `historialPlegadoModel.ts`).
 *
 * Mientras la primera lectura no vuelve no hay línea: sin pedidos no hay nada que resumir, y una
 * línea que aparece y cambia es peor que una que aparece una vez.
 */
export function HistorialPlegado({ requests }: { requests: readonly DispensationRequestRow[] }) {
  /** `null` = lo que diga la regla (desplegado con un rechazo vigente); después manda la mano. */
  const [abierto, setAbierto] = useState<boolean | null>(null)
  const h = historialPlegado(requests)
  if (!h) return null
  const desplegado = abierto ?? h.abiertoDeEntrada

  return (
    <div style={pieStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{h.resumen}</span>
        <button
          type="button" aria-expanded={desplegado} onClick={() => setAbierto(!desplegado)} style={toggleBtn}
        >
          {desplegado ? 'Ocultar' : 'Ver historial'}
          <Icon name={desplegado ? 'chevronUp' : 'chevronDown'} size={14} color="var(--spira-muted)" />
        </button>
      </div>

      {desplegado && (
        <div style={{ border: '1px solid var(--spira-line)', borderRadius: 11, background: 'var(--spira-white)', overflow: 'hidden' }}>
          {h.renglones.map((r, i) => (
            <div key={r.id} style={{ padding: '9px 12px', borderTop: i === 0 ? undefined : '1px solid var(--spira-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span className="spira-mono" style={{ flex: '0 0 auto', width: 40, fontSize: 12, color: 'var(--spira-muted)' }}>{r.fecha}</span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.que}>
                  {r.que}
                </span>
                {r.comprobante !== null && (
                  <span className="spira-mono" style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--spira-muted)' }}>N° {r.comprobante}</span>
                )}
                <span style={{ ...pillBase, color: r.badge.color, background: r.badge.tint }}>{r.badge.label}</span>
              </div>
              {r.motivo && (
                <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 3, paddingLeft: 50 }}>{r.motivo}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
