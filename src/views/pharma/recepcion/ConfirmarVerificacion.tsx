import { Modal } from '../../../components/Modal'
import { btnOutline } from '../../../components/buttons'
import type { ReceptionRow } from '../../../data/pharma'
import { KIND_CHIP } from './ambitos'
import { resumenContenido } from './derivados'

/**
 * Confirmación antes de verificar.
 *
 * Verificar INGRESA STOCK y no tiene vuelta atrás: `verify_reception` rechaza la segunda pasada
 * (0032) y deshacerlo obliga a un ajuste manual con motivo escrito, en otra pantalla. El reskin
 * además hace el botón más grande y más visible que antes, así que el paso sin retorno quedó
 * más fácil de apretar; esto es la red que esa visibilidad pide.
 *
 * Muestra el número, no una pregunta abstracta: "¿estás seguro?" no informa nada, "van a entrar
 * 15 unidades" sí, y es justo el momento en que mirar esa cifra sirve para algo.
 */
export function ConfirmarVerificacion({ r, busy, onCancel, onConfirmar }: {
  r: ReceptionRow
  busy: boolean
  onCancel: () => void
  onConfirmar: () => void
}) {
  const ambito = KIND_CHIP[r.tipo] ?? KIND_CHIP.protocolo
  // El resumen sin el verbo: acá la frase la arma el modal ("van a entrar…").
  const contenido = resumenContenido(r).replace(/^trae /, '')

  return (
    <Modal
      title={`Verificar la recepción Nº ${r.folio}`}
      onClose={busy ? () => {} : onCancel}
      icon="check"
      accent="var(--spira-good)"
      accentSoft="rgba(92,138,90,.12)"
      maxWidth={460}
    >
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--spira-ink)' }}>
        Van a entrar a stock <strong>{contenido}</strong>.
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

      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
        Una vez ingresada, la recepción no se puede volver a verificar. Corregir un ingreso
        equivocado requiere un ajuste manual de stock con su motivo.
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btnOutline, height: 38 }}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirmar} disabled={busy} style={{ ...btnConfirmar, opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Ingresando…' : 'Ingresar a stock'}
        </button>
      </div>
    </Modal>
  )
}

const ficha = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: '0 0 16px' } as const
const dt = { fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)' } as const
const dd = { margin: 0, fontSize: 13.5, color: 'var(--spira-ink)', minWidth: 0, wordBreak: 'break-word' } as const
const btnConfirmar = {
  height: 38, padding: '0 16px', border: 'none', borderRadius: 10, background: 'var(--spira-good)',
  color: 'var(--spira-on-accent)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5,
  cursor: 'pointer',
} as const
