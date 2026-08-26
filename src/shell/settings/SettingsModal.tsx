import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { useNavigationGuard } from '../../lib/useUrlState'
import type { SettingsSection } from './section'
import { ACCENT, btnGhost, btnSolid } from './primitives'
import { AccountSection } from './AccountSection'
import { PrefsSection } from './PrefsSection'
import { EquipoYAccesosSection } from './EquipoYAccesosSection'

/* ============================================================================
   SettingsModal — pantalla de Ajustes.

   Modal grande centrado (nav izquierda + contenido a la derecha). Es un overlay: NO toca la
   navegación del shell (moduleKey/subKey), así cerrar vuelve exactamente a donde estabas. Acento
   petróleo (zona transversal, no el color del módulo).

   VIVE EN LA URL (`?ajustes=<sección>`) desde el 2026-08-25. Era el último rincón de la app que no:
   un F5 lo cerraba, no se podía mandar el link de una sección, y el atrás del navegador te sacaba de
   la pantalla de atrás en vez de cerrar lo que estaba abierto encima. Abrir apila historial y cerrar
   reemplaza — el mismo criterio que `useUrlEntity` usa para cualquier entidad abierta.

   A11y (WCAG 2.1 AA, mismo estándar que CommandPalette): role=dialog + aria-modal (esto además hace
   que el shell bloquee Ctrl/⌘K mientras Ajustes está abierto), foco al abrir + restaurado al cerrar,
   focus-trap (Tab cicla dentro), Esc cierra, y scroll-lock del body (con compensación del scrollbar
   para que el fondo no salte).
   ============================================================================ */

/* El tipo y el parseo de la sección viven en './section' (puros, con test). Se reexportan acá
   porque el resto del shell los venía importando del modal. */
export type { SettingsSection } from './section'
export { parseSettingsSection } from './section'

/* ─── Cambios sin guardar ───
   Una sección con un formulario abierto avisa por acá, y el modal usa ese aviso para preguntar
   antes de cerrar. Va por contexto y no por props para que agregar una sección con formulario sea
   una línea adentro de esa sección, sin cablear nada a través del modal. */
const DirtyContext = createContext<(sucio: boolean) => void>(() => {})

/** Declara que esta sección tiene cambios sin guardar. El modal pregunta antes de cerrar. */
export function useMarkDirty(sucio: boolean): void {
  const marcar = useContext(DirtyContext)
  useEffect(() => {
    marcar(sucio)
    // Al desmontarse la sección (cambio de sección, cierre), lo pendiente deja de existir.
    return () => marcar(false)
  }, [sucio, marcar])
}

interface NavDef { key: SettingsSection; name: string; icon: IconName }
const SETTINGS_NAV: NavDef[] = [
  { key: 'cuenta', name: 'Mi cuenta', icon: 'user' },
  { key: 'prefs', name: 'Preferencias', icon: 'settings' },
  { key: 'roles', name: 'Equipo y accesos', icon: 'lock' },
]
const SETTINGS_TITLE: Record<SettingsSection, string> = {
  cuenta: 'Mi cuenta', prefs: 'Preferencias', roles: 'Equipo y accesos',
}

interface SettingsModalProps {
  section: SettingsSection
  setSection: (s: SettingsSection) => void
  onClose: () => void
}

/* Ninguna sección recibe datos por props: cada una toma lo suyo de su contexto (`useAuth` para la
   cuenta, `usePrefs` para las preferencias). El tema viajaba por acá cuando era el único control
   vivo y vivía en un useState del shell; desde la 0093 las preferencias son de la cuenta y tienen
   su propio provider, así que hacerlas pasar por el modal solo agregaba un intermediario. */
function renderSection(cur: SettingsSection) {
  switch (cur) {
    case 'cuenta': return <AccountSection />
    case 'prefs': return <PrefsSection />
    case 'roles': return <EquipoYAccesosSection />
  }
}

