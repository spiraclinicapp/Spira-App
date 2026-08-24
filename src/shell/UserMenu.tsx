import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { UserAvatar } from '../components/UserAvatar'
import { useAuth } from '../lib/auth'
import { initialsOf } from '../lib/initials'
import { homeUrl } from '../lib/router'
import type { SettingsSection } from './settings/SettingsModal'

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
  section: SettingsSection
}

/** Ítems del menú: cada uno abre Ajustes en su sección (íconos del handoff). */
const NAV_ITEMS: NavItem[] = [
  { key: 'cuenta', label: 'Mi cuenta', icon: 'user', section: 'cuenta' },
  { key: 'preferencias', label: 'Preferencias', icon: 'settings', section: 'prefs' },
  { key: 'notificaciones', label: 'Notificaciones', icon: 'bell', section: 'notif' },
  { key: 'roles', label: 'Roles y permisos', icon: 'lock', section: 'roles' },
]
/** Ayuda va en su propio grupo (no se pierde entre los de cuenta). */
const AYUDA: NavItem = { key: 'ayuda', label: 'Ayuda', icon: 'info', section: 'ayuda' }

export function UserMenu({ onOpenSettings }: { onOpenSettings: (section: SettingsSection) => void }) {
  const { profile, session, signOut } = useAuth()
  const [open, setOpen] = useState(false)

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

  /* close(true) reenfoca el disparador (sigue montado en la top bar) ANTES de que
     monte el modal: así el modal captura ese foco y, al cerrar, lo devuelve al
     menú de usuario en vez de perderlo en el body (WCAG 2.4.3). */
  const openSettings = (section: SettingsSection) => { close(true); onOpenSettings(section) }
  /* Cerrar sesión vuelve a la raíz, no te deja en la URL donde estabas. Es una máquina compartida de
     clínica: si el próximo que entra encuentra la barra con el protocolo y el IVRS del paciente que
     miraba el anterior, la sesión se cerró pero el dato quedó a la vista. F5, el atrás y los links sí
     mantienen el lugar — esto es solo el logout. */
  const onLogout = () => {
    close()
    window.history.replaceState(null, '', homeUrl())
    void signOut()
  }

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
        <UserAvatar initials={initials} size={30} />
        <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--spira-muted)' }}>{name}</span>
        <Icon name="chevronDown" size={15} color="var(--spira-muted)" />
      </button>

      {open && (
        <div ref={menuRef} role="menu" aria-label="Menú de usuario" onKeyDown={onMenuKey} style={menuStyle}>
          {/* header: identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 9px 11px' }}>
            <UserAvatar initials={initials} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={headerName}>{name}</div>
              {email && <div style={headerSub}>{email}</div>}
            </div>
          </div>

          <div style={sep} />
          {NAV_ITEMS.map((it) => (
            <MenuRow key={it.key} item={it} onClick={() => openSettings(it.section)} />
          ))}

          <div style={sep} />
          <MenuRow item={AYUDA} onClick={() => openSettings(AYUDA.section)} />

          <div style={sep} />
          <MenuRow item={{ label: 'Cerrar sesión', icon: 'logout' }} danger onClick={onLogout} />
        </div>
      )}
    </div>
  )
}

/** Fila del menú: ícono en cajita tintada + label. `danger` = Cerrar sesión. */
function MenuRow({ item, onClick, danger }: { item: { label: string; icon: IconName }; onClick: () => void; danger?: boolean }) {
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
