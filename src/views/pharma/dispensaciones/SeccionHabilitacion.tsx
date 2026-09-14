import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { habilitarMedicamentoPedido, openIpDocument, useStock } from '../../../data/pharma'
import type { DispensationRequestRow, HabilitacionRow } from '../../../data/pharma'
import { ModalNoHabilitar } from './ModalNoHabilitar'

/**
 * «Pide habilitar un medicamento», arriba de todo en el cajón de un pedido en preparación (0124, D22,
 * mock 9). Va donde va la constancia del IP y por la misma razón: es lo primero que hay que resolver,
 * porque cambia lo que se arma. Hasta que se resuelve, «Marcar lista» espera (`requisitos()`).
 *
 * «Habilitar y sumar al pedido» activa el medicamento para el paciente SÓLO para esta entrega y suma
 * el renglón a escanear, en una transacción. «No habilitar» pide un motivo de lista.
 */
export function SeccionHabilitacion({ r, habilitaciones, onChanged, onToast }: {
  r: DispensationRequestRow
  habilitaciones: HabilitacionRow[]
  onChanged: () => void
  onToast: (msg: string) => void
}) {
  // Stock del protocolo del pedido: Farmacia lo lee sin lotes desde la vista de stock (0032).
  const stock = useStock(r.protocol?.id ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [noHabilitar, setNoHabilitar] = useState<HabilitacionRow | null>(null)
  const paciente = r.enrollment?.patient?.full_name ?? 'el paciente'

  const habilitar = async (h: HabilitacionRow) => {
    if (busy) return
    setBusy(h.id); setErr(null)
    const res = await habilitarMedicamentoPedido(h.id)
    setBusy(null)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onToast(`${h.medication?.name ?? 'Medicamento'} habilitado y sumado · escanealo con el resto`)
  }

  const verReceta = async (h: HabilitacionRow) => {
    setErr(null)
    const e = await openIpDocument(h.receta_path)
    if (e) setErr(e)
  }

  return (
    <section style={box}>
      {habilitaciones.map((h) => {
        const nombre = h.medication?.name ?? 'Medicamento'
        const enStock = (stock.data ?? []).find((s) => s.medication_id === h.medication_id)?.total_stock
        const cantidad = h.quantity_indicated ? `${h.quantity} u. (de ${h.quantity_indicated} indicados)` : `${h.quantity} u.`
        return (
          <div key={h.id} style={{ marginBottom: 14 }}>
            <div style={titulo}>
              <Icon name="fileText" size={15} color="var(--spira-pharma-solid)" />
              Pide habilitar un medicamento
            </div>
            <div style={tarjeta}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>
                {nombre} · {cantidad}{h.saldo_de_item_id ? ' · saldo' : ''}
              </div>
              <div style={meta}>
                {[
                  h.medication?.drug?.name,
                  enStock !== undefined ? `${enStock} en stock de ${r.protocol?.code ?? 'el protocolo'}` : null,
                  h.origen_habilitacion_id ? 'receta ya aprobada' : h.receta_file_name,
                ].filter(Boolean).join(' · ')}
              </div>
              <button type="button" onClick={() => void verReceta(h)} style={linkBtn}>
                <Icon name="eye" size={14} color="var(--spira-pharma-solid)" /> Ver la receta
              </button>
              <div style={nota}>
                <Icon name="info" size={14} color="var(--spira-muted)" style={{ flex: '0 0 auto', marginTop: 1 }} />
                <span>Se habilita para {paciente} sólo para esta entrega y se suma a este pedido. Queda registrado en la trazabilidad.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => { setNoHabilitar(h); setErr(null) }} disabled={!!busy} style={btnOutline}>
                  No habilitar
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button" onClick={() => void habilitar(h)} disabled={!!busy}
                  style={{ ...btnPrimary('var(--spira-pharma-solid)'), opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
                >
                  {busy === h.id ? 'Un momento…' : 'Habilitar y sumar al pedido'}
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {err && <div style={errBox} role="alert">{err}</div>}

      {noHabilitar && (
        <ModalNoHabilitar
          habilitacionId={noHabilitar.id}
          nombre={noHabilitar.medication?.name ?? 'el medicamento'}
          onClose={() => setNoHabilitar(null)}
          onHecho={() => {
            const nombre = noHabilitar.medication?.name ?? 'El medicamento'
            setNoHabilitar(null)
            onChanged()
            onToast(`${nombre} no se habilitó · Coordinación ve el motivo en la visita`)
          }}
        />
      )}
    </section>
  )
}

/** Mismo separador que el bloque del IP: filete y aire, sin fondo teñido. */
const box: CSSProperties = { marginBottom: 18, paddingBottom: 4, borderBottom: '1px solid var(--spira-line)' }

const titulo: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11,
  fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)',
}

const tarjeta: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 12, background: 'var(--spira-white)', padding: '13px 14px',
}

const meta: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, lineHeight: 1.4 }

const linkBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '2px 0', border: 'none',
  background: 'transparent', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600,
  fontSize: 12.5, color: 'var(--spira-pharma-solid)',
}

const nota: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10, fontSize: 12, color: 'var(--spira-muted)', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.28)', borderRadius: 10, padding: '10px 12px', marginBottom: 14,
}