export function SettingsModal({ section, setSection, onClose }: SettingsModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const confirmRef = useRef<HTMLDivElement | null>(null)
  const prevFocus = useRef<Element | null>(null)

  const [sucio, setSucio] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const marcarSucio = useCallback((v: boolean) => setSucio(v), [])

  /* Los CUATRO caminos de salida (Esc, la X, el clic afuera y el atrás del navegador) pasan por
     acá. Antes eran tres y ninguno preguntaba; el cuarto lo agregó mudar Ajustes a la URL, y con un
     formulario de perfil abierto cualquiera de los cuatro descartaba lo escrito sin decir una
     palabra. */
  const intentarCerrar = useCallback(() => {
    if (sucio) setConfirmando(true)
    else onClose()
  }, [sucio, onClose])

  /* El atrás del navegador. `useNavigationGuard` es la pieza que hace que esto funcione: su listener
     de `popstate` vive a NIVEL DE MÓDULO, corre antes que nadie y repone la URL sin avisar a los
     suscriptores — así este componente no se desmonta y llega a preguntar. Un listener propio
     registrado acá adentro no serviría: el de módulo corre primero, el aviso desmonta este modal y
     se lleva el listener antes de que el navegador le dé su turno. No es una carrera que a veces se
     gane; nunca corre. */
  useNavigationGuard(sucio, () => setConfirmando(true))

  // Foco al abrir (al card) y restaurado al cerrar.
  useEffect(() => {
    prevFocus.current = document.activeElement
    cardRef.current?.focus()
    return () => { if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus() }
  }, [])

  // Al abrir el diálogo de confirmación, el foco va a él (a "Seguir editando", la opción segura).
  useEffect(() => {
    if (confirmando) confirmRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [confirmando])

  /* Esc + focus-trap (Tab cicla entre los focusables). El ámbito del trap CAMBIA cuando está abierto
     el diálogo de confirmación: pasa a ser el diálogo y no el modal entero. Sin eso, un trap anidado
     deja tabular hasta el formulario de atrás —el que estás por descartar— mientras se pregunta si
     descartarlo, que es exactamente la confusión que el diálogo venía a evitar. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // Con el diálogo abierto, Esc es "no salgas" — la opción que no pierde nada.
        if (confirmando) setConfirmando(false)
        else intentarCerrar()
        return
      }
      if (e.key === 'Tab') {
        const ambito = confirmando ? confirmRef.current : cardRef.current
        const nodes = ambito?.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        )
        if (!nodes || nodes.length === 0) return
        const list = Array.from(nodes)
        const first = list[0]
        const last = list[list.length - 1]
        const a = document.activeElement
        if (e.shiftKey && (a === first || a === ambito)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intentarCerrar, confirmando])

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
    <div style={scrim} role="presentation" onMouseDown={intentarCerrar}>
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
          <button type="button" onClick={intentarCerrar} aria-label="Cerrar" title="Cerrar (Esc)" style={closeBtn}>
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
            <DirtyContext.Provider value={marcarSucio}>
              {renderSection(cur)}
            </DirtyContext.Provider>
          </main>
        </div>

        {/* Confirmación de salida con cambios sin guardar. Va DENTRO del card (no es otro overlay a
            pantalla completa) para que se lea como una pregunta sobre esta pantalla y no como un
            segundo modal encima. */}
        {confirmando && (
          <div style={confirmScrim} role="presentation" onMouseDown={(e) => e.stopPropagation()}>
            <div ref={confirmRef} style={confirmCard} role="alertdialog" aria-modal="true" aria-label="Cambios sin guardar">
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, color: 'var(--spira-ink)' }}>
                Tenés cambios sin guardar
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', marginTop: 7, lineHeight: 1.45 }}>
                Si salís de Ajustes ahora, lo que escribiste se pierde.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button type="button" style={btnSolid()} onClick={() => setConfirmando(false)}>Seguir editando</button>
                <button type="button" style={btnGhost} onClick={() => { setConfirmando(false); onClose() }}>Salir sin guardar</button>
              </div>
            </div>
          </div>
        )}
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
  position: 'relative',
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
const confirmScrim: CSSProperties = {
  position: 'absolute', inset: 0, background: 'rgba(20, 48, 46, 0.30)', display: 'grid', placeItems: 'center',
  padding: 24, animation: 'spOverlayIn .12s ease-out',
}
const confirmCard: CSSProperties = {
  width: 'min(420px, 100%)', background: 'var(--spira-white)', borderRadius: 16, border: '1px solid var(--spira-line)',
  boxShadow: '0 24px 60px rgba(20, 48, 46, 0.26)', padding: '20px 22px 18px',
}
