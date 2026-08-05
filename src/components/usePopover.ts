import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export interface PopoverPos { top: number; left: number; width: number }

/**
 * Popover posicionado `fixed` (no se recorta en modales con overflow): posición por
 * getBoundingClientRect del trigger, con flip hacia arriba si no entra abajo, reposición en
 * scroll/resize y ante cambios de tamaño del propio popover (ResizeObserver), y cierre por click
 * afuera o Esc. `onClose` se lee por ref para que el efecto dependa solo de [open, reposition]
 * (identidad estable, como el SearchableSelect original).
 */
export function usePopover<T extends HTMLElement, P extends HTMLElement>(open: boolean, onClose: () => void, flip = true) {
  const triggerRef = useRef<T | null>(null)
  const popNodeRef = useRef<P | null>(null)
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Por defecto debajo del trigger; si el popover no entra abajo (calendario alto cerca del borde
  // inferior), flip hacia arriba. Necesita una segunda medición post-render porque en el primer
  // cálculo el popover todavía no está montado (no se sabe su alto ni ancho reales).
  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const ph = popNodeRef.current?.offsetHeight ?? 0
    const pw = popNodeRef.current?.offsetWidth ?? 0
    const below = r.bottom + 6
    // Flip hacia arriba solo si está habilitado (los dropdowns de mes/año del calendario lo apagan
    // para abrir SIEMPRE hacia abajo, así los dos —alto distinto— coinciden y no tapan el formulario).
    const flipUp = flip && ph > 0 && below + ph > window.innerHeight - 8 && r.top - 6 - ph >= 8
    // Alineado al borde izquierdo del disparador; pero si el menú es más ancho que él (modo 'auto':
    // crece a su contenido) y se pasaría del borde derecho, se corre a la izquierda lo justo para
    // entrar (nunca antes del borde izquierdo de la ventana). Necesita el ancho real ya pintado.
    const left = pw > 0 ? Math.max(8, Math.min(r.left, window.innerWidth - 8 - pw)) : r.left
    setPos({ top: flipUp ? r.top - 6 - ph : below, left, width: r.width })
  }, [flip])

  // Ref callback en vez de un RefObject simple: en cuanto el popover se monta —con su tamaño real
  // ya calculable— remedimos ahí mismo, en fase de commit (antes de que el navegador pinte nada), y
  // dejamos un ResizeObserver observando su caja. Dos motivos, las dos causas del "se abre corrido /
  // pegado al borde y recién se acomoda al reabrir" que se veía en Visitas:
  //   1. La medición inicial ya no depende de un requestAnimationFrame (que puede demorarse o no
  //      dispararse con el documento oculto o throttleado); corre en el mismo commit del montaje.
  //   2. El popover CRECE unos px por su cuenta después de montar (react-day-picker acomoda su
  //      layout, y el webfont —Schibsted/Inter con display=swap— refluye el texto al cargar). Si
  //      medimos una sola vez, el `left` se recorta con un ancho más chico que el final y esos px de
  //      más lo empujan contra el borde (queda sin el margen de 8px, justo lo de las capturas). El
  //      ResizeObserver reposiciona en cuanto el tamaño real cambia, así el recorte usa el ancho
  //      definitivo. Reposition solo mueve el popover (top/left, position:fixed) sin cambiar su
  //      tamaño, así que no realimenta al observer.
  // El observer se administra ACÁ y solo acá (se desconecta cuando React llama al ref con null al
  // desmontar). No se lo toca desde el cleanup del efecto: bajo StrictMode, ese doble ciclo de
  // montaje desconectaba al observer vivo antes de su primer disparo y el reajuste nunca llegaba.
  const roRef = useRef<ResizeObserver | null>(null)
  const popRef = useCallback((node: P | null) => {
    popNodeRef.current = node
    roRef.current?.disconnect()
    roRef.current = null
    if (node) {
      reposition()
      const ro = new ResizeObserver(() => reposition())
      ro.observe(node)
      roRef.current = ro
    }
  }, [reposition])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const onScroll = () => reposition()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popNodeRef.current?.contains(t)) return
      onCloseRef.current()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('keydown', onKey)
    // En CAPTURA, no en burbuja: algún contenedor entre el click y `document` puede frenar el
    // mousedown con stopPropagation para no cerrarse él mismo (el modal de la visita hace justo eso
    // en su card, VisitDetail). En burbuja el listener nunca se enteraría y el popover quedaría
    // abierto al pulsar dentro del modal; en captura corre antes de esos handlers y el cierre afuera
    // se cumple siempre. El popover va portaleado a document.body, así que sus clicks igual entran
    // por `popNodeRef.contains` y no lo cierran.
    document.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open, reposition])

  return { triggerRef, popRef, pos }
}
