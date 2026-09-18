import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { SearchableSelect } from '../components/SearchableSelect'
import { btnOutline } from '../components/buttons'
import { DEVIATION_REASONS, desviacionLista, recordDeviation } from '../data/deviations'

/** La visita que se está documentando (lo que necesita el RPC + cómo nombrarla). */
export interface DocumentandoTarget {
  visitId: string
  label: string
}

/**
 * Documentar la desviación de protocolo de una visita con la ventana vencida (0130).
 *
 * GEMELO del modal de descarte, y a propósito: el gesto es el mismo y las dos acciones viven en el
 * mismo ítem, así que verse distinto diría que son cosas de otra naturaleza. Lo que cambia es lo
 * que dicen. Descartar archiva un aviso ("esta alerta no correspondía"); documentar REGISTRA un
 * hecho clínico ("el desvío ocurrió, y acá está el porqué"), que es lo que un monitor va a leer
 * meses después.
 *
 * Por eso acá la explicación NO es opcional: en el descarte sólo la exige el motivo "otro", y
 * ninguna de las dos reglas está escrita dos veces — las dos salen de su modelo puro y testeado
 * (`desviacionLista`), que es la misma que corta del lado de la mutación.
 */
export function DocumentarDesviacionModal({ target, accent, onClose, onDone, onError }: {
  target: DocumentandoTarget
  accent: string
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const listo = desviacionLista(reason, detail)

  const confirmar = async () => {
    if (!listo || busy) return
    setBusy(true)
    setErr(null)
    const { error } = await recordDeviation({ visitId: target.visitId, reason, detail })
    setBusy(false)
    if (error) { setErr(error); onError(error); return }
    onDone()
  }

  return (
    // Sin `icon`: el Modal ya trae su X de cerrar arriba a la derecha (mismo criterio que el modal
    // de descarte, donde dos cruces que no hacen lo mismo confundían).
    <Modal title="Documentar la desviación" onClose={onClose} accent={accent}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--spira-ink)' }}>
          {target.label}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--spira-muted)' }}>
          Queda registrado <strong style={{ fontWeight: 600 }}>qué pasó con esta visita</strong>, con
          tu nombre y la fecha. La visita no cambia de estado y no se borra nada: sale de la lista de
          pendientes porque ya está explicada.
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Motivo</div>
          <SearchableSelect
            value={reason}
            onChange={(v) => setReason(v)}
            options={DEVIATION_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
            entity="motivo"
          />
        </div>
        <div>
          {/* SIEMPRE visible, no sólo con "Otro": el motivo clasifica, esto explica. Es la
              diferencia deliberada con el modal de descarte. */}
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Qué pasó</div>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Lo va a leer un monitor dentro de unos meses."
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 10,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
              fontFamily: 'var(--spira-font-text)', fontSize: 13.5, color: 'var(--spira-ink)',
              background: 'var(--spira-white)',
            }}
          />
        </div>
        {err && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>
            <Icon name="alertCircle" size={16} color="var(--spira-danger)" />
            {err}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!listo || busy}
            aria-disabled={!listo || busy}
            className={!listo || busy ? 'spira-no-press' : undefined}
            style={{
              ...btnOutline,
              background: listo && !busy ? accent : 'var(--spira-line)',
              borderColor: listo && !busy ? accent : 'var(--spira-line)',
              color: listo && !busy ? 'var(--spira-white)' : 'var(--spira-faint)',
              cursor: listo && !busy ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Documentando…' : 'Documentar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
