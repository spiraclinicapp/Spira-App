import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow, DispensationRow } from '../../../data/pharma'
import { cancelDispensationPreparation, constanciaVigente, deliverDispensation } from '../../../data/pharma'
import { ConstanciaAcciones, ConstanciaVista } from '../ConstanciaIp'
import { COLUMN_META } from './estados'
import { ItemRow, fromDispensationLine } from './ItemRow'
import { ModalKitsIp } from './ModalKitsIp'

/**
 * Lista para retirar: el comprobante ya existe, el lote está asignado y el stock descontado.
 * Falta que el paciente venga a buscarla.
 *
 * "Cancelar preparación" también vive acá, no solo en el paso anterior: si se marcó lista y el
 * paciente no aparece nunca, la medicación tiene que poder volver al stock. Sin este botón, el
 * stock quedaría descontado para siempre por una entrega que no ocurrió.
 */
export function PanelLista({ r, disp, onChanged, onClose, onPrint, onToast }: {
  r: DispensationRequestRow
  disp: DispensationRow
  onChanged: () => void
  onClose: () => void
  onPrint: () => void
  onToast: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const constancia = constanciaVigente(r)
  // Arranca en '0' y no vacío ni en 1 (D10): el campo tiene que existir y verse PENDIENTE. Un 1 por
  // defecto se confirma en piloto automático, y un campo vacío no se lee como "falta declarar".
  const [kitsCampo, setKitsCampo] = useState('0')
  const [pidiendoKits, setPidiendoKits] = useState(false)
  const kitsSinDeclarar = !(parseInt(kitsCampo, 10) >= 1)
  /** ¿Se preparó medicación de base? Con cero renglones (IP solo) no hay lote ni stock que devolver. */
  const hayBase = disp.items.length > 0

  /**
   * Entrega. Con IP el número de kits es obligatorio y **acá es donde se descuenta el stock**: en el
   * IP no hay lote ni FEFO que reservar, así que no hay nada que sacar al marcar lista; `entregada`
   * es el paso irreversible y es el lugar donde corresponde congelar un dato que después no se
   * corrige.
   *
   * `kits` llega por parámetro solo desde el pop-up. Ojo con llamarla directo desde un `onClick`:
   * React pasaría el evento como primer argumento y se colaría un MouseEvent donde va un número —
   * por eso el botón la envuelve en una flecha.
   */
  const doDeliver = async (kits?: number) => {
    const ipKits = r.includes_ip ? (kits ?? (parseInt(kitsCampo, 10) || 0)) : null
    if (r.includes_ip && (ipKits === null || ipKits < 1)) { setErr(null); setPidiendoKits(true); return }
    setBusy(true); setErr(null)
    const res = await deliverDispensation(disp.id, ipKits)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setPidiendoKits(false)
    onChanged()
    onToast(`${disp.dispensation_code ?? 'Dispensación'} entregada`)
  }

  const doCancel = async () => {
    setBusy(true); setErr(null)
    const res = await cancelDispensationPreparation(r.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged(); onClose()
    // Sin renglones no volvió ningún lote: el IP no se descuenta hasta entregar, así que no hay nada
    // que devolver. Prometer una devolución que no ocurrió es exactamente lo que no puede hacer una
    // app auditable.
    onToast(hayBase
      ? 'Preparación cancelada · el stock volvió al lote'
      : 'Preparación cancelada · vuelve a Solicitadas')
  }

  return (
    <>
      <div style={body}>
        <Comprobante number={disp.correlative_number} code={disp.dispensation_code} tone={COLUMN_META.lista.color} icon="receipt" />

        <div style={noteTeal}>
          <Icon name="check" size={15} />
          Verificada y lista. Imprimí el comprobante para tenerlo a mano; al retirar, la medicación
          se entrega con el comprobante sellado y firmado, y va a la carpeta del paciente.
        </div>

        {/* La constancia sigue a mano en el mostrador: acá ya no se prepara nada, pero el papel se
            entrega junto con el producto y muchas veces hay que volver a imprimirlo (se traspapeló,
            salió mal, el paciente quiere copia). Chica y no grande: en este paso alcanza con
            reconocerla — la tarjeta entera amplía si hace falta leerla. */}
        {(constancia || r.includes_ip) && (
          <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>Producto en investigación</p>
        )}

        {constancia && (
          <>
            <ConstanciaVista doc={constancia} size="chica" accent="var(--spira-pharma-solid)" />
            <div style={{ marginTop: 9 }}>
              <ConstanciaAcciones doc={constancia} layout="fila" accent="var(--spira-pharma-solid)" />
            </div>
          </>
        )}

        {/* Los kits (D10). El campo vive acá y no en el pop-up porque lo normal es declararlos
            mientras se arma la entrega, con la constancia a la vista; el pop-up es el freno para
            cuando se llegó al final sin declararlos. Mientras siga en 0 se pinta PENDIENTE —punteado,
            tinta atenuada, píldora— para que no se lea como un número declarado más. */}
        {r.includes_ip && (
          <div style={{ marginTop: constancia ? 14 : 0 }}>
            <label htmlFor="kits-entregados" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }}>
              Kits entregados
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="kits-entregados"
                type="number" min={1} step={1} value={kitsCampo}
                onChange={(e) => { setKitsCampo(e.target.value); setErr(null) }}
                style={{
                  ...kitsInput,
                  borderStyle: kitsSinDeclarar ? 'dashed' : 'solid',
                  color: kitsSinDeclarar ? 'var(--spira-faint)' : 'var(--spira-ink)',
                }}
              />
              {kitsSinDeclarar && <span style={pillPendiente}>Sin declarar</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', marginTop: 6, lineHeight: 1.45 }}>
              Descuenta del stock de IP del protocolo al entregar, y no se corrige después.
            </div>
          </div>
        )}

        {/* Un pedido de IP solo no preparó ningún renglón: el rótulo "Preparado — 0 ítems" sobre una
            lista vacía haría dudar de si algo se perdió. */}
        {disp.items.length > 0 && (
          <>
            <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 9 }}>
              Preparado — {disp.items.length} {disp.items.length === 1 ? 'ítem' : 'ítems'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {disp.items.map((l) => <ItemRow key={l.id} {...fromDispensationLine(l)} />)}
            </div>
          </>
        )}

        {err && <div style={errBox} role="alert"><Icon name="alertCircle" size={15} /><span>{err}</span></div>}

        {confirmCancel ? (
          <div style={confirmBox} role="alert">
            <div style={{ fontSize: 12.5, color: 'var(--spira-ink)', marginBottom: 9 }}>
              {hayBase
                ? <>Cancelar devuelve el stock al lote y la solicitud vuelve a Solicitadas. </>
                : <>Cancelar devuelve la solicitud a Solicitadas. </>}
              El comprobante N° {disp.correlative_number} queda reservado para esta solicitud.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={doCancel} disabled={busy} style={btnPrimary('var(--spira-danger)')}>
                {busy ? 'Un momento…' : 'Sí, cancelar'}
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)} style={btnOutline}>Volver</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmCancel(true)} style={ghost}>
            {hayBase ? 'Cancelar preparación y devolver el stock' : 'Cancelar preparación'}
          </button>
        )}
      </div>

      <div style={foot}>
        <button type="button" onClick={onPrint} style={{ ...btnOutline, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="printer" size={16} color="var(--spira-muted)" />
          Imprimir
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={() => doDeliver()} disabled={busy}
          style={{ ...btnPrimary(COLUMN_META.lista.color), display: 'flex', alignItems: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}
        >
          <Icon name="check" size={17} color="#fff" />
          {/* "Marcar como entregado" y no "Entregar al paciente" (Director, 2026-08-11): el botón no
              entrega nada — la entrega la hace la farmacéutica en el mostrador, con la medicación en
              la mano. Acá se REGISTRA que ya ocurrió, que es un acto distinto y es el que sella el
              comprobante y descuenta el IP. */}
          {busy ? 'Un momento…' : 'Marcar como entregado'}
        </button>
      </div>

      {pidiendoKits && (
        <ModalKitsIp
          busy={busy}
          error={err}
          onClose={() => { setPidiendoKits(false); setErr(null) }}
          onConfirm={(k) => doDeliver(k)}
        />
      )}
    </>
  )
}

/** La tarjeta del comprobante: el número grande es el dato que la farmacéutica dicta y anota. */
export function Comprobante({ number, code, tone, icon }: {
  number: number
  code: string | null
  tone: string
  icon: 'receipt' | 'check'
}) {
  return (
    <div style={{ ...comprobante, borderColor: tone.startsWith('var') ? 'var(--spira-line)' : `${tone}4d` }}>
      <div style={{ ...cico, background: 'var(--spira-surface)', color: tone }}>
        <Icon name={icon} size={24} color={tone} />
      </div>
      <div className="spira-mono" style={{ fontFamily: 'var(--spira-font-display)', fontSize: 34, fontWeight: 700, color: tone, lineHeight: 1.1 }}>
        N° {number}
      </div>
      <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 4 }}>
        Comprobante de dispensación · nota fuente
      </div>
      {code && (
        <div className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-ink)', marginTop: 9, fontWeight: 600 }}>
          {code}
        </div>
      )}
    </div>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const comprobante: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 14, padding: '22px 20px',
  background: 'var(--spira-white)', textAlign: 'center',
}

