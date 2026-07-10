import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopoverPos { top: number; left: number; width: number }

/**
 * Popover posicionado `fixed` (no se recorta en modales con overflow): posición por
 * getBoundingClientRect del trigger, con flip hacia arriba si no entra abajo, reposición en
 * scroll/resize, y cierre por click afuera o Esc. `onClose` se lee por ref para que el efecto
 * dependa solo de [open, reposition] (identidad estable, como el SearchableSelect original).
 */
export function usePopover<T extends HTMLElement, P extends HTMLElement>(open: boolean, onClose: () => void, flip = true) {
  const triggerRef = useRef<T | null>(null)
  const popRef = useRef<P | null>(null)
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Por defecto debajo del trigger; si el popover no entra abajo (calendario alto cerca del borde
  // inferior), flip hacia arriba. Necesita una segunda medición post-render (raf) porque en el
  // primer cálculo el popover todavía no está montado (no se sabe su alto).
  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const ph = popRef.current?.offsetHeight ?? 0
    const pw = popRef.current?.offsetWidth ?? 0
    const below = r.bottom + 6
    // Flip hacia arriba solo si está habilitado (los dropdowns de mes/año del calendario lo apagan
    // para abrir SIEMPRE hacia abajo, así los dos —alto distinto— coinciden y no tapan el formulario).
    const flipUp = flip && ph > 0 && below + ph > window.innerHeight - 8 && r.top - 6 - ph >= 8
    // Alineado al borde izquierdo del disparador; pero si el menú es más ancho que él (modo 'auto':
    // crece a su contenido) y se pasaría del borde derecho, se corre a la izquierda lo justo para
    // entrar (nunca antes del borde izquierdo de la ventana). Necesita el ancho real ya pintado (raf).
    const left = pw > 0 ? Math.max(8, Math.min(r.left, window.innerWidth - 8 - pw)) : r.left
    setPos({ top: flipUp ? r.top - 6 - ph : below, left, width: r.width })
  }, [flip])

  useEffect(() => {
    if (!open) return
    reposition()
    const raf = requestAnimationFrame(reposition) // re-medir con el alto real del popover ya pintado
    const onScroll = () => reposition()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return
      onCloseRef.current()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, reposition])

  return { triggerRef, popRef, pos }
}
