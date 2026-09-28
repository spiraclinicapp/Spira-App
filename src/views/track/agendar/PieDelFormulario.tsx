import type { CSSProperties } from 'react'
import { btnOutline, btnPrimary } from '../../../components/buttons'

/**
 * El pie de los formularios de «Agendar visita» (v0145): el error, «Cancelar» y «Agendar». Uno solo
 * para que los seis caminos digan lo mismo del mismo modo —el mock pide «Agendar» en todos— y no
 * seis copias que un día diverjan.
 *
 * `fecha` es la GUARDA CENTRAL contra una fecha vacía: el modal la resuelve en `null` cuando el
 * DateField se vació a propósito (ver el comentario en `AgendarVisitaModal`), y acá —el único lugar
 * por el que pasan los seis caminos para confirmar— se bloquea «Agendar» y se muestra «Elegí la
 * fecha.» en vez de dejar que cualquier formulario llegue a llamar a su RPC con una fecha vacía.
 * Opcional: `FormTraerVisita` usa `dia` (el día que se mira en Visitas, nunca vacío) y no la pasa —
 * sin la prop no hay guarda, porque ahí no hace falta.
 */
export function PieDelFormulario({ error, busy, accent, fecha, onCancel, onConfirmar }: {
  error: string | null
  busy: boolean
  accent: string
  fecha?: string | null
  onCancel: () => void
  onConfirmar: () => void
}) {
  const sinFecha = fecha === null
  const mensaje = sinFecha ? 'Elegí la fecha.' : error
  return (
    <>
      {mensaje && <div style={cajaDeError}>{mensaje}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnOutline}>Cancelar</button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={busy || sinFecha}
          style={{ ...btnPrimary(accent), opacity: busy || sinFecha ? 0.7 : 1, cursor: busy || sinFecha ? 'default' : 'pointer' }}
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
