import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { linkCode, updateCode } from '../../data/pharma'

interface Props {
  accentSolid: string
  medicationId: string
  medicationName: string
  /** 'asignar' = alta de código (linkCode, insert); 'modificar' = reemplazo (updateCode). */
  mode: 'asignar' | 'modificar'
  /** Código actual (solo modo 'modificar'), para precargar el input. */
  currentCode?: string | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Asignar / modificar el código de barras EAN13 de un medicamento desde la vista Medicamentos.
 * Reusa el mismo camino código→medicamento de la recepción (`linkCode`) y su `updateCode` gemelo,
 * con los mismos mensajes serenos (23505 = código ya usado). Un solo lugar para la lógica de código.
 */
export function CodigoModal({ accentSolid, medicationId, medicationName, mode, currentCode, onClose, onSaved }: Props) {
  const [code, setCode] = useState(mode === 'modificar' ? (currentCode ?? '') : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const c = code.trim()
    if (!c) { setError('Escaneá o tipeá el código.'); return }
    setBusy(true)
    setError(null)
    const res = mode === 'asignar' ? await linkCode(c, medicationId) : await updateCode(medicationId, c)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onSaved()
  }

  return (
    <Modal title={`${mode === 'asignar' ? 'Asignar' : 'Modificar'} código · ${medicationName}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Código EAN13">
          <input
            className="spira-mono"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            placeholder="Escaneá o tipeá el código"
            aria-label={`Código de barras para ${medicationName}`}
            style={fieldInput}
          />
        </FormField>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }} aria-live="assertive">
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button type="submit" disabled={busy} style={{ ...btnPrimary(accentSolid), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
