import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { btnOutline } from '../../../components/buttons'
import { armarPorRecibir, pastillaDePedido, porRecibirDe, textoDeRecepciones, textoParaRecibir, usePedidosPorRecibir } from '../../../data/pharma'
import type { PedidoPorRecibir } from '../../../data/pharma'
import { AvisoLinea, Pastilla, errorTexto, minuscula } from '../reposicion/piezas'

/**
 * «Recibir un pedido» (R10, mocks «6b» y «Recibir sin pedidos»): los pedidos con algo por recibir, del más
 * viejo al más nuevo. Se busca el número que viene en la hoja (el código de barras quedó en TODOS.md). Un
 * pedido con una recepción sin verificar lo avisa, para no recibirlo dos veces (RD17), y si esa recepción
 * ya trae todo lo que faltaba no ofrece «Recibir»: se verifica, no se vuelve a cargar (revisión de
 * ingeniería, 8). «Recibir» va con
 * borde, no sólido (RD16): en esta lista cada renglón es una opción, no la acción principal.
 */
export function RecibirPedido({ accentSolid, onClose, onRecibir }: {
  accentSolid: string
  onClose: () => void
  onRecibir: (x: PedidoPorRecibir) => void
}) {
  const q = usePedidosPorRecibir()
  const lista = q.data ? armarPorRecibir(q.data) : null
  const vacia = lista !== null && lista.length === 0

  return (
    <Modal title="Recibir un pedido" onClose={onClose} maxWidth={vacia ? 520 : 620}>
      {q.error ? (
        <>
          <p role="alert" style={errorTexto}>{q.error}</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={q.refetch} style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="rotateCcw" size={15} />Reintentar
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </>
      ) : !lista ? (
        <p style={{ fontSize: 13.5, color: 'var(--spira-muted)', margin: 0 }}>Buscando los pedidos…</p>
      ) : vacia ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0 4px' }}>
            <span style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(15, 95, 87, 0.08)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Icon name="truck" size={22} stroke={1.9} color={accentSolid} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, color: 'var(--spira-ink)' }}>No hay pedidos por recibir</div>
              <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.45 }}>
                Los pedidos se arman desde Reposición. Si llegó medicación sin pedido, cargala con «Nueva recepción».
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 18 }}>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 6px', lineHeight: 1.45 }}>
            Los pedidos con algo por recibir, del más viejo al más nuevo. Buscá el número que figura en la hoja.
          </p>
          {lista.map((x, i) => {
            const folios = x.pedido.recepciones.filter((r) => r.status === 'pendiente').map((r) => r.folio)
            const cuales = folios.length === 0 ? 'una recepción' : `${folios.length === 1 ? 'la' : 'las'} ${minuscula(textoDeRecepciones(folios))}`
            const llegoTodo = porRecibirDe(x.pedido) === 0
            return (
              <div key={x.pedido.id} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) auto', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: i === lista.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
                <span className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 15, color: 'var(--spira-ink)' }}>Pedido Nº {x.pedido.numero}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="spira-mono" style={{ fontSize: 14, fontWeight: 700, color: accentSolid }}>{x.estudio.code}</span>
                    <span style={{ fontSize: 13.5, color: 'var(--spira-ink)' }}>{x.estudio.name}</span>
                    <Pastilla p={pastillaDePedido(x.pedido)} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', marginTop: 3 }}>{textoParaRecibir(x.pedido)}</div>
                  {x.pedido.conRecepcionSinVerificar && (
                    <div style={{ marginTop: 4 }}>
                      <AvisoLinea tono="warn" texto={llegoTodo
                        ? `Lo que faltaba está en ${cuales} sin verificar: se verifica desde la lista de Recepción.`
                        : `Ya tiene ${cuales} sin verificar: se precarga sólo lo que no está ahí.`} />
                    </div>
                  )}
                </div>
                {llegoTodo ? <span /> : (
                  <button type="button" onClick={() => onRecibir(x)} style={{ ...btnOutline, height: 36, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="truck" size={15} />Recibir
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}
    </Modal>
  )
}
