import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { AuthLayout } from './AuthLayout'
import { GoogleG } from './GoogleG'
import { useAuth } from '../lib/auth'
import { FormField, fieldInput, fieldLabelStyle } from '../components/FormField'
import { PasswordInput } from '../components/PasswordInput'
import { Icon } from '../components/Icon'
import { btnOutline, btnPrimary } from '../components/buttons'
import { Vilano } from '../components/Vilano'

const errorBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 8, padding: '8px 12px',
}
// Nota serena (confirmación de envío de reset / pista). Tinte primario tenue, no de error.
const noteBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-ink)', background: 'rgba(15, 95, 87, 0.08)',
  borderRadius: 8, padding: '8px 12px', lineHeight: 1.45,
}
const linkStyle: CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--spira-primary)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0,
}

export function Login() {
  const { signIn, signInWithGoogle, requestPasswordReset, authNotice, clearAuthNotice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setNote(null)
    clearAuthNotice()
    setBusy(true)
    const res = await signIn(email.trim(), password)
    if (res.error) setError(res.error)
    setBusy(false)
  }

  const onGoogle = async () => {
    setError(null)
    setNote(null)
    clearAuthNotice()
    setGoogleBusy(true)
    const res = await signInWithGoogle()
    // Si funciona, el navegador redirige a Google y esta página se va. Si falla (p. ej. el proveedor
    // todavía no está configurado en el dashboard), seguimos acá y mostramos el mensaje sereno.
    if (res.error) {
      setError(res.error)
      setGoogleBusy(false)
    }
  }

  const onForgot = async () => {
    setError(null)
    setNote(null)
    clearAuthNotice()
    const mail = email.trim()
    if (!mail) {
      setNote('Ingresá tu email arriba primero.')
      return
    }
    setResetBusy(true)
    const res = await requestPasswordReset(mail)
    setResetBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    // No revelamos si la cuenta existe (privacidad): mensaje neutro siempre.
    setNote('Si hay una cuenta con ese mail, te enviamos un enlace para restablecer la contraseña.')
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Vilano size={30} />
            <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>Spira</span>
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: 0, color: 'var(--spira-ink)' }}>
              Ingresá a tu cuenta
            </h2>
            <p style={{ color: 'var(--spira-muted)', fontSize: 14, marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
              Acceso al sistema de la Fundación.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={googleBusy}
          style={{
            ...btnOutline, width: '100%', height: 44, display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', gap: 10, opacity: googleBusy ? 0.7 : 1, cursor: googleBusy ? 'default' : 'pointer',
          }}
        >
          <GoogleG size={18} />
          {googleBusy ? 'Conectando…' : 'Continuar con Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
          <span style={{ color: 'var(--spira-muted)', fontSize: 12, fontWeight: 600 }}>o</span>
          <div style={{ flex: 1, height: 1, background: 'var(--spira-line)' }} />
        </div>

        <FormField label="Email">
          <div className="spira-input-affix">
            <span className="spira-input-affix-icon">
              <Icon name="mail" size={18} />
            </span>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com" autoComplete="email" required
              style={{ ...fieldInput, paddingLeft: 40 }}
            />
          </div>
        </FormField>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label htmlFor="password" style={fieldLabelStyle}>Contraseña</label>
            <button type="button" onClick={onForgot} disabled={resetBusy} className="spira-no-press" style={linkStyle}>
              {resetBusy ? 'Enviando…' : 'Olvidé mi contraseña'}
            </button>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>

        {/* El tono decide el color: un link de recuperación vencido SÍ es un error (rojo), pero que
            se te haya caído la sesión no —es el sistema cuidando una máquina compartida— y pintarlo
            de rojo le diría a la persona que hizo algo mal. Ver `lib/sessionExit.ts`. */}
        {authNotice && !note && !error && (
          <div style={authNotice.tone === 'error' ? errorBox : noteBox}>{authNotice.text}</div>
        )}
        {note && <div style={noteBox}>{note}</div>}
        {error && <div style={errorBox}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{ ...btnPrimary('var(--spira-primary)'), width: '100%', height: 44, fontSize: 14.5, marginTop: 2, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Ingresando…' : 'Ingresá'}
        </button>
      </form>
    </AuthLayout>
  )
}
