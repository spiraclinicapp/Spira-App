import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Modal } from '../components/Modal'
import { useAuth } from '../lib/auth'

/* ============================================================================
   UserMenu — menú de la cuenta (dropdown desde el usuario, arriba a la derecha).

   Trigger = avatar + nombre + chevron en la top bar; al abrir baja un panel
   (diseño "Identidad rica"): header con identidad + ítems con ícono en cajita
   tintada (iguales a los chips de módulo) + Cerrar sesión en rojo sereno.

   Cerrar sesión ya funciona (signOut). El resto de los ítems son secciones
   todavía sin construir → abren un aviso sereno "Próximamente" (nada de clicks
   muertos); se cablean a su vista real cuando cada feature exista.

   A11y: trigger con aria-haspopup/aria-expanded; panel role=menu, ítems
   role=menuitem; foco al primer ítem al abrir, ↑/↓/Home/End mueven el foco,
   Esc cierra y devuelve el foco al trigger, click afuera cierra.
   ============================================================================ */

interface NavItem {
  key: string
  label: string
  icon: IconName
}

/** Ítems de navegación (todavía sin pantalla → "Próximamente"). */
const NAV_ITEMS: NavItem[] = [
  { key: 'cuenta', label: 'Mi cuenta', icon: 'user' },
  { key: 'preferencias', label: 'Preferencias', icon: 'settings' },
  { key: 'notificaciones', label: 'Notificaciones', icon: 'bell' },
  { key: 'roles', label: 'Roles y permisos', icon: 'shield' },
]
/** Ayuda va en su propio grupo (no se pierde entre los de cuenta). */
const AYUDA: NavItem = { key: 'ayuda', label: 'Ayuda', icon: 'helpCircle' }

/** Iniciales para el avatar: primera letra del primer y último nombre. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function UserMenu() {
  const { profile, session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  /** Ítem "Próximamente" abierto (label) o null. */
  const [comingSoon, setComingSoon] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const name = profile?.fullName ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const initials = initialsOf(name)

  // Cerrar al hacer click fuera del componente.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Al abrir, foco al primer ítem del menú.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  const close = (focusTrigger = false) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus() }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus() }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus() }
  }

  const openComingSoon = (label: string) => { setComingSoon(label); close() }
  const onLogout = () => { close(); void signOut() }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Tu cuenta"
        style={triggerStyle}
      >
        <span style={avatarStyle(30, 13)}>{initials}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--spira-muted)' }}>{name}</span>
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" />
      </button>

      {open && (
        <div ref={menuRef} role="menu" aria-label="Menú de usuario" onKeyDown={onMenuKey} style={menuStyle}>
          {/* header: identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 9px 11px' }}>
            <span style={avatarStyle(36, 14)}>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div style={headerName}>{name}</div>
              {email && <div style={headerSub}>{email}</div>}
            </div>
          </div>

          <div style={sep} />
          {NAV_ITEMS.map((it) => (
            <MenuRow key={it.key} item={it} onClick={() => openComingSoon(it.label)} />
          ))}

          <div style={sep} />
          <MenuRow item={AYUDA} onClick={() => openComingSoon(AYUDA.label)} />

          <div style={sep} />
          <MenuRow item={{ key: 'logout', label: 'Cerrar sesión', icon: 'logout' }} danger onClick={onLogout} />
        </div>
      )}

      {comingSoon && (
        <Modal title={comingSoon} icon="clock" accent="var(--spira-primary)" onClose={() => setComingSoon(null)} maxWidth={400}>
          <p style={{ margin: 0, color: 'var(--spira-muted)', fontSize: 14, lineHeight: 1.55 }}>
            Estamos construyendo esta sección. Muy pronto vas a poder gestionarla desde acá.
          </p>
        </Modal>
      )}
    </div>
  )
}

/** Fila del menú: ícono en cajita tintada + label. `danger` = Cerrar sesión. */
function MenuRow({ item, onClick, danger }: { item: NavItem; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={'spira-menu-item' + (danger ? ' spira-menu-item--danger' : '')}
    >
      <span style={iconBox(danger)}>
        <Icon name={item.icon} size={15} color={danger ? 'var(--spira-danger)' : 'var(--spira-primary)'} />
      </span>
      {item.label}
    </button>
  )
}

/* —— estilos —— */
const triggerStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9, height: 42, padding: '0 8px 0 6px',
  border: 'none', background: 'transparent', borderRadius: 10, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)',
}
function avatarStyle(size: number, fontSize: number): CSSProperties {
  return {
    width: size, height: size, flex: '0 0 auto', borderRadius: 9,
    background: 'var(--spira-primary)', color: 'var(--spira-on-accent)',
    display: 'grid', placeItems: 'center',
    fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize,
  }
}
const menuStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 248, zIndex: 90,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 14,
  boxShadow: '0 14px 34px rgba(20, 48, 46, 0.14)', padding: 7,
}
const headerName: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--spira-ink)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const headerSub: CSSProperties = {
  fontSize: 12, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}
const sep: CSSProperties = { height: 1, background: 'var(--spira-line)', margin: '6px 4px' }
function iconBox(danger?: boolean): CSSProperties {
  return {
    width: 26, height: 26, flex: '0 0 auto', borderRadius: 7, display: 'grid', placeItems: 'center',
    background: danger ? 'rgba(166, 72, 59, 0.10)' : 'rgba(15, 95, 87, 0.10)',
  }
}
