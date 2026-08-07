import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { btnOutline } from '../../components/buttons'
import { deleteMedication } from '../../data/pharma'
import type { MedicationRow } from '../../data/pharma'

/** La palabra que hay que tipear para habilitar el borrado (ceremonia del handoff). */
const PALABRA = 'ELIMINAR'

/**
 * Confirmación de borrado permanente de un medicamento del catálogo (handoff "Editar y eliminar").
 * Acento peligro. Pide tipear ELIMINAR para habilitar el botón (acción de una vía). El borrado es
 * FÍSICO: la base solo lo permite si el medicamento nunca se usó (todas las FKs a `medications` son
 * ON DELETE restrict salvo el código de barras, que cascadea — ver `deleteMedication`). Si está en
 * uso, el 23503 vuelve como texto sereno y el modal QUEDA ABIERTO (no cierre silencioso).
 */
export function DeleteMedicationModal({ row, onClose, onDeleted }: {
  row: MedicationRow
  onClose: () => void
  /** Se llama sólo tras un borrado exitoso; recibe el nombre para el toast. */
  onDeleted: (nombre: string) => void
}) {
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmado = texto.trim().toUpperCase() === PALABRA
  const puedeBorrar = confirmado && !busy

  const submit = async () => {
    if (!puedeBorrar) return
    setBusy(true)
    setError(null)
    const res = await deleteMedication(row.id)
    if (res.error) { setBusy(false); setError(res.error); return }
    onDeleted(row.name)
  }

  return (
    <Modal
      title="Eliminar del catálogo"
      icon="alertCircle"
      accent="var(--spira-danger)"
      accentSoft="rgba(166,72,59,.12)"
      maxWidth={460}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div style={{ fontSize: 14, color: 'var(--spira-ink)', lineHeight: 1.5 }}>
          Vas a eliminar <strong>{row.name}</strong>{row.unit ? ` · ${row.unit}` : ''} del catálogo global de Spira Farmacia.
        </div>

        <div style={warnCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--spira-danger)' }}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            Esta acción es permanente y no se puede deshacer.
          </div>
          <ul style={warnList}>
            <li>Se elimina el medicamento y su código de barras del catálogo.</li>
            <li>Solo se puede eliminar si nunca tuvo stock, recepciones ni dispensaciones.</li>
            <li>Si está en uso, la base lo impedirá y no se borrará.</li>
          </ul>
        </div>

        <div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginBottom: 6 }}>
            Para confirmar, escribí <strong className="spira-mono" style={{ color: 'var(--spira-ink)' }}>{PALABRA}</strong>
          </div>
          <input
            value={texto}
            onChange={(e) => { setTexto(e.target.value); if (error) setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
            autoFocus
            aria-label={`Escribí ${PALABRA} para confirmar`}
            placeholder={PALABRA}
            className="spira-mono"
            style={confirmInput}
          />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,.10)', borderRadius: 8, padding: '8px 12px' }} aria-live="assertive">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 11, marginTop: 2 }}>
          <button type="button" onClick={onClose} style={{ ...btnOutline, height: 44 }}>Cancelar</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!puedeBorrar}
            style={{ ...btnDanger, height: 44, opacity: puedeBorrar ? 1 : 0.55, cursor: puedeBorrar ? 'pointer' : 'default' }}
          >
            <Icon name="trash" size={15} color="var(--spira-on-accent)" />
            {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const warnCard: CSSProperties = {
  background: 'rgba(166,72,59,.08)', border: '1px solid rgba(166,72,59,.30)', borderRadius: 12, padding: '12px 14px',
  display: 'flex', flexDirection: 'column', gap: 7,
}
const warnList: CSSProperties = {
  margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3,
  fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45,
}
const confirmInput: CSSProperties = {
  width: '100%', height: 44, padding: '0 13px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontSize: 14, letterSpacing: '.06em', boxShadow: 'var(--spira-shadow-sm)',
}
const btnDanger: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 16px', border: 'none', borderRadius: 10,
  background: 'var(--spira-danger)', color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
}
