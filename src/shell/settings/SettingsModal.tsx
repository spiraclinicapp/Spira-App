import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import type { ThemePref } from '../../lib/theme'
import { ACCENT } from './primitives'
import { AccountSection } from './AccountSection'
import { PrefsSection } from './PrefsSection'
import { NotifSection } from './NotifSection'
import { RolesSection } from './RolesSection'
import { HelpSection } from './HelpSection'

/* ============================================================================
   SettingsModal — pantalla de Ajustes (handoff design_handoff_ajustes).

   Modal grande centrado (nav izquierda + contenido a la derecha). Es un overlay:
   NO toca la navegación del shell (moduleKey/subKey), así cerrar vuelve exactamente
   a donde estabas. Acento petróleo (zona transversal, no el color del módulo).

   A11y (WCAG 2.1 AA, mismo estándar que CommandPalette): role=dialog + aria-modal
   (esto además hace que el shell bloquee Ctrl/⌘K mientras Ajustes está abierto),
   foco al abrir + restaurado al cerrar, focus-trap (Tab cicla dentro), Esc cierra,
   y scroll-lock del body (con compensación del scrollbar para que el fondo no salte).
   ============================================================================ */

export type SettingsSection = 'cuenta' | 'prefs' | 'notif' | 'roles' | 'ayuda'

interface NavDef { key: SettingsSection; name: string; icon: IconName }
const SETTINGS_NAV: NavDef[] = [
  { key: 'cuenta', name: 'Mi cuenta', icon: 'user' },
  { key: 'prefs', name: 'Preferencias', icon: 'settings' },
  { key: 'notif', name: 'Notificaciones', icon: 'bell' },
  { key: 'roles', name: 'Roles y permisos', icon: 'lock' },
  { key: 'ayuda', name: 'Ayuda', icon: 'info' },
]
const SETTINGS_TITLE: Record<SettingsSection, string> = {
  cuenta: 'Mi cuenta', prefs: 'Preferencias', notif: 'Notificaciones', roles: 'Roles y permisos', ayuda: 'Ayuda',
}

interface SettingsModalProps {
  section: SettingsSection
  setSection: (s: SettingsSection) => void
  onClose: () => void
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

function renderSection(cur: SettingsSection, pref: ThemePref, setPref: (p: ThemePref) => void) {
  switch (cur) {
    case 'cuenta': return <AccountSection />
    case 'prefs': return <PrefsSection pref={pref} setPref={setPref} />
    case 'notif': return <NotifSection />
    case 'roles': return <RolesSection />
    case 'ayuda': return <HelpSection />
  }
}

export function SettingsModal({ section, setSection, onClose, pref, setPref }: SettingsModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const prevFocus = useRef<Element | null>(null)

  // Foco al abrir (al card) y restaurado al cerrar.
  useEffect(() => {
    prevFocus.current = document.activeElement
    cardRef.current?.focus()
    return () => { if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus() }
  }, [])

  // Esc cierra + focus-trap (Tab cicla entre los focusables del modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'Tab') {
        const nodes = cardRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (!nodes || nodes.length === 0) return
        const list = Array.from(nodes)
        const first = list[0]
        const last = list[list.length - 1]
        const a = document.activeElement
        if (e.shiftKey && (a === first || a === cardRef.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Scroll-lock del body mientras el modal está abierto (compensa el scrollbar
  // para que el fondo no "salte" al ocultarlo).
  useEffect(() => {
    const sw = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (sw > 0) document.body.style.paddingRight = `${sw}px`
    return () => { document.body.style.overflow = prevOverflow; document.body.style.paddingRight = prevPad }
  }, [])

  const cur = section

  return (
    <div style={scrim} role="presentation" onMouseDown={onClose}>
      <div
        ref={cardRef}
        style={card}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div style={header}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>Ajustes</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)" style={closeBtn}>
            <Icon name="x" size={19} color="var(--spira-muted)" />
          </button>
        </div>

        {/* cuerpo: nav + contenido */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <aside style={nav}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SETTINGS_NAV.map((it) => {
                const on = it.key === cur
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => setSection(it.key)}
                    aria-current={on ? 'page' : undefined}
                    className="spira-no-press"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px',
                      border: 'none', borderRadius: 9, cursor: 'pointer',
                      background: on ? ACCENT + '14' : 'transparent', color: on ? ACCENT : 'var(--spira-ink)',
                      fontFamily: 'var(--spira-font-text)', fontSize: 14, fontWeight: on ? 600 : 500,
                    }}
                  >
                    <Icon name={it.icon} size={17} stroke={1.9} color={on ? ACCENT : 'var(--spira-muted)'} />
                    {it.name}
                  </button>
                )
              })}
            </nav>
          </aside>

          <main style={content}>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 23, letterSpacing: '-0.02em', color: 'var(--spira-ink)', marginBottom: 18 }}>{SETTINGS_TITLE[cur]}</div>
            {renderSection(cur, pref, setPref)}
          </main>
        </div>
      </div>
    </div>
  )
}

/* —— estilos —— */
const scrim: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(20, 48, 46, 0.40)', backdropFilter: 'blur(3px)',
  display: 'grid', placeItems: 'center', padding: 28, animation: 'spOverlayIn .16s ease-out',
}
const card: CSSProperties = {
  width: 'min(1040px, 96vw)', height: 'min(760px, 88vh)', background: 'var(--spira-white)', borderRadius: 20,
  border: '1px solid var(--spira-line)', boxShadow: '0 40px 100px rgba(20, 48, 46, 0.34)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', animation: 'spModalIn .2s cubic-bezier(.2,.7,.3,1)', outline: 'none',
}
const header: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px 0 22px', height: 60, flex: '0 0 60px',
  borderBottom: '1px solid var(--spira-line)',
}
const closeBtn: CSSProperties = {
  marginLeft: 'auto', width: 34, height: 34, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 9,
  background: 'transparent', cursor: 'pointer',
}
const nav: CSSProperties = {
  width: 224, flex: '0 0 224px', background: 'var(--spira-surface)', borderRight: '1px solid var(--spira-line)', padding: '16px 12px',
}
const content: CSSProperties = { flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 30px 40px' }
