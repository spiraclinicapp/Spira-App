import { Icon } from '../../../components/Icon'
import { comparacionConElPedido, encabezadoDeLoEsperado, porRecibir } from '../../../data/pharma'
import type { PedidoMedicacion, PedidoPorRecibir } from '../../../data/pharma'
import type { CountedMed } from '../ReceptionWizard'
import { card } from '../reportes/estilos'
import { versalita } from '../reposicion/piezas'

const COLUMNAS = 'minmax(0, 1fr) 80px 80px minmax(0, 1.1fr)'

/** «Recibiendo el pedido Nº 14 · 222714 ENDURA», arriba del Escaneo y del Resumen (mocks «7» y «7b»). */
export function BannerPedido({ pedido, paso, accentSolid }: { pedido: PedidoPorRecibir; paso: number; accentSolid: string }) {
  const meds = pedido.pedido.renglones.filter((r) => porRecibir(r) > 0).length
  const texto = paso === 1
    ? `Vienen puestos ${meds === 1 ? 'el medicamento' : `los ${meds} medicamentos`} con lo que falta. Si llegó menos, bajá la cantidad: lo que falta queda en el pedido.`
    : 'Lo pedido contra lo que llega. Lo que falta queda en camino en el pedido.'
  return (
    <div style={{ ...card, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <Icon name="truck" size={17} color={accentSolid} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
          Recibiendo el pedido Nº {pedido.pedido.numero} · <span className="spira-mono" style={{ color: accentSolid }}>{pedido.estudio.code}</span> {pedido.estudio.name}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{texto}</div>
      </div>
    </div>
  )
}

/**
 * El resumen del asistente contra el pedido (RD18): lo que faltaba de cada renglón, lo que llega y qué queda.
 * Lo que llega y no estaba en el pedido se recibe igual y no cuenta para ningún renglón (R10). Si lo espera
 * otro pedido abierto del estudio, lo nombra (revisión de ingeniería, 9).
 */
export function ComparacionConPedido({ pedido, otros, meds }: {
  pedido: PedidoMedicacion
  /** Los otros pedidos abiertos del estudio (`PedidoPorRecibir.otrosDelEstudio`). */
  otros: readonly PedidoMedicacion[]
  meds: CountedMed[]
}) {
  const filas = comparacionConElPedido(pedido, meds.map((m) => ({ medicationId: m.medicationId, name: m.name, quantity: m.quantity })), otros)
  return (
    <div style={{ ...card, maxWidth: 780, width: '100%', margin: '0 auto', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, padding: '10px 18px 8px', borderBottom: '1px solid var(--spira-line-2)' }}>
        <div style={versalita}>Medicamento</div>
        <div style={{ ...versalita, textAlign: 'right' }}>{encabezadoDeLoEsperado(pedido)}</div>
        <div style={{ ...versalita, textAlign: 'right' }}>Llega</div>
        <div />
      </div>
      {filas.map((f, i) => (
        <div key={f.medicationId} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 10, alignItems: 'center', padding: '11px 18px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
          <span style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{f.nombre}</span>
          <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{f.esperado ?? '—'}</span>
          <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{f.llega}</span>
          <span style={{ fontSize: 12.5, color: f.aviso ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)', fontWeight: f.aviso ? 600 : 400 }}>{f.nota}</span>
        </div>
      ))}
    </div>
  )
}
