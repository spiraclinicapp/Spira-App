import { useState } from 'react'
import { fieldInput } from './FormField'
import { Icon } from './Icon'

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  /** id para asociar un <label htmlFor>. */
  id?: string
  placeholder?: string
  /** 'current-password' al ingresar, 'new-password' al definir una nueva. */
  autoComplete?: string
}

/** Input de contraseña con botón "ojito" para mostrar/ocultar. El toggle es estado local porque
    es puramente visual; el valor lo maneja el formulario padre. El ojito lleva .spira-no-press:
    es un control dentro del campo y el levante de hover ahí quedaría raro. */
export function PasswordInput({
  value,
  onChange,
  id,
  placeholder = '••••••••',
  autoComplete = 'current-password',
}: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        style={{ ...fieldInput, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="spira-no-press"
        style={{
          position: 'absolute', top: 0, right: 0, height: 44, width: 44,
          display: 'grid', placeItems: 'center', border: 'none', background: 'transparent',
          color: 'var(--spira-muted)', cursor: 'pointer',
        }}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  )
}
