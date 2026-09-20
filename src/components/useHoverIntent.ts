import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Abrir y cerrar un panel que aparece al APUNTAR, con la pausa de gracia que pide WCAG 2.1 AA
 * (1.4.13, «Content on Hover or Focus»).
 *
 * Sin la pausa, un panel que se cierra en el `mouseleave` del disparador es inalcanzable: al cruzar
 * los pocos píxeles de hueco hasta el panel, el panel ya no está. Con ella, el panel sobrevive un
 * instante y su propio `mouseenter` cancela el cierre, así se puede entrar a leerlo o a scrollearlo.
 *
 * Salió de `InfoTip`, que lo estrenó, y ahora lo comparte con el listado de procedimientos del
 * Resumen de la visita. Dos copias de este timer derivan en dos comportamientos distintos: una que
 * se deja entrar y otra que no.
 *
 * El timer NO sobrevive al desmontaje: un `setState` sobre un componente que ya no está es un aviso
 * en consola y, peor, esconde que el panel quedó vivo un instante de más (pasa al cambiar de día en
 * la lista, que desmonta las filas con el mouse encima).
 */
export const GRACIA_MS = 140

export interface HoverIntent {
  abierto: boolean
  /** Abre ya, cancelando un cierre en curso. */
  abrir: () => void
  /** Cierra ya (Esc, blur, clic afuera). */
  cerrar: () => void
  /** Cierra después de la gracia, para poder entrar al panel. */
  cerrarConGracia: () => void
  /** Lo llama el PANEL en su `mouseenter`: el mouse llegó, no hay que cerrar. */
  cancelarCierre: () => void
  /** Para el clic del disparador (en una tablet no hay `hover`). */
  alternar: () => void
}

export function useHoverIntent(graciaMs: number = GRACIA_MS): HoverIntent {
  const [abierto, setAbierto] = useState(false)
  const timer = useRef<number | null>(null)

  const cancelarCierre = useCallback(() => {
    if (timer.current != null) { window.clearTimeout(timer.current); timer.current = null }
  }, [])

  const cerrar = useCallback(() => { cancelarCierre(); setAbierto(false) }, [cancelarCierre])

  const cerrarConGracia = useCallback(() => {
    cancelarCierre()
    timer.current = window.setTimeout(() => { timer.current = null; setAbierto(false) }, graciaMs)
  }, [cancelarCierre, graciaMs])

  const abrir = useCallback(() => { cancelarCierre(); setAbierto(true) }, [cancelarCierre])

  const alternar = useCallback(() => {
    cancelarCierre()
    setAbierto((v) => !v)
  }, [cancelarCierre])

  useEffect(() => cancelarCierre, [cancelarCierre])

  return { abierto, abrir, cerrar, cerrarConGracia, cancelarCierre, alternar }
}
