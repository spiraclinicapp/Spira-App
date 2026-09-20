import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Toast } from '../components/Toast'
import { badgeDeEstado } from '../views/pharma/dispensaciones/estados'
import { detectarMovimientos, instantanea, textoDeAviso } from './avisosPedidos'
import type { Instantanea, Movimiento } from './avisosPedidos'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Los popups de movimiento de un pedido de dispensación.
 *
 * VIVE EN EL SHELL, no en una vista, porque el sentido entero del aviso es enterarte de que tu
 * pedido está listo —o de que entró uno nuevo— mientras estás haciendo otra cosa.
 *
 * SE PORTALEA A `document.body`. Un `position: fixed` adentro de un ancestro con `backdrop-filter`
 * deja de medirse contra la ventana y aterriza en cualquier lado; ya nos pasó con los popovers.
 *
 * ABAJO A LA DERECHA y no al pie centrado, que es donde vive el `Toast` de confirmación
 * ("comprobante N° 1044 generado"). No es una preferencia estética: son dos avisos distintos —uno
 * confirma lo que hiciste, el otro te cuenta lo que hizo otro— y en el mismo lugar se pisan.
 *
 * Ver `docs/plan-avisos-de-pedidos.md` (D10, D11, D12).
 */

/** Cuántos se ven a la vez. El resto espera su turno, anunciado por el contador. */
const MAX_VISIBLES = 3
/** Más que el toast de confirmación (2,4 s): este aviso no lo provocaste vos y llega sin que lo mires. */
const DURACION_MS = 6000

const claveDe = (m: Movimiento) => `${m.pedido.id}:${m.estado}`

export function AvisosDePedidos({ pedidos, uid, enPantallaDelTablero, onAbrir }: {
  /** `null` mientras la consulta no volvió. */
  pedidos: PedidoAviso[] | null
  uid: string | null
  /** Parado en el tablero de Dispensaciones el popup no salta: la pantalla ya lo está diciendo. */
  enPantallaDelTablero: boolean
  onAbrir: (p: PedidoAviso) => void
}) {
  /* La foto anterior. `null` = todavía no se sembró, y eso es lo que hace que la primera carga no
     dispare nada. Va en un ref y no en estado: actualizarla no tiene que volver a renderizar. */
  const anterior = useRef<Instantanea | null>(null)
  const [cola, setCola] = useState<Movimiento[]>([])

  useEffect(() => {
    if (pedidos === null) return
    const movimientos = detectarMovimientos(anterior.current, pedidos, uid)
    /* La foto se actualiza SIEMPRE, incluso cuando el popup no se muestra: si no, al salir del
       tablero caerían de golpe todos los movimientos que pasaron mientras lo mirabas. */
    anterior.current = instantanea(pedidos)
    if (movimientos.length === 0 || enPantallaDelTablero) return
    setCola((previa) => [...previa, ...movimientos])
  }, [pedidos, uid, enPantallaDelTablero])

  const visibles = cola.slice(0, MAX_VISIBLES)
  const esperando = cola.length - visibles.length

  if (visibles.length === 0) return null

  const sacar = (m: Movimiento) => setCola((c) => c.filter((x) => claveDe(x) !== claveDe(m)))

  return createPortal(
    <div style={pila}>
      {/* El contador va ARRIBA de la pila: es lo que falta ver, y abajo quedaría tapado por el
          próximo toast que entre. */}
      {esperando > 0 && <div style={resto}>y {esperando} más</div>}
      {visibles.map((m) => {
        const { titulo, detalle } = textoDeAviso(m)
        const badge = badgeDeEstado(m.pedido.status, m.pedido.dispensacion)
        return (
          <Toast
            key={claveDe(m)}
            message={`${titulo} — ${detalle}`}
            duration={DURACION_MS}
            tono={{ icono: 'box', color: badge.color }}
            apilado
            onClick={() => { sacar(m); onAbrir(m.pedido) }}
            onDone={() => sacar(m)}
          />
        )
      })}
    </div>,
    document.body,
  )
}

/* `pointer-events: none` en el contenedor y `auto` en cada toast (lo pone `apilado`): así la
   columna vacía entre avisos no le roba clicks a la pantalla de atrás. */
const pila: CSSProperties = {
  position: 'fixed', right: 22, bottom: 22, zIndex: 95,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
  pointerEvents: 'none',
}

const resto: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontSize: 11.5, color: 'var(--spira-muted)',
}
