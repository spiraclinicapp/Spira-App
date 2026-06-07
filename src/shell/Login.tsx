import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Vilano } from '../components/Vilano'
import { useAuth } from '../lib/auth'

const inputStyle: CSSProperties = {
  width: '100%', height: 44, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  outline: 'none',
}

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn(email.trim(), password)
    if (res.error) setError('No pudimos ingresar. Revisá el email y la contraseña.')
    setBusy(false)
  }

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--spira-paper)', padding: 24 }}>
      <div
        style={{
          width: '100%', maxWidth: 380, background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
          borderRadius: 16, boxShadow: 'var(--spira-shadow-md)', padding: '32px 28px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 22 }}>
          <Vilano size={56} />
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', marginTop: 6 }}>Spira</div>
          <div className="spira-eyebrow" style={{ marginTop: 10 }}>Acceso al sistema</div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Email</span>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com" autoComplete="email" required style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' }}>Contraseña</span>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" required style={inputStyle}
            />
          </label>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={busy}
            style={{
              height: 44, marginTop: 4, border: 'none', borderRadius: 10, background: 'var(--spira-primary)',
              color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14.5,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Ingresando…' : 'Ingresá'}
          </button>
        </form>
      </div>
    </div>
  )
}
