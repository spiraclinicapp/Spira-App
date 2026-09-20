import { useState } from 'react'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { fieldLabelStyle } from '../../../components/FormField'
import { dateToISO, formatShortAR } from '../../../lib/dates'
import {
  MOTIVOS_ANULACION, MOTIVOS_CIERRE, cerrarFaltantePedido, diaMes, faltaTxt, pastillaDePedido, reabrirFaltantePedido, sePuedeCerrar, textoPeriodo,
} from '../../../data/pharma'
import type { MotivoCierre, PedidoMedicacion, RenglonPedido } from '../../../data/pharma'
import { AnularPedido } from './AnularPedido'
import { Pastilla, botonChico, errorTexto, mayuscula, plural, rotuloTabla } from './piezas'

const COLUMNAS = 'minmax(0, 1fr) 64px 76px 56px 150px'
const fechaDe = (ts: string) => formatShortAR(dateToISO(new Date(ts)))
const motivoDe = (lista: readonly { value: string; label: string }[], v: string | null) => lista.find((m) => m.value === v)?.label ?? ''

/**
 * El pedido (R11, mocks «5 · El pedido», «No va a llegar», «Un renglón cerrado se puede reabrir», «Llegó,
 * falta verificar»). Por renglón: pedido, recibido y lo que falta. «No va a llegar» cierra lo que falta con
 * un motivo elegido de la lista (RD10) y «Reabrir» lo deshace (RD2). Reimprimir es de todos; lo demás, de
 * Farmacia operator.
 */
