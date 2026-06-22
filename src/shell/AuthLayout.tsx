import { useState } from 'react'
import type { ReactNode } from 'react'
import { Vilano } from '../components/Vilano'

interface AuthLayoutProps {
  children: ReactNode
}

/* Miniatura del video institucional para el panel de marca. `maxresdefault` puede no existir en
   todos los videos → si falla, se cae a `mqdefault` (16:9 garantizado) antes de ocultar la mitad. */
const YT_ID = 'cJALP1onzAY'
const THUMB_MAXRES = `https://i.ytimg.com/vi/${YT_ID}/maxresdefault.jpg`
const THUMB_FALLBACK = `https://i.ytimg.com/vi/${YT_ID}/mqdefault.jpg`

/** Shell pre-auth en dos mitades: a la izquierda un panel VERDE (color de marca) con el Vilano
    grande y tenue de fondo (marca de agua), el logo de Spira arriba y la MINIATURA del video
    institucional insertada con marco blanco (un recuadro, no de fondo); a la derecha el formulario
    centrado. Lo comparten Login y SetNewPassword.

    La miniatura sale de YouTube (16:9): llena el ancho del panel con alto automático para no
    deformarla. Si maxres y el fallback fallan (404 / sin red), se oculta toda la mitad izquierda y
    el formulario queda centrado a pantalla completa. En pantallas angostas también se oculta
    (clases .spira-auth-* en tokens.css). */
export function AuthLayout({ children }: AuthLayoutProps) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [thumbSrc, setThumbSrc] = useState(THUMB_MAXRES)

  return (
    <div className="spira-auth">
      {!coverFailed && (
        <div className="spira-auth-cover">
          {/* Vilano grande y tenue: cruza por detrás de la imagen (centrado, marca de agua). */}
          <div className="spira-auth-cover-bg" aria-hidden="true">
            <Vilano size={620} color="var(--spira-on-accent)" />
          </div>

          <div className="spira-auth-cover-brand">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Vilano size={32} color="var(--spira-on-accent)" />
              <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--spira-on-accent)' }}>
                Spira
              </span>
            </div>
            <div style={{ color: 'var(--spira-on-accent)', opacity: 0.82, fontSize: 14, marginTop: 8, maxWidth: 340, lineHeight: 1.5 }}>
              Plataforma de investigación clínica · Fundación Scherbovsky
            </div>
          </div>

          <a
            className="spira-auth-cover-card spira-no-press"
            href={`https://www.youtube.com/watch?v=${YT_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver el video institucional de la Fundación Scherbovsky"
          >
            <img
              src={thumbSrc}
              alt="Video institucional de la Fundación Scherbovsky"
              className="spira-auth-cover-img"
              onError={() => (thumbSrc === THUMB_FALLBACK ? setCoverFailed(true) : setThumbSrc(THUMB_FALLBACK))}
            />
            <span className="spira-auth-cover-play" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </a>
        </div>
      )}

      <div className="spira-auth-panel">
        <div className="spira-auth-form">
          <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
        </div>
        <div className="spira-auth-foot">© 2026 Spira</div>
      </div>
    </div>
  )
}
