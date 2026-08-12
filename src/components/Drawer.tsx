import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'

/**
 * Overlay deslizable desde la derecha (panel lateral). Espeja el vocabulario de `Modal` (backdrop
 * cálido + blur, cierre por Escape / click afuera / ✕, aria) pero el panel se ancla al borde
 * derecho, alto completo, y entra con `spDrawerIn` (deslizado corto que se asienta, §Movimiento).
 * Pensado para hilos livianos —comentarios de visita— sin abandonar la vista de fondo.
 *
 * A11y (WCAG 2.1 AA): al abrir mueve el foco al panel y lo ATRAPA dentro (Tab / Shift+Tab ciclan);
 * al cerrar devuelve el foco al elemento que lo disparó. Es net-new respecto a `Modal` (que hoy no
 * atrapa el foco); si más adelante se retrofitea `Modal`, este es el patrón a portar.
 */
export function Drawer({ title, onClose, children, maxWidth = 460, initialFocusRef, chrome = 'default' }: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Ancho máximo del panel; en pantallas chicas cae a 96vw. Default 460. */
  maxWidth?: number
  /**
   * Control que debe recibir el foco al abrir, en vez del primero del panel. Sin esto el foco cae
   * en el ✕ del encabezado, que es lo correcto para un cajón de lectura pero no para uno que se
   * opera con lector de código de barras: ahí el foco tiene que ir al campo de escaneo o el primer
   * disparo se pierde.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /**
   * Quién dibuja el marco.
   *
   *   · `'default'` — el cajón pone su encabezado (título + ✕), sus bordes y sus esquinas. Es lo
   *     correcto para un panel de lectura, que es para lo que nació este componente.
   *   · `'propio'`  — el cajón aporta solo la mecánica (backdrop, foco atrapado, Escape, aria) y el
   *     contenido dibuja TODO el marco. Sin encabezado, sin esquinas redondeadas y sin borde
   *     izquierdo: la separación con el fondo la da la sombra (handoff §4, decisión explícita).
   *     `position: relative` queda puesto para que un overlay interno —el visor de la constancia—
   *     se ancle al cajón y no al viewport.
   *
   * Nace con el rediseño de la dispensación, que necesita encabezado propio (subtítulo con paciente,
   * chip de excepción y menú ⋯) y un cuerpo partido en riel + trabajo. `title` sigue siendo
   * obligatorio: alimenta el `aria-label` del diálogo aunque no se pinte.
   */
  chrome?: 'default' | 'propio'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Recordamos quién tenía el foco para devolvérselo al cerrar.
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = (): HTMLElement[] =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
        : []

    // Foco inicial: el control que pidió quien abre, si no el primero del panel, si no el panel.
    ;(initialFocusRef?.current ?? focusables()[0] ?? panel)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !panel) return
      const els = focusables()
      if (els.length === 0) { e.preventDefault(); panel.focus(); return }
      const first = els[0]
      const last = els[els.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocusRef.current?.focus?.()
    }
  }, [onClose])

  return (
    <div style={backdrop} onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelBase, maxWidth, ...(chrome === 'propio' ? panelDesnudo : {}) }}
      >
        {chrome === 'propio' ? (
          // El contenido dibuja su propio marco, encabezado incluido. No se envuelve en el cuerpo
          // scrolleable: el cajón de dispensación scrollea por dentro (riel y trabajo tienen scrolls
          // separados) y un overflow de más acá le cortaría el overlay del visor.
          children
        ) : (
          <>
            {/* encabezado fijo */}
            <div style={headerStyle}>
              <div className="spira-h2" style={{ flex: 1, fontSize: 20 }}>{title}</div>
              <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar" style={closeBtn}>
                <Icon name="x" size={18} color="var(--spira-muted)" />
              </button>
            </div>
            {/* cuerpo scrolleable */}
            <div style={bodyStyle}>{children}</div>
          </>
        )}
      </div>
    </div>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.32)', backdropFilter: 'blur(2px)',
  display: 'flex', justifyContent: 'flex-end', zIndex: 50, animation: 'spOverlayIn 0.18s ease',
}
const panelBase: CSSProperties = {
  background: 'var(--spira-white)', borderLeft: '1px solid var(--spira-line)',
  boxShadow: 'var(--spira-shadow-md)', width: '96vw', height: '100%',
  borderRadius: '16px 0 0 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  animation: 'spDrawerIn 0.18s ease-out',
}
/**
 * Marco cedido al contenido: sin esquinas ni borde izquierdo (la sombra hace la separación) y con
 * `position: relative` para que el visor de la constancia se ancle al cajón, no al viewport.
 */
const panelDesnudo: CSSProperties = {
  borderRadius: 0, borderLeft: 'none', position: 'relative',
  background: 'var(--spira-paper)', boxShadow: '-18px 0 48px rgba(20, 48, 46, 0.14)',
}

const headerStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '22px 24px 14px', flex: '0 0 auto',
}
const closeBtn: CSSProperties = {
  width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto',
}
const bodyStyle: CSSProperties = { overflow: 'auto', padding: '0 24px 22px', flex: 1 }
