import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /**
   * Una línea de contexto bajo el título (de qué estudio, de qué período). Va en el encabezado
   * fijo y NO como primer hijo del cuerpo: el cuerpo scrollea (`overflow: auto`) y lo que se sube
   * con margen negativo para arrimarlo al título queda afuera de la zona visible, recortado por
   * arriba. Pasó en los cinco modales de Reposición (2026-09-21). Acá además queda a la vista
   * mientras se scrollea una lista larga, y se anuncia como descripción del diálogo.
   */
  subtitle?: ReactNode
  /** Ancho máximo de la card. Default 440 (formularios de una columna). */
  maxWidth?: number
  /** Ícono opcional en un cuadro tintado a la izquierda del título. */
  icon?: IconName
  /** Color de acento del título + ícono (ej. 'var(--spira-primary)'). Requiere `icon` para el cuadro. */
  accent?: string
  /** Fondo del cuadro del ícono (tinte del acento, ej. 'rgba(15,95,87,.12)'). */
  accentSoft?: string
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.32)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 'var(--spira-z-drawer)', padding: 24,
}
const cardBase: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 16,
  boxShadow: 'var(--spira-shadow-md)', width: '100%',
  /* Nunca más alto que la ventana: el encabezado queda fijo y el cuerpo scrollea. */
  maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

/**
 * Los modales abiertos, del más viejo al más nuevo. Esc cierra SÓLO el de arriba.
 *
 * Hasta el 2026-09-16 cada modal cerraba con cualquier Esc, y no se notaba porque nunca había dos
 * abiertos a la vez. Con «Cronograma y procedimientos» pasa a haberlos: el cronograma es un modal y
 * adentro abre «Editar procedimiento», «Procedimientos · V3» o «Quitar visita». Todos escuchan en
 * `document`, así que un Esc en el de adentro se llevaba también el cronograma entero, y con él lo
 * que estabas mirando. Esc cierra UNA capa por vez, como ya hace `usePopover`.
 *
 * Por qué una lista de módulo y no el orden de los listeners: los dos corren igual (mismo nodo, y
 * `stopPropagation` no frena a un hermano), y el orden de registro se desordena si un modal vuelve a
 * registrarse. Por eso además cada modal entra UNA sola vez, al montarse, y lee `onClose` por ref: si
 * el efecto dependiera de `onClose` —que casi siempre llega como flecha nueva en cada render—, un
 * re-render del de abajo lo sacaría y lo volvería a meter arriba de todo, y el próximo Esc cerraría
 * el equivocado.
 */
const abiertos: object[] = []

/**
 * Cuántos `Modal` hay abiertos. Lo usa el detalle de visita, que NO es un `Modal` y escucha Escape
 * por su cuenta: con uno de estos abierto encima, el Esc es del de arriba y la visita queda.
 */
export function modalesAbiertos(): number {
  return abiertos.length
}

/** Overlay sobrio reutilizable: backdrop + card scrolleable + accesibilidad (Escape, aria, click afuera). */
export function Modal({ title, onClose, children, subtitle, maxWidth = 440, icon, accent, accentSoft }: ModalProps) {
  const subtitleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const yo = {}
    abiertos.push(yo)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || abiertos[abiertos.length - 1] !== yo) return
      // Marca el Esc como consumido: quien más lo escuche en `document` (p. ej. `VisitDetail`, que
      // ya chequea `!e.defaultPrevented`) tiene que saber que este `Modal` ya lo usó, y no cerrar
      // también la capa de abajo.
      e.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      abiertos.splice(abiertos.indexOf(yo), 1)
    }
  }, [])

  return (
    <div style={backdrop} onClick={onClose} role="presentation">
      <div
        style={{ ...cardBase, maxWidth }} role="dialog" aria-modal="true" aria-label={title}
        aria-describedby={subtitle ? subtitleId : undefined} onClick={(e) => e.stopPropagation()}
      >
        {/* encabezado fijo */}
        <div style={{ padding: '22px 24px 14px', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {icon && (
              <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 9, background: accentSoft ?? 'var(--spira-surface)', display: 'grid', placeItems: 'center' }}>
                <Icon name={icon} size={18} color={accent ?? 'var(--spira-ink)'} stroke={1.9} />
              </span>
            )}
            <div className="spira-h2" style={{ flex: 1, fontSize: 20, color: accent }}>{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar"
              style={{ width: 32, height: 32, border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}
            >
              <Icon name="x" size={18} color="var(--spira-muted)" />
            </button>
          </div>
          {/* Alineado con el texto del título: con ícono, corrido lo que ocupa el cuadro (34 + 12). */}
          {subtitle && (
            <div id={subtitleId} style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.45, marginTop: 4, paddingLeft: icon ? 46 : 0 }}>
              {subtitle}
            </div>
          )}
        </div>
        {/* cuerpo scrolleable */}
        <div style={{ overflow: 'auto', padding: '0 24px 22px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
