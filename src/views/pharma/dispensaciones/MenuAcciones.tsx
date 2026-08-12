import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import type { IconName } from '../../../components/Icon'

export interface AccionMenu {
  id: string
  label: string
  icon: IconName
  onSelect: () => void
  /** Acción destructiva o terminal: se pinta en rojo y va última. */
  peligrosa?: boolean
  /** Motivo por el que no se puede ahora. Deshabilita y se muestra como ayuda. */
  deshabilitada?: string
}

/**
 * El menú ⋯ del encabezado del cajón.
 *
 * Existe para DESCOMPRIMIR EL PIE. Antes, Rechazar y Cancelar preparación vivían en el footer junto
 * al botón de avanzar; con tres botones en fila el cajón tuvo que ensancharse a 560px para que no
 * envolvieran (ver el comentario de `maxWidth` que había en `DispensacionDrawer`). Además ponía la
 * acción TERMINAL a un centímetro de la acción del camino feliz.
 *
 * Nada inerte acá adentro: cada entrada hace algo de verdad. El handoff anuncia el menú como
 * "Rechazar, reasignar, historial" y las tres se construyeron; si alguna no pudiera ejecutarse en
 * este momento va deshabilitada CON su motivo, nunca muda.
 */
export function MenuAcciones({ acciones }: { acciones: AccionMenu[] }) {
  const [abierto, setAbierto] = useState(false)
  const cajaRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)

  // Cierre por click afuera y por Escape. El Escape se detiene acá (stopPropagation) para que no
  // burbujee hasta el Drawer y cierre el cajón entero: quien aprieta Escape con el menú abierto
  // quiere cerrar el menú, no perder la preparación de vista.
  useEffect(() => {
    if (!abierto) return
    const onDown = (e: MouseEvent) => {
      if (!cajaRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setAbierto(false)
      botonRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    // Captura: hay que ganarle al listener del Drawer, que también escucha Escape en `document`.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [abierto])

  return (
    <div ref={cajaRef} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones"
        // El tooltip se arma con lo que HAY, no con la lista completa del handoff. Sobre una
        // dispensación ya entregada solo queda el historial, y prometer "rechazar, reasignar"
        // ahí sería la misma mentira que un botón inerte, escrita en otro lado.
        title={acciones.map((a) => a.label).join(' · ')}
        className="spira-icon-btn"
        style={icoBtn}
      >
        <Icon name="moreVertical" size={17} />
      </button>

      {abierto && (
        <div role="menu" style={menu}>
          {acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              disabled={!!a.deshabilitada}
              title={a.deshabilitada}
              onClick={() => { setAbierto(false); a.onSelect() }}
              className="spira-row-link"
              style={{
                ...item,
                color: a.deshabilitada
                  ? 'var(--spira-faint)'
                  : a.peligrosa ? 'var(--spira-danger)' : 'var(--spira-ink)',
                cursor: a.deshabilitada ? 'default' : 'pointer',
              }}
            >
              <Icon name={a.icon} size={15} />
              <span style={{ flex: 1, textAlign: 'left' }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const icoBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: 9, background: 'transparent',
  // Longhands, nunca la abreviada: el hover cambia el color del borde y mezclarlas lo deja roto.
  borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
  color: 'var(--spira-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer',
}

const menu: CSSProperties = {
  position: 'absolute', top: 38, right: 0, zIndex: 30, minWidth: 208,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 10, boxShadow: 'var(--spira-shadow-md)', padding: 4,
  display: 'flex', flexDirection: 'column',
}

const item: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
  border: 'none', background: 'transparent', borderRadius: 7,
  fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 600,
}
