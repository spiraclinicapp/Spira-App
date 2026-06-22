import { useState } from 'react'
import type { ReactNode } from 'react'
import { Vilano } from '../components/Vilano'

interface AuthLayoutProps {
  children: ReactNode
}

/** Shell pre-auth en dos mitades: a la izquierda un panel VERDE (color de marca) con el Vilano
    grande y tenue de fondo (marca de agua), el logo de Spira arriba y la foto INSERTADA con
    bordes rectos (un recuadro, no de fondo); a la derecha el formulario centrado. Lo comparten
    Login y SetNewPassword.

    La foto va en public/login-cover.jpg. Si falla (404), se oculta toda la mitad izquierda y el
    formulario queda centrado a pantalla completa. En pantallas angostas la foto también se oculta
    (clases .spira-auth-* en tokens.css). */
export function AuthLayout({ children }: AuthLayoutProps) {
  const [coverFailed, setCoverFailed] = useState(false)

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

          <img
            src="/login-cover.jpg"
            alt="Material informativo de la Fundación"
            className="spira-auth-cover-img"
            onError={() => setCoverFailed(true)}
          />
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
