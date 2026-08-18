import { useState } from 'react'
import { Modal } from '../../../components/Modal'
import { FormField, fieldInput } from '../../../components/FormField'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline } from '../../../components/buttons'
import type { ReceptionRow } from '../../../data/pharma'
import { KIND_CHIP } from './ambitos'
import { armarMotivo, contenidoDe } from './derivados'

/** Motivos preestablecidos: desplegable, no texto libre. Menos error del operador y, sobre todo,
 *  motivos comparables entre sí cuando alguien audite por qué se anularon seis recepciones. */
const MOTIVOS = [
  'Cargada por error',
  'Duplicada',
  'Cargamento rechazado',
  'Datos incorrectos (lote o vencimiento)',
  'Otro',
]

/**
 * Confirmación antes de anular — el espejo de `ConfirmarVerificacion`.
 *
 * Dice el NÚMERO delante, igual que su hermana: "van a salir de stock 15 unidades" informa, "¿estás
 * seguro?" no informa nada. La diferencia con verificar es que acá el número puede no existir: una
 * pendiente nunca entró a stock, y decirlo es justamente lo que baja el susto de la operación.
 *
 * El error se muestra ACÁ ADENTRO y el modal queda abierto. Es lo contrario de lo que hace el de
 * verificar, y a propósito: el error típico de anular —"del lote quedan 2 y esta recepción ingresó
 * 5"— no se arregla reintentando, se lee y se decide otra cosa. Cerrar el modal para mostrarlo en
 * la banda obligaría a volver a abrirlo para leer con qué motivo se estaba intentando.
 */
export function AnularRecepcion({ r, busy, error, onCancel, onConfirmar }: {
  r: ReceptionRow
  busy: boolean
  /** Mensaje del intento fallido. Viene de la base y suele traer los números del bloqueo. */
  error: string | null
  onCancel: () => void
  onConfirmar: (reason: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [falta, setFalta] = useState(false)

  const ambito = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  const verificada = r.status === 'verificada'

  const confirmar = () => {
    if (!motivo) { setFalta(true); return }
    setFalta(false)
    onConfirmar(armarMotivo(motivo, nota))
  }

  return (
    <Modal
      title={`Anular la recepción Nº ${r.folio}`}
      onClose={busy ? () => {} : onCancel}
      icon="x"
      accent="var(--spira-danger)"
      accentSoft="rgba(166,72,59,.12)"
      maxWidth={460}
    >
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--spira-ink)' }}>
        {verificada
          ? <>Van a salir de stock <strong>{contenidoDe(r)}</strong>.</>
          : <>Esta recepción <strong>nunca entró a stock</strong>: no hay nada que revertir.</>}
      </p>

      <dl style={ficha}>
        <dt style={dt}>Ámbito</dt>
        <dd style={dd}>
          <span style={{ color: ambito.color, fontWeight: 600 }}>{ambito.label}</span>
          {r.protocol && <span className="spira-mono" style={{ marginLeft: 8, color: 'var(--spira-ink-2)' }}>{r.protocol.code}</span>}
        </dd>
        {r.items.length > 0 && (
          <>
            <dt style={dt}>Lotes</dt>
            <dd style={dd}>
              <span className="spira-mono">{r.items.map((it) => it.lot_number).join(' · ')}</span>
            </dd>
          </>
        )}
      </dl>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '0 0 16px' }}>
        <FormField label="Motivo">
          <SearchableSelect
            value={motivo}
            onChange={(v) => { setMotivo(v); setFalta(false) }}
            options={MOTIVOS.map((m) => ({ value: m, label: m }))}
            placeholder="Elegí un motivo"
            searchPlaceholder="Buscar motivo…"
            entity="motivo"
          />
        </FormField>
        <FormField label="Nota (opcional)">
          <input value={nota} onChange={(e) => setNota(e.target.value)} style={fieldInput} />
        </FormField>
      </div>

      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--spira-ink-soft)', lineHeight: 1.5 }}>
        {verificada
          ? 'La anulación queda asentada en el libro de stock junto con su motivo. La recepción no se borra: sigue en la lista, marcada como anulada.'
          : 'La recepción no se borra: sigue en la lista, marcada como anulada y con su motivo. No se puede reactivar.'}
      </p>

      {(falta || error) && (
        <div style={cajaError} role="alert">
          {falta ? 'Elegí un motivo para poder anular.' : error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btnOutline, height: 38 }}>
          Cancelar
        </button>
        <button type="button" onClick={confirmar} disabled={busy} style={{ ...btnAnular, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Anulando…' : 'Anular recepción'}
        </button>
      </div>
    </Modal>
  )
}

const ficha = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '0 0 16px' } as const
const dt = { fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' } as const
const dd = { margin: 0, fontSize: 13.5, color: 'var(--spira-ink)', minWidth: 0, wordBreak: 'break-word' } as const
const cajaError = {
  fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166,72,59,.10)',
  borderRadius: 8, padding: '9px 12px', margin: '0 0 14px', lineHeight: 1.45,
} as const
const btnAnular = {
  height: 38, padding: '0 16px', border: 'none', borderRadius: 10, background: 'var(--spira-danger)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
  cursor: 'pointer',
} as const
