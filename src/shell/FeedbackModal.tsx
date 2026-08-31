import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../components/Modal'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { submitFeedback } from '../data/feedback'
import type { FeedbackType } from '../data/feedback'

/* ============================================================================
   FeedbackModal — "Dar feedback". Reusa Modal.tsx (scrim + Esc + click-afuera +
   foco + aria + botón cerrar); acá va el form + la pantalla de gracias.

   Tipo (chips) + mensaje + contexto autoadjuntado (módulo · versión · usuario).
   El envío va por submitFeedback() → RPC submit_feedback (actor server-side).
   Estados reales: default / enviando / error sereno / éxito. El acento es del
   módulo activo (se pasa como prop).
   ============================================================================ */

interface FeedbackModalProps {
  moduleKey: string
  moduleFull: string
  subKey: string
  accent: string
  accentSolid: string
  onClose: () => void
}

const TYPES: { key: FeedbackType; label: string; icon: IconName }[] = [
  { key: 'sugerencia', label: 'Sugerencia', icon: 'message' },
  { key: 'problema', label: 'Problema', icon: 'alert' },
  { key: 'idea', label: 'Idea', icon: 'heart' },
]

export function FeedbackModal({ moduleKey, moduleFull, subKey, accent, accentSolid, onClose }: FeedbackModalProps) {
  const { profile } = useAuth()
  const userName = profile?.fullName ?? 'Usuario'

  const [type, setType] = useState<FeedbackType>('sugerencia')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (!msg.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await submitFeedback({
      type, message: msg.trim(), module: moduleKey, version: __APP_VERSION__, route: `${moduleKey}/${subKey}`,
    })
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setSent(true)
  }

  return (
    <Modal
      title={sent ? '¡Gracias!' : 'Dar feedback'}
      icon={sent ? 'check' : 'message'}
      accent={sent ? 'var(--spira-good)' : accent}
      accentSoft={sent ? 'rgba(92, 138, 90, 0.16)' : accent + '16'}
      onClose={onClose}
      maxWidth={560}
    >
      {sent ? (
        <div role="status" style={{ padding: '24px 10px 12px', textAlign: 'center' }}>
          <span style={successIcon}>
            <Icon name="check" size={30} stroke={2.4} color="var(--spira-good)" />
          </span>
          <div style={{ fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 22, color: 'var(--spira-ink)' }}>
            ¡Gracias por tu feedback!
          </div>
          <p style={{ fontSize: 14.5, color: 'var(--spira-muted)', maxWidth: 360, margin: '8px auto 20px', lineHeight: 1.5 }}>
            Lo tenemos en cuenta para seguir mejorando Spira.
          </p>
          <button type="button" onClick={onClose} style={solidBtn(accentSolid)}>Cerrar</button>
        </div>
      ) : (
        <div>
          {/* tipo */}
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Tipo</div>
          <div style={{ display: 'flex', gap: 9, marginBottom: 20, flexWrap: 'wrap' }}>
            {TYPES.map((t) => {
              const on = type === t.key
              return (
                <button key={t.key} type="button" onClick={() => setType(t.key)} aria-pressed={on} style={typeChip(on, accent)}>
                  <Icon name={t.icon} size={16} color={on ? accent : 'var(--spira-faint)'} /> {t.label}
                </button>
              )
            })}
          </div>

          {/* mensaje */}
          <div className="spira-eyebrow" style={{ marginBottom: 9 }}>Mensaje</div>
          <textarea
            autoFocus
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            maxLength={2000}
            placeholder="Contanos qué mejorarías de Spira. No incluyas datos de pacientes (nombre, DNI…)."
            style={textareaStyle}
          />

          {/* contexto autoadjuntado */}
          <div style={contextBox}>
            <Icon name="info" size={15} color="var(--spira-faint)" />
            <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.4 }}>
              Se adjunta automáticamente: <b style={{ color: 'var(--spira-ink)' }}>{moduleFull}</b> · v{__APP_VERSION__} · {userName}
            </span>
          </div>

          {error && <div style={errorBox}>{error}</div>}

          {/* footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={cancelBtn}>Cancelar</button>
            <button
              type="button"
              onClick={send}
              disabled={!msg.trim() || busy}
              style={msg.trim() && !busy ? solidBtn(accentSolid) : disabledBtn}
            >
              {busy ? 'Enviando…' : (<>Enviar feedback <Icon name="arrowRight" size={16} color="var(--spira-on-accent)" /></>)}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* —— estilos —— */
const successIcon: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 58, height: 58, borderRadius: '50%',
  background: 'rgba(92, 138, 90, 0.12)', marginBottom: 14,
}
function typeChip(on: boolean, accent: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', borderRadius: 11,
    fontFamily: 'var(--spira-font-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${on ? accent : 'var(--spira-line-2)'}`,
    background: on ? accent + '12' : 'var(--spira-white)',
    color: on ? accent : 'var(--spira-muted)',
  }
}
const textareaStyle: CSSProperties = {
  width: '100%', minHeight: 128, resize: 'vertical', padding: '13px 15px', borderRadius: 12,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontSize: 14.5, lineHeight: 1.5, boxSizing: 'border-box',
}
const contextBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, padding: '10px 12px',
  background: 'var(--spira-surface)', border: '1px solid var(--spira-line)', borderRadius: 10,
}
const errorBox: CSSProperties = {
  marginTop: 12, fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)',
  borderRadius: 10, padding: '10px 12px',
}
function solidBtn(accentSolid: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 20px', borderRadius: 11,
    border: 'none', background: accentSolid, color: 'var(--spira-on-accent)',
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  }
}
const disabledBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 20px', borderRadius: 11,
  border: 'none', background: 'var(--spira-line)', color: 'var(--spira-muted)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14, cursor: 'default',
}
const cancelBtn: CSSProperties = {
  height: 42, padding: '0 16px', borderRadius: 11, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}
