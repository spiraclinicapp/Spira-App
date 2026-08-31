import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export interface PopoverPos { top: number; left: number; width: number }

/* REGISTRO DE POPOVERS ABIERTOS — para que uno ANIDADO no cierre al de afuera.
 *
 * El cierre por click afuera se decide por CONTENCIÓN EN EL DOM (`contains`), y todos los popovers
 * de la casa se portalean a `document.body` (hizo falta: un ancestro con `backdrop-filter` los
 * dejaba aterrizando lejos del campo). Las dos cosas juntas rompen el caso ANIDADO: el desplegable
 * de mes/año del calendario es un `SearchableSelect` cuyo menú también vive en `body`, así que para
 * el popover del CALENDARIO ese click cae "afuera" y se cierra entero. Y como cierra en el
 * `mousedown`, la opción se desmonta antes de que llegue el `click`: el año ni siquiera se elegía,
 * y la única forma de cambiarlo era pasar mes por mes con los chevrones. Medido en el navegador el
 * 2026-08-31, igual en los dos calendarios (`DateField` y `DateRangeField`) y también en el mes.
 *
 * La contención por DOM no alcanza porque el parentesco real es el del ÁRBOL DE REACT, que el portal
 * corta. Así que lo anotamos: cada popover abierto queda acá junto a un getter de su disparador. Con
 * eso se reconstruye la cadena lógica —opción → menú que la contiene → disparador de ese menú →
 * popover que contiene a ese disparador → …— y el calendario descubre que el click era suyo. Guarda
 * solo popovers ABIERTOS: el ref callback los da de baja al desmontar.
 */
const abiertos = new Map<HTMLElement, () => HTMLElement | null>()

/** El popover registrado que contiene a `n`, si hay alguno. */
function popoverQueContiene(n: Node): HTMLElement | null {
  for (const nodo of abiertos.keys()) if (nodo.contains(n)) return nodo
  return null
}

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
    // El disparador se anota como GETTER y no por valor: React adjunta los refs de abajo hacia
    // arriba, así que en el commit del montaje `triggerRef.current` puede no estar puesto todavía.
    if (popNodeRef.current) abiertos.delete(popNodeRef.current)
    popNodeRef.current = node
    roRef.current?.disconnect()
    roRef.current = null
    if (node) {
      abiertos.set(node, () => triggerRef.current)
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
    /* ¿El click cae adentro mío, contando los popovers que abrieron mis descendientes? Se sube por
       la cadena lógica: si el nodo no está en mi caja, se busca el popover registrado que lo contiene
       y se salta a SU disparador, que sí puede vivir adentro mío (es el caso del mes/año del
       calendario). El tope de saltos es una red por si dos popovers llegaran a contenerse entre sí. */
    const adentro = (t: Node) => {
      let n: Node | null = t
      for (let salto = 0; salto < 8 && n; salto++) {
        if (triggerRef.current?.contains(n) || popNodeRef.current?.contains(n)) return true
        const pop = popoverQueContiene(n)
        n = pop ? abiertos.get(pop)?.() ?? null : null
      }
      return false
    }
    /** ¿Hay algún popover abierto que sea MÍO (su disparador vive adentro de mi caja)? */
    const conDescendienteAbierto = () => {
      for (const [nodo, dueño] of abiertos) {
        if (nodo === popNodeRef.current) continue
        const disparador = dueño()
        if (disparador && popNodeRef.current?.contains(disparador)) return true
      }
      return false
    }
    // Esc cierra el popover de ADENTRO, uno por vez: si tengo un desplegable propio abierto, se ocupa
    // él y yo me quedo. Sin esto, el mismo Esc que cerraba el mes/año se llevaba puesto el calendario.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !conDescendienteAbierto()) onCloseRef.current() }
    const onDown = (e: MouseEvent) => {
      if (adentro(e.target as Node)) return
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
