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

/** Cuántas novedades se muestran por defecto; el resto se pliega para que el
    popover no crezca sin techo a medida que se acumulan releases. */
const VISIBLE_NEWS = 5

export function AboutMenu({ accent, onFeedback }: AboutMenuProps) {
  const [open, setOpen] = useState(false)
  // Novedades viejas plegadas por defecto (ver VISIBLE_NEWS).
  const [showAllNews, setShowAllNews] = useState(false)
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

  // Al cerrar, volver a plegar las novedades viejas: reabrir arranca colapsado.
  useEffect(() => { if (!open) setShowAllNews(false) }, [open])

  const V = SPIRA_VERSION
  // Canal pre-release (beta/alpha/rc) → etiqueta junto al wordmark. En 'estable' no
  // se muestra: un producto estable no necesita rotularse.
  const isPre = V.channel !== 'estable'
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--spira-ink)' }}>Spira</span>
                {isPre && <span style={betaBadge(accent)}>{V.channel}</span>}
              </div>
              <span className="spira-mono" style={{ display: 'inline-block', marginTop: 3, fontSize: 11.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>Plataforma {V.app}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={closeBtn}>
              <Icon name="x" size={18} color="var(--spira-muted)" />
            </button>
          </div>

          {/* 2 · novedades — por defecto solo las VISIBLE_NEWS más recientes;
               las viejas se pliegan tras un botón para no estirar el popover. */}
          <div style={{ padding: '12px 18px' }}>
            <div className="spira-eyebrow" style={{ marginBottom: 8 }}>Novedades</div>
            {(showAllNews ? V.changelog : V.changelog.slice(0, VISIBLE_NEWS)).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, padding: '5px 0', alignItems: 'flex-start' }}>
                <span className="spira-mono" style={verBadge}>{c.version}</span>
                <span style={{ fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.35 }}>{c.text}</span>
              </div>
            ))}
            {V.changelog.length > VISIBLE_NEWS && (
              <button
                type="button"
                onClick={() => setShowAllNews((v) => !v)}
                aria-expanded={showAllNews}
                style={moreNewsBtn(accent)}
              >
                {showAllNews ? 'Ver menos' : `Ver ${V.changelog.length - VISIBLE_NEWS} más antiguas`}
                <Icon name={showAllNews ? 'chevronUp' : 'chevronDown'} size={14} color={accent} />
              </button>
            )}
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
  position: 'absolute', bottom: 10, left: 60, zIndex: 40, width: 288,
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
/** Etiqueta de canal pre-release (BETA) pegada al wordmark: rótulo (mayúsculas +
    tracking, la convención de marca), tintada con el acento del módulo. Integrada al
    lockup pero con borde propio para que se note que es una etiqueta. */
function betaBadge(accent: string): CSSProperties {
  return {
    fontFamily: 'var(--spira-font-text)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: accent, background: accent + '1e', border: `1px solid ${accent}33`,
    borderRadius: 5, padding: '2px 5px', lineHeight: 1, whiteSpace: 'nowrap',
  }
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
/** Botón de plegado de novedades: texto discreto tintado con el acento, al borde
    izquierdo del listado (alineado con los badges de versión). */
function moreNewsBtn(accent: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '4px 0',
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, color: accent,
  }
}
const feedbackBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 38,
  border: '1px solid var(--spira-line-2)', borderRadius: 10, background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
}
