import type { CSSProperties } from 'react'
import { btnOutline, btnPrimary } from '../../../components/buttons'

/**
 * El pie de los formularios de «Agendar visita» (v0145): el error, «Cancelar» y «Agendar». Uno solo
 * para que los seis caminos digan lo mismo del mismo modo —el mock pide «Agendar» en todos— y no
 * seis copias que un día diverjan.
 */
export function PieDelFormulario({ error, busy, accent, onCancel, onConfirmar }: {
  error: string | null
  busy: boolean
  accent: string
  onCancel: () => void
  onConfirmar: () => void
}) {
  return (
    <>
      {error && <div style={cajaDeError}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnOutline}>Cancelar</button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={busy}
          style={{ ...btnPrimary(accent), opacity: busy ? 0.7 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Agendando…' : 'Agendar'}
        </button>
      </div>
    </>
  )
}

/** Una opción cuya lista quedó vacía: lo dice y deja cerrar, sin un «Agendar» que no llevaría a nada. */
export function SinCandidatas({ mensaje, onCancel }: { mensaje: string; onCancel: () => void }) {
  return (
    <>
      <div style={{ fontSize: 13.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>{mensaje}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={btnOutline}>Cerrar</button>
      </div>
    </>
  )
}

const cajaDeError: CSSProperties = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px',
}
