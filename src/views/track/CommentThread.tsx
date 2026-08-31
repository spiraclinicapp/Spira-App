import { useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Icon } from '../../components/Icon'
import { initialsOf } from '../../lib/initials'
import { fromNow } from '../../lib/dates'
import { useVisitComments, addVisitComment } from '../../data/visitComments'

/**
 * Hilo de comentarios de una visita, reusado igual en el Drawer de la cola del médico y en el panel
 * "Comentarios" del detalle de visita (`VisitDetail`). Modelo plano: avatar (tinte del acento del
 * módulo, no por-rol) + nombre + chip de puesto SOBRIO (surface/muted, "color con intención") + hora
 * relativa + burbuja. Composer de textarea: Enter envía, Shift+Enter salta de línea. Maneja todos los
 * estados: carga, error (con Reintentar), vacío (con calidez) y envío en vuelo.
 *
 * Nota: los comentarios se pueden escribir SIEMPRE (también desde la ficha en `context="patient"`):
 * "solo lectura" en el detalle aplica a las etapas operativas, no a dejar una nota.
 */
export function CommentThread({ visitId, accent = 'var(--spira-track)', onAdded }: {
  visitId: string
  accent?: string
  /** Se llama tras agregar un comentario, para que el padre refresque su contador (badge de la fila). */
  onAdded?: () => void
}) {
  const q = useVisitComments(visitId)
  const [txt, setTxt] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const comments = q.data ?? []
  const canSend = !!txt.trim() && !sending

  const send = async () => {
    const body = txt.trim()
    if (!body || sending) return
    setSending(true); setErr(null)
    const res = await addVisitComment(visitId, body)
    setSending(false)
    if (res.error) { setErr(res.error); return }
    setTxt('')
    q.refetch()
    onAdded?.()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter deja escribir varias líneas (aclaración clínica larga).
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {q.loading && comments.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '4px 0' }}>Cargando comentarios…</div>
      ) : q.error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '9px 12px' }}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            No pudimos cargar los comentarios.
          </div>
          <button type="button" onClick={() => q.refetch()} style={retryBtn}>Reintentar</button>
        </div>
      ) : comments.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '18px 14px', textAlign: 'center' }}>
          <Icon name="message" size={22} color="var(--spira-faint)" />
          <div style={{ fontSize: 13, color: 'var(--spira-muted)' }}>Todavía no hay comentarios.</div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Escribí el primero para el equipo.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 11 }}>
              <div style={avatar(accent)}>{initialsOf(c.author_name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.author_name}</span>
                  <span style={roleChip}>{c.author_role}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginLeft: 'auto' }}>{fromNow(c.created_at)}</span>
                </div>
                <div style={bubble}>{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* composer: textarea (Enter envía, Shift+Enter salta) + Enviar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--spira-line)', paddingTop: 12 }}>
        {err && <div style={{ fontSize: 12.5, color: 'var(--spira-danger)' }}>{err}</div>}
        <textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Escribí un comentario…  (Enter envía · Shift+Enter salta de línea)"
          disabled={sending}
          style={composer}
        />
        <button type="button" onClick={() => void send()} disabled={!canSend} style={sendBtn(canSend, accent)}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

const avatar = (accent: string): CSSProperties => ({
  width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto',
  background: accent + '1F', color: accent, display: 'grid', placeItems: 'center',
  fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 11,
})
const roleChip: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)',
  whiteSpace: 'nowrap',
}
const bubble: CSSProperties = {
  fontSize: 13.5, marginTop: 4, lineHeight: 1.5, background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '9px 12px',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
}
const composer: CSSProperties = {
  minHeight: 44, resize: 'vertical', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontSize: 13.5, lineHeight: 1.5, padding: '10px 12px',
}
const retryBtn: CSSProperties = {
  alignSelf: 'flex-start', height: 34, padding: '0 14px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const sendBtn = (active: boolean, accent: string): CSSProperties => ({
  alignSelf: 'flex-end', height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
  background: active ? accent : 'var(--spira-line)',
  color: active ? 'var(--spira-on-accent)' : 'var(--spira-muted)',
  cursor: active ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5,
})
