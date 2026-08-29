import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { usePopover } from './usePopover'

/** Una entrada del menú. `disabled` la deja visible pero inerte (la acción existe y ahora mismo
 *  no se puede: eso informa más que esconderla y que la lista cambie de largo entre renders). */
export interface ActionMenuItem {
  key: string
  label: string
  icon?: IconName
  onClick: () => void
  /** Rojo. Reservado para lo que rompe algo de verdad; anular NO lo usa (ver ReceptionCard). */
  danger?: boolean
  disabled?: boolean
}

/**
 * Menú ⋮ de acciones secundarias: un disparador chico y un desplegable con las acciones que no
 * merecen un botón propio en la barra.
 *
 * Sale de `RowMenu` (Visitas del día), que era el único de la app y vivía privado dentro de su
 * fila. Acá está suelto porque Recepción necesitaba el mismo gesto y copiarlo habría dejado dos
 * menús que se ven igual hasta que uno de los dos cambie.
 *
 * PORTALEADO a `document.body`, y no es opcional: el popover es `position: fixed` con coordenadas
 * de viewport, así que cualquier ancestro con `transform`/`backdrop-filter` pasaría a ser su bloque
 * contenedor y el menú aterrizaría lejos. Además los dos consumidores viven dentro de un contenedor
 * con `overflow: hidden` (la fila recorta su rail, la card de recepción recorta su banda), que ya
 * había clipado este mismo menú una vez. El portal saca al menú de los dos problemas de una.
 *
 * Corta la propagación de sus clicks porque suele colgar de algo que también es pulsable (una fila
 * que abre un modal): sin eso, elegir "Anular" abriría además la ficha de abajo.
 */
export function ActionMenu({ items, ariaLabel = 'Más acciones', width = 226 }: {
  items: ActionMenuItem[]
  /** Qué menú es, para el lector de pantalla: "Más acciones de la recepción Nº 11". */
  ariaLabel?: string
  width?: number
}) {
  const [open, setOpen] = useState(false)
  // Posiciona `fixed` por getBoundingClientRect, cierra con Esc y con el click afuera, y corre el
  // menú hacia adentro si no entra por la derecha (que es lo normal: el disparador vive al final
  // de su barra y el desplegable es más ancho que él).
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))

  // Un disparador que no abre nada es un botón que miente. Pasa de verdad: en una recepción sin
  // permisos de gestión no queda ninguna acción.
  if (items.length === 0) return null

  return (
    <div style={{ flex: '0 0 auto' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Más acciones"
        style={{
          ...trigger,
          borderColor: open ? 'var(--spira-line-2)' : 'transparent',
          background: open ? 'var(--spira-surface)' : 'transparent',
        }}
      >
        <Icon name="moreVertical" size={17} color="currentColor" />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          role="menu"
          aria-label={ariaLabel}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ ...menu, top: pos.top, left: pos.left, width }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation()
                if (it.disabled) return
                // Cerrar ANTES de ejecutar: varias acciones abren un modal, y un menú que sigue
                // desplegado sobre él queda flotando encima de la confirmación.
                setOpen(false)
                it.onClick()
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={'spira-menu-item' + (it.danger ? ' spira-menu-item--danger' : '')}
              style={it.disabled ? { opacity: 0.55, cursor: 'default' } : undefined}
            >
              {it.icon && (
                <Icon
                  name={it.icon}
                  size={16}
                  color={it.danger ? 'var(--spira-danger)' : 'var(--spira-ink-soft)'}
                />
              )}
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

/* —— estilos ——
   El borde va en longhands y NO en la abreviada `border`: el estado abierto pisa sólo
   `borderColor`, y con la abreviada React vacía las longhand al cerrarse y el borde cae a
   `currentColor` (negro). Es el mismo pozo documentado en `btnOutline`. */
const trigger: CSSProperties = {
  width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderStyle: 'solid',
  cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--spira-faint)',
  flex: '0 0 auto',
}

const menu: CSSProperties = {
  position: 'fixed', zIndex: 60, padding: 5, background: 'var(--spira-white)',
  border: '1px solid var(--spira-line)', borderRadius: 11, boxShadow: 'var(--spira-shadow-md)',
}
