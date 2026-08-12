import { useState } from 'react'
import type { CSSProperties } from 'react'
import { substituteDispensationItem, useAlternativas } from '../../../data/pharma'

/**
 * El panel de sustitución, desplegado DENTRO de la tarjeta del renglón.
 *
 * Se despliega ahí y no en un modal a propósito: sustituir es una corrección menor sobre una fila
 * concreta, con la caja en la mano. Un modal la trataría como una decisión de la que hay que salir
 * y volver, y taparía justo el renglón del que se está hablando.
 *
 * DICE LO QUE VA A PASAR ANTES DE QUE PASE. "Usar este" no solo cambia el renglón: también habilita
 * esa presentación para el paciente (es lo que exige el candado de la 0050). Ocultarlo sería que la
 * farmacéutica modifique la medicación habilitada de una persona sin enterarse.
 */
export function PanelSustitucion({ itemId, paciente, onHecho, onCancelar }: {
  itemId: string
  /** Nombre del paciente, para nombrar a quién se le habilita la alternativa. */
  paciente: string
  onHecho: (nombre: string) => void
  onCancelar: () => void
}) {
  const { data: alternativas, loading, error } = useAlternativas(itemId)
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const usar = async (medicationId: string, nombre: string) => {
    if (busy) return
    setBusy(medicationId); setErr(null)
    const res = await substituteDispensationItem(itemId, medicationId, motivo.trim() || null)
    setBusy(null)
    if (res.error) { setErr(res.error); return }
    onHecho(nombre)
  }

  return (
    <div style={caja}>
      <div className="spira-eyebrow" style={{ fontSize: 10.5, letterSpacing: '0.12em' }}>
        Mismo fármaco · misma concentración
      </div>

      {loading && <div style={aviso}>Buscando equivalentes…</div>}
      {error && <div style={{ ...aviso, color: 'var(--spira-danger)' }} role="alert">{error}</div>}

      {!loading && !error && alternativas?.length === 0 && (
        // Honesto sobre por qué no hay nada: una lista vacía sin explicación manda a buscar el
        // problema donde no está.
        <div style={aviso}>
          No hay otra presentación de este fármaco asignada al protocolo. Si hace falta una, se carga
          desde el catálogo antes de poder sustituir.
        </div>
      )}

      {alternativas?.map((a) => (
        <div key={a.medication_id} style={{ ...alt, ...(a.bloqueada ? altNo : {}) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--spira-muted)', marginTop: 1 }}>
              {a.dosis && <>{a.dosis} · </>}{a.presentacion} · {a.stock} u. en stock
              {a.motivo && <> · {a.motivo}</>}
            </div>
          </div>

          {a.bloqueada ? (
            <button type="button" disabled title={a.motivo ?? undefined} style={pickNo}>Bloqueado</button>
          ) : (
            <button
              type="button" onClick={() => usar(a.medication_id, a.nombre)}
              disabled={busy !== null || a.stock === 0}
              title={a.stock === 0 ? 'Sin stock en este protocolo' : undefined}
              style={{ ...pick, opacity: busy !== null || a.stock === 0 ? 0.55 : 1 }}
            >
              {busy === a.medication_id ? 'Un momento…' : 'Usar este'}
            </button>
          )}
        </div>
      ))}

      {(alternativas?.length ?? 0) > 0 && (
        <>
          <label htmlFor={`motivo-${itemId}`} style={etiqueta}>
            Motivo <span style={{ fontWeight: 400, color: 'var(--spira-faint)' }}>(opcional)</span>
          </label>
          <input
            id={`motivo-${itemId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: el lote pedido está vencido"
            style={campo}
          />
        </>
      )}

      {err && <div style={{ ...aviso, color: 'var(--spira-danger)' }} role="alert">{err}</div>}

      <div style={pie}>
        <span aria-hidden style={puntoAmbar} />
        <span style={{ flex: 1 }}>
          Queda registrado en la trazabilidad, y habilita esa presentación para {paciente}.
        </span>
        <button type="button" onClick={onCancelar} style={cerrar}>Cancelar</button>
      </div>
    </div>
  )
}

const caja: CSSProperties = {
  padding: '12px 14px 13px', background: 'var(--spira-surface)',
  borderTop: '1px solid var(--spira-line-2)',
}

const aviso: CSSProperties = {
  fontSize: 12, color: 'var(--spira-muted)', marginTop: 8, lineHeight: 1.45,
}

const alt: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', marginTop: 7,
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 9,
}

const altNo: CSSProperties = { opacity: 0.55 }

const pick: CSSProperties = {
  flex: '0 0 auto', height: 30, padding: '0 11px', borderRadius: 8, border: 'none',
  background: 'var(--spira-primary)', color: 'var(--spira-on-accent)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
}

const pickNo: CSSProperties = {
  flex: '0 0 auto', height: 30, padding: '0 11px', borderRadius: 8,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-surface)', color: 'var(--spira-faint)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, cursor: 'default',
}

const etiqueta: CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--spira-muted)',
  marginTop: 11, marginBottom: 5,
}

const campo: CSSProperties = {
  width: '100%', height: 34, padding: '0 11px', borderRadius: 8,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12.5, color: 'var(--spira-ink)',
  boxSizing: 'border-box',
}

const pie: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 11,
  fontSize: 11.5, color: 'var(--spira-muted)', lineHeight: 1.4,
}

const puntoAmbar: CSSProperties = {
  width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
  background: 'var(--spira-warn)', marginTop: 4,
}

const cerrar: CSSProperties = {
  flex: '0 0 auto', border: 'none', background: 'transparent', padding: '2px 6px',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 11.5,
  color: 'var(--spira-muted)', cursor: 'pointer',
}