const cico: CSSProperties = {
  width: 52, height: 52, borderRadius: 14, display: 'grid', placeItems: 'center', margin: '0 auto 12px',
}

const noteTeal: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: COLUMN_META.lista.color, background: 'rgba(46, 125, 116, 0.08)',
  border: '1px solid rgba(46, 125, 116, 0.25)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}

const confirmBox: CSSProperties = {
  marginTop: 16, padding: '12px 13px', borderRadius: 10,
  border: '1px solid rgba(166, 72, 59, 0.25)', background: 'rgba(166, 72, 59, 0.06)',
}

/** Borde en longhands: el estado "sin declarar" pisa `borderStyle` y `color`, y mezclarlo con la
 *  abreviada `border` deja el borde roto en el render siguiente (ver CLAUDE.md, §Convenciones). */
const kitsInput: CSSProperties = {
  width: 120, height: 44, borderRadius: 11,
  borderWidth: 1, borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 13px', boxSizing: 'border-box',
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 19,
}

const pillPendiente: CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)',
  color: 'var(--spira-acc-deep-pharma)', background: 'rgba(176, 130, 63, 0.18)',
}

const ghost: CSSProperties = {
  marginTop: 16, height: 34, padding: 0, border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontSize: 12.5,
  textDecoration: 'underline', cursor: 'pointer',
}
