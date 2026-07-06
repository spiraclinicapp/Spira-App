import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { Vilano } from '../components/Vilano'
import { SPIRA_VERSION } from '../lib/version'

/* ============================================================================
   AboutMenu — botón «i» al pie del rail de módulos + popover "Acerca de Spira".

   Reemplaza la tuerca de Ajustes (sus ítems se movieron al UserMenu). Muestra
   marca + versión de plataforma + chip de canal + Novedades (changelog), y su
   acción principal es "Dar feedback" (que el shell monta como modal aparte).

   Autocontenido, mismo patrón que UserMenu/NotificationsMenu: trigger + popover,
   foco/Esc/click-afuera propios. El acento es contextual (color del módulo activo).
   ============================================================================ */

interface AboutMenuProps {
  /** Acento del módulo activo (hex). */
  accent: string
  /** El shell abre el FeedbackModal (montado a nivel shell). */
  onFeedback: () => void
}

export function AboutMenu({ accent, onFeedback }: AboutMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // Cerrar al click afuera.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Esc cierra — pero NO si hay un modal encima (para no pisar el Escape del FeedbackModal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const V = SPIRA_VERSION
  const feedback = () => { setOpen(false); onFeedback() }

  return (
    <div ref={rootRef} style={{ marginTop: 'auto', position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Acerca de Spira · versión"
        style={{
          width: 46, height: 46, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: open ? accent + '16' : 'transparent', display: 'grid', placeItems: 'center',
        }}
      >
        <Icon name="info" size={21} stroke={1.9} color={open ? accent : 'var(--spira-muted)'} />
      </button>

      {open && (
        <div role="dialog" aria-label="Acerca de Spira" style={panel}>
          {/* 1 · cabecera de marca */}
          <div style={header}>
            <span style={{ ...markBox, background: accent + '16' }}><Vilano size={25} color={accent} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>Spira</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span className="spira-mono" style={{ fontSize: 11.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>Plataforma {V.app}</span>
                <span className="spira-mono" style={channelChip}>{V.channel}</span>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={closeBtn}>
              <Icon name="x" size={18} color="var(--spira-muted)" />
            </button>
          </div>

          {/* 2 · novedades */}
          <div style={{ padding: '12px 18px' }}>
            <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Novedades</div>
            {V.changelog.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, padding: '5px 0', alignItems: 'flex-start' }}>
                <span className="spira-mono" style={verBadge}>{c.version}</span>
                <span style={{ fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.35 }}>{c.text}</span>
              </div>
            ))}
          </div>

          {/* 3 · pie — dar feedback */}
          <div style={{ padding: '11px 14px', borderTop: '1px solid var(--spira-line)', background: 'var(--spira-surface)' }}>
            <button type="button" onClick={feedback} style={feedbackBtn}>
              <Icon name="message" size={16} color={accent} /> Dar feedback
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* —— estilos —— */
const panel: CSSProperties = {
  position: 'absolute', bottom: 0, left: 54, zIndex: 40, width: 288,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 18,
  boxShadow: '0 24px 60px rgba(20, 48, 46, 0.24)', overflow: 'hidden',
}
const header: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 11, padding: '15px 12px 13px 18px',
  borderBottom: '1px solid var(--spira-line)',
}
const markBox: CSSProperties = {
  width: 38, height: 38, flex: '0 0 auto', borderRadius: 11, display: 'grid', placeItems: 'center',
}
const channelChip: CSSProperties = {
  fontSize: 10.5, fontWeight: 500, color: 'var(--spira-good)', background: 'rgba(92, 138, 90, 0.16)',
  borderRadius: 99, padding: '2px 8px',
}
const closeBtn: CSSProperties = {
  width: 28, height: 28, flex: '0 0 auto', borderRadius: 8, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center',
}
const verBadge: CSSProperties = {
  flex: '0 0 auto', fontSize: 10.5, fontWeight: 500, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 6,
  padding: '1px 6px', whiteSpace: 'nowrap',
}
const feedbackBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 38,
  border: '1px solid var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
