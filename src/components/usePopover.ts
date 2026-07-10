import { useCallback, useEffect, useRef, useState } from 'react'

export interface PopoverPos { top: number; left: number; width: number }

/**
 * Popover posicionado `fixed` (no se recorta en modales con overflow): posición por
 * getBoundingClientRect del trigger, con flip hacia arriba si no entra abajo, reposición en
 * scroll/resize, y cierre por click afuera o Esc. `onClose` se lee por ref para que el efecto
 * dependa solo de [open, reposition] (identidad estable, como el SearchableSelect original).
 */
export function usePopover<T extends HTMLElement, P extends HTMLElement>(open: boolean, onClose: () => void) {
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
    const below = r.bottom + 6
    const flipUp = ph > 0 && below + ph > window.innerHeight - 8 && r.top - 6 - ph >= 8
    setPos({ top: flipUp ? r.top - 6 - ph : below, left: r.left, width: r.width })
  }, [])

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
