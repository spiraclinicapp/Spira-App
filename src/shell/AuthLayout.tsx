import type { ReactNode } from 'react'
import { Vilano } from '../components/Vilano'
import { CoverVideo } from './CoverVideo'

interface AuthLayoutProps {
  children: ReactNode
}

/** Shell pre-auth en dos mitades: a la izquierda un panel VERDE (color de marca) con el Vilano
    grande y tenue de fondo (marca de agua), el logo de Spira arriba y el VIDEO institucional como
    fondo vivo (autoplay en mute, loop desde el seg. 11, sin controles — ver CoverVideo) dentro de
    un card con sombra; a la derecha el formulario centrado. Lo comparten Login y SetNewPassword.
    En pantallas angostas el panel izquierdo se oculta (clases .spira-auth-* en tokens.css). */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="spira-auth">
      <div className="spira-auth-cover">
        {/* Vilano grande y tenue: marca de agua por detrás del card. */}
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

        <div className="spira-auth-cover-card">
          <CoverVideo />
        </div>
      </div>

      <div className="spira-auth-panel">
        <div className="spira-auth-form">
          <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
        </div>
        <div className="spira-auth-foot">© 2026 Spira</div>
      </div>
    </div>
  )
}
