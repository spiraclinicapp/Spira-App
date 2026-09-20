import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { todayISO } from '../lib/dates'
import { CajaDePedido } from './CajaDePedido'
import { detectarMovimientos, instantanea } from './avisosPedidos'
import type { Instantanea, Movimiento } from './avisosPedidos'
import type { PedidoAviso } from '../data/pharma/dispensationModel'

/**
 * Los avisos de movimiento de un pedido de dispensación.
 *
 * ES LA MISMA CARD DE LA CAMPANA, FLOTANDO. El Director lo pidió así: «que se abra un popup con una
 * vista muy parecida a la de la notificación». No es un capricho estético — un aviso que se ve
 * igual que la fila del panel no hay que aprenderlo dos veces, y al tocarlo lleva al mismo lado.
 * Por eso la card vive en `CajaDePedido` y no acá: dos copias se separarían en el primer retoque.
 *
 * VIVE EN EL SHELL, no en una vista, porque el sentido entero del aviso es enterarte de que tu
 * pedido está listo —o de que entró uno nuevo— mientras estás haciendo otra cosa.
 *
 * SE PORTALEA A `document.body`. Un `position: fixed` adentro de un ancestro con `backdrop-filter`
 * deja de medirse contra la ventana y aterriza en cualquier lado; ya nos pasó con los popovers.
 *
 * ABAJO A LA DERECHA y no al pie centrado, que es donde vive el `Toast` de confirmación
 * ("comprobante N° 1044 generado"): son dos avisos distintos —uno confirma lo que hiciste, el otro
 * te cuenta lo que hizo otro— y en el mismo lugar se pisan.
 */

/** Cuántos se ven a la vez. El resto espera su turno, anunciado por el contador. */
const MAX_VISIBLES = 3

/**
 * Cuánto dura cada aviso, en ms.
 *
 * TREINTA SEGUNDOS, y es una decisión del Director. Un toast de confirmación vive 2,4 s porque
 * confirma algo que acabás de hacer y ya estás mirando; esto te avisa de algo que hizo otra
 * persona, mientras estabas en otra pantalla. Si se fuera en tres segundos, el aviso llegaría sólo
 * para quien justo estaba mirando la esquina.
 */
const DURACION_MS = 30_000

const claveDe = (m: Movimiento) => `${m.pedido.id}:${m.estado}`

export function AvisosDePedidos({ pedidos, uid, enPantallaDelTablero, onAbrir }: {
  /** `null` mientras la consulta no volvió. */
  pedidos: PedidoAviso[] | null
  uid: string | null
  /** Parado en el tablero de Dispensaciones el aviso no salta: la pantalla ya lo está diciendo. */
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
    /* La foto se actualiza SIEMPRE, incluso cuando el aviso no se muestra: si no, al salir del
       tablero caerían de golpe todos los movimientos que pasaron mientras lo mirabas. */
    anterior.current = instantanea(pedidos)
    if (movimientos.length === 0 || enPantallaDelTablero) return
    setCola((previa) => [...previa, ...movimientos])
  }, [pedidos, uid, enPantallaDelTablero])

  const visibles = cola.slice(0, MAX_VISIBLES)
  const esperando = cola.length - visibles.length

  if (visibles.length === 0) return null

  const sacar = (m: Movimiento) => setCola((c) => c.filter((x) => claveDe(x) !== claveDe(m)))
  const hoy = todayISO()

  return createPortal(
    <div style={pila} role="status" aria-live="polite">
      {/* El contador va ARRIBA de la pila: es lo que falta ver, y abajo lo taparía el próximo. */}
      {esperando > 0 && <div style={resto}>y {esperando} más</div>}
      {visibles.map((m) => (
        <Aviso
          key={claveDe(m)}
          movimiento={m}
          hoy={hoy}
          onAbrir={() => { sacar(m); onAbrir(m.pedido) }}
          onCerrar={() => sacar(m)}
        />
      ))}
    </div>,
    document.body,
  )
}

/**
 * Un aviso y su reloj.
 *
 * El temporizador vive acá adentro, uno por aviso: si lo llevara la pila, el primero en vencer
 * arrastraría a los que entraron después. Se pausa con el mouse encima, por si el aviso trae un
 * dato que hay que leer con calma — es lo mismo que hace el `Toast` de la casa.
 */
function Aviso({ movimiento, hoy, onAbrir, onCerrar }: {
  movimiento: Movimiento
  hoy: string
  onAbrir: () => void
  onCerrar: () => void
}) {
  const [pausado, setPausado] = useState(false)

  useEffect(() => {
    if (pausado) return
    const t = setTimeout(onCerrar, DURACION_MS)
    return () => clearTimeout(t)
  }, [pausado, onCerrar])

  return (
    <div
      style={caja}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
    >
      <CajaDePedido
        pedido={movimiento.pedido}
        /* «Pedido nuevo» es el rótulo de Farmacia, y un pedido que ENTRA sólo puede estar
           solicitado: ese es exactamente el movimiento que Farmacia recibe. */
        comoFarmacia={movimiento.estado === 'solicitada'}
        hoy={hoy}
        abrir={onAbrir}
        onCerrar={onCerrar}
      />
    </div>
  )
}

/* `pointer-events: none` en el contenedor y `auto` en cada aviso: así la columna vacía entre
   avisos no le roba clicks a la pantalla de atrás. */
const pila: CSSProperties = {
  position: 'fixed', right: 22, bottom: 22, zIndex: 95,
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
  pointerEvents: 'none',
}

/* El ancho es el de la lista del panel (440 − 2×10 de padding): la card usa la misma grilla, así
   que con otro ancho las columnas caerían en otro lado y el parecido se perdería justo en lo que
   lo sostiene. La sombra es lo único que la separa del panel — acá flota sobre la pantalla. */
const caja: CSSProperties = {
  pointerEvents: 'auto',
  width: 420,
  maxWidth: 'calc(100vw - 44px)',
  borderRadius: 10,
  boxShadow: 'var(--spira-shadow-lg)',
}

const resto: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontSize: 11.5, color: 'var(--spira-muted)',
}
