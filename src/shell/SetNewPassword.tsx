import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { AuthLayout } from './AuthLayout'
import { useAuth } from '../lib/auth'
import { FormField } from '../components/FormField'
import { PasswordInput } from '../components/PasswordInput'
import { btnPrimary } from '../components/buttons'
import { Vilano } from '../components/Vilano'

const errorBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 8, padding: '8px 12px',
}

/** Pantalla pre-auth que aparece cuando el usuario vuelve del link de "olvidé mi contraseña"
    (estado `recovering` en el contexto de auth; ver el Gate en App.tsx). Fija la clave nueva y,
    como la sesión de recuperación ya está activa, al terminar entra directo al shell. */
export function SetNewPassword() {
  const { updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Usá al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    const res = await updatePassword(password)
    if (res.error) {
      setError(res.error)
      setBusy(false)
      return
    }
    // Éxito: updatePassword apaga `recovering`; el Gate cae a session→AppShell y se desmonta esto.
    // No tocamos `busy` para no parpadear el botón durante el desmontaje.
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Vilano size={30} />
          <span style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>Spira</span>
        </div>

        <div>
          <h2 style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.02em', margin: 0, color: 'var(--spira-ink)' }}>
            Definí tu nueva contraseña
          </h2>
          <p style={{ color: 'var(--spira-muted)', fontSize: 14, marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
            Elegí una contraseña nueva para tu cuenta.
          </p>
        </div>

        <FormField label="Nueva contraseña">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
        </FormField>
        <FormField label="Repetí la contraseña">
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </FormField>

        {error && <div style={errorBox}>{error}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{ ...btnPrimary('var(--spira-primary)'), width: '100%', height: 44, fontSize: 14.5, marginTop: 2, opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          style={{ alignSelf: 'center', background: 'transparent', border: 'none', color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          Volver al login
        </button>
      </form>
    </AuthLayout>
  )
}