export function PedidoDetalle({ p, estudio, puedeEditar, accentSolid, onClose, onCambio, onReimprimir }: {
  p: PedidoMedicacion
  estudio: { code: string; name: string }
  puedeEditar: boolean
  accentSolid: string
  onClose: () => void
  /** Algo cambió en la base: la pantalla vuelve a pedir y este modal se redibuja con el pedido nuevo. */
  onCambio: () => void
  onReimprimir: () => void
}) {
  const [cerrando, setCerrando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState(false)

  const pastilla = pastillaDePedido(p)
  const vivo = p.estado !== 'anulado'
  const anulable = puedeEditar && vivo && p.recepciones.length === 0
  const hayCerrados = p.renglones.some((r) => r.cerrado_at)
  const sub = `${estudio.code} · ${estudio.name} · para el período ${textoPeriodo({ desde: p.periodo_desde, hasta: p.periodo_hasta })} · emitido el ${diaMes(p.emitido_el)}${p.emitido_por_nombre ? ` por ${p.emitido_por_nombre}` : ''}`
  const estadoTexto = !vivo
    ? `Anulado el ${p.anulado_at ? fechaDe(p.anulado_at) : '—'}${p.anulado_por_nombre ? ` por ${p.anulado_por_nombre}` : ''} · ${motivoDe(MOTIVOS_ANULACION, p.anulado_motivo)}`
    : pastilla.clave === 'llego' ? 'El stock se actualiza cuando se verifica la recepción.'
      : p.faltanteTotal > 0 ? mayuscula(faltaTxt(p.faltanteTotal))
        : ''

  async function cerrar(r: RenglonPedido) {
    if (!motivo || ocupado) return
    setOcupado(r.id); setError(null)
    const res = await cerrarFaltantePedido(r.id, motivo as MotivoCierre)
    setOcupado(null)
    if (res.error) { setError(res.error); return }
    setCerrando(null); setMotivo(''); onCambio()
  }

  async function reabrir(r: RenglonPedido) {
    if (ocupado) return
    setOcupado(r.id); setError(null)
    const res = await reabrirFaltantePedido(r.id)
    setOcupado(null)
    if (res.error) { setError(res.error); return }
    onCambio()
  }

  const notaDe = (r: RenglonPedido) => r.cerrado_at
    ? `No va a llegar · ${motivoDe(MOTIVOS_CIERRE, r.cerrado_motivo)} · ${fechaDe(r.cerrado_at)}${r.cerrado_por_nombre ? `, ${r.cerrado_por_nombre}` : ''}`
    : r.sin_verificar > 0 ? `${r.presentacion ? `${r.presentacion} · ` : ''}${r.sin_verificar} en la recepción sin verificar`
      : r.presentacion ?? ''

  return (
    <>
      <Modal title={`Pedido Nº ${p.numero}`} onClose={onClose} maxWidth={580}>
        <p style={{ fontSize: 13, color: 'var(--spira-muted)', margin: '-8px 0 14px', lineHeight: 1.45 }}>{sub}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <Pastilla p={pastilla} />
          {estadoTexto && <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>{estadoTexto}</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, borderBottom: '1px solid var(--spira-line-2)' }}>
          <div style={rotuloTabla}>Medicamento</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Pedido</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Recibido</div>
          <div style={{ ...rotuloTabla, textAlign: 'right' }}>Falta</div>
          <div />
        </div>
        {p.renglones.map((r, i) => (
          <div key={r.id} style={{ borderBottom: i === p.renglones.length - 1 ? 'none' : '1px solid var(--spira-line)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 8, alignItems: 'center', padding: '11px 0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--spira-ink)' }}>{r.medication_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 2 }}>{notaDe(r)}</div>
              </div>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{r.pedido}</span>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: 'var(--spira-ink)' }}>{r.recibido}</span>
              <span className="spira-mono" style={{ fontSize: 14, textAlign: 'right', color: r.faltante === 0 ? 'var(--spira-ink-soft)' : 'var(--spira-acc-deep-warn)' }}>{r.faltante}</span>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {/* Con una recepción sin verificar en el renglón, primero se verifica: cerrar mandaría a la compra
                    lo que ya está en la casa. La regla es la de la base (0133), en `sePuedeCerrar`. */}
                {vivo && puedeEditar && sePuedeCerrar(r) && cerrando !== r.id && (
                  <button type="button" className="spira-card-link" style={botonChico} onClick={() => { setCerrando(r.id); setMotivo('') }}>No va a llegar</button>
                )}
                {vivo && puedeEditar && r.cerrado_at && (
                  <button type="button" className="spira-card-link" style={botonChico} disabled={ocupado === r.id} onClick={() => void reabrir(r)}>
                    <Icon name="rotateCcw" size={13} color={accentSolid} />{ocupado === r.id ? 'Reabriendo…' : 'Reabrir'}
                  </button>
                )}
              </div>
            </div>
            {cerrando === r.id && (
              <div style={{ margin: '0 0 12px', padding: 14, borderRadius: 11, background: 'var(--spira-surface)', border: '1px solid var(--spira-line)' }}>
                <div style={{ fontSize: 13, color: 'var(--spira-ink)', marginBottom: 10, lineHeight: 1.45 }}>
                  {r.faltante === 1
                    ? 'El envase que falta deja de estar en camino y vuelve a la compra.'
                    : `Los ${r.faltante} envases que faltan dejan de estar en camino y vuelven a la compra.`} Se puede reabrir si al final llega.
                </div>
                <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Por qué no va a llegar</div>
                <div style={{ maxWidth: 300 }}>
                  <SearchableSelect value={motivo} onChange={setMotivo} options={MOTIVOS_CIERRE} placeholder="Elegí un motivo" searchable="never" entity="motivo" />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="button" disabled={!motivo || ocupado === r.id} onClick={() => void cerrar(r)}
                    style={{ ...btnPrimary(accentSolid), height: 38, opacity: !motivo || ocupado === r.id ? 0.6 : 1 }}>
                    {ocupado === r.id ? 'Cerrando…' : 'Cerrar lo que falta'}
                  </button>
                  <button type="button" onClick={() => { setCerrando(null); setMotivo('') }} style={{ ...btnOutline, height: 38 }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {p.recepciones.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)', marginBottom: 6 }}>
              {p.recepciones.length === 1 ? 'Recepción de este pedido' : 'Recepciones de este pedido'}
            </div>
            {p.recepciones.map((rc) => (
              <div key={rc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--spira-ink)', padding: '4px 0', flexWrap: 'wrap' }}>
                <Icon name="clipboardCheck" size={15} color={accentSolid} />
                <span className="spira-mono" style={{ fontWeight: 600 }}>Recepción Nº {rc.folio}</span>
                <span style={{ color: rc.status === 'pendiente' ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)' }}>
                  {diaMes(rc.reception_date)} · {rc.status === 'pendiente' ? 'sin verificar' : `verificada${rc.verified_by_name ? ` por ${rc.verified_by_name}` : ''}`} · {plural(rc.envases, 'envase', 'envases')}
                </span>
              </div>
            ))}
          </div>
        )}

        {vivo && p.recepciones.length > 0 && p.faltanteTotal > 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '14px 0 0', lineHeight: 1.45 }}>
            Ya tiene una recepción, así que no se puede anular. Lo que falta sigue en camino hasta que llegue o se cierre.
          </p>
        )}
        {vivo && hayCerrados && puedeEditar && (
          <p style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', margin: '14px 0 0', lineHeight: 1.45 }}>
            Si al final la farmacia lo manda, «Reabrir» lo vuelve a poner en camino y se recibe con este pedido. Queda registrado quién y cuándo.
          </p>
        )}
        {error && <p role="alert" style={{ ...errorTexto, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={onReimprimir} style={{ ...btnOutline, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="printer" size={16} />Reimprimir
          </button>
          {anulable && <button type="button" onClick={() => setAnulando(true)} style={btnOutline}>Anular pedido</button>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={btnOutline}>Cerrar</button>
        </div>
      </Modal>
      {/* Hermano y no hijo del modal de arriba: el `Modal` no se portalea, y un fixed adentro de otro queda
          atado a su caja. La pila de Escape de `Modal` cierra primero este, que se abrió último. */}
      {anulando && (
        <AnularPedido p={p} estudio={estudio} onClose={() => setAnulando(false)} onAnulado={() => { setAnulando(false); onCambio() }} />
      )}
    </>
  )
}
