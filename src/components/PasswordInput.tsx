import { useEffect, useRef, useState } from 'react'
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
  /** Bloqueado hasta el primer foco: el login lo usa para que el navegador no lo complete solo
      al cargar (ver `Login.tsx`). */
  readOnly?: boolean
  onFocus?: () => void
}

/** Input de contraseña con botón "ojito" para mostrar/ocultar. El toggle es estado local porque
    es puramente visual; el valor lo maneja el formulario padre. El ojito lleva .spira-no-press:
    es un control dentro del campo y el levante de hover ahí quedaría raro.

    El ojito muestra sólo lo que tipeó la persona que está en la máquina. Si el valor lo puso el
    gestor de contraseñas del navegador (o una extensión), el ojito desaparece hasta que el campo
    se vacíe: en una PC compartida del centro, si no, cualquiera elegía la cuenta guardada de otra
    persona y leía su contraseña en texto claro. Para distinguirlo se usa `beforeinput`, que el
    navegador dispara en toda edición de la persona (tecleo, pegado, borrado, arrastre, dictado,
    deshacer) y no cuando un autocompletado o un script escribe el valor. Una vez ajeno, sigue ajeno
    aunque se le agreguen o borren caracteres: lo que quedó adentro no lo tipeó quien mira. */
export function PasswordInput({
  value,
  onChange,
  id,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  readOnly,
  onFocus,
}: PasswordInputProps) {
  const [show, setShow] = useState(false)
  const [ajeno, setAjeno] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Se prende en `beforeinput` y se consume en el `input` (el onChange) que le sigue en el mismo tick.
  const edicionPropia = useRef(false)

  // Nativo y no `onBeforeInput` de React: el de React es sintético (sale de keypress/textInput) y no
  // ve el pegado, el borrado ni el arrastre.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const marcar = () => { edicionPropia.current = true }
    el.addEventListener('beforeinput', marcar)
    return () => el.removeEventListener('beforeinput', marcar)
  }, [])

  const cambiar = (nuevo: string) => {
    const propia = edicionPropia.current
    edicionPropia.current = false
    if (nuevo === '') setAjeno(false)
    else if (!propia) {
      setAjeno(true)
      setShow(false)
    }
    onChange(nuevo)
  }

  const visible = show && !ajeno
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => cambiar(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        onFocus={onFocus}
        required
        style={{ ...fieldInput, paddingRight: 44 }}
      />
      {!ajeno && (
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="spira-no-press"
          style={{
            position: 'absolute', top: 0, right: 0, height: 44, width: 44,
            display: 'grid', placeItems: 'center', border: 'none', background: 'transparent',
            color: 'var(--spira-muted)', cursor: 'pointer',
          }}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
        </button>
      )}
    </div>
  )
}
