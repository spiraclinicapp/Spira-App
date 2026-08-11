import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Icon } from '../../../components/Icon'
import { ScanField } from '../wizard/ScanField'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow } from '../../../data/pharma'
import {
  cancelDispensationPreparation,
  markDispensationReady,
  scanDispensationItem,
  unscanDispensationItem,
} from '../../../data/pharma'
import { constanciaVigente } from '../../../data/pharma'
import { ConstanciaAcciones, ConstanciaVista } from '../ConstanciaIp'
import { COLUMN_META, readyBlockedReason } from './estados'
import { ItemRow, fromRequestItem } from './ItemRow'

/**
 * El paso de preparar: escanear cada renglón contra su código de barras.
 *
 * DISEÑADO PARA EL LECTOR, NO PARA EL MOUSE. Un lector de código de barras es un teclado que tipea
 * rápido y manda Enter. Si el foco se va del campo, el disparo se pierde o se escribe en cualquier
 * lado; en un turno de alto volumen eso pasa decenas de veces. Por eso:
 *   · el cajón enfoca el campo al abrir (initialFocusRef, no el ✕ del encabezado),
 *   · el campo recupera el foco solo al perderlo, salvo que haya ido a un control real del panel,
 *   · una tecla imprimible en cualquier parte del panel redirige al campo.
 *
 * El escaneo se valida SERVER-SIDE (scan_dispensation_item): el código se resuelve contra el
 * catálogo y se matchea contra un renglón pendiente. Los mensajes de error salen de la base, así
 * que no hay dos verdades sobre qué es un escaneo válido.
 */
export function PanelPreparando({ r, scanRef, onChanged, onClose, onReject, onToast }: {
  r: DispensationRequestRow
  scanRef: RefObject<HTMLInputElement | null>
  onChanged: () => void
  onClose: () => void
  onReject: () => void
  onToast: (msg: string) => void
}) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const blocked = readyBlockedReason(r)
  const scannedCount = r.items.filter((i) => i.scanned_at !== null).length
  const constancia = constanciaVigente(r)

  // Captura global dentro del panel: si la farmacéutica dispara el lector con el foco en otro lado,
  // la tecla igual entra al campo. Sin esto el primer disparo después de cualquier click se pierde.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
      const active = document.activeElement
      if (active === scanRef.current) return
      // No robamos el foco si está tipeando en otro campo de verdad.
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      scanRef.current?.focus()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [scanRef])

  const doScan = async () => {
    const value = code.trim()
    if (!value || busy) return
    setBusy(true)
    setErr(null)
    const res = await scanDispensationItem(r.id, value)
    setBusy(false)
    if (res.error) { setErr(res.error); scanRef.current?.focus(); return }
    setCode('')
    onChanged()
    if (res.result?.remaining === 0) onToast('Todo escaneado · ya podés marcarla lista')
    scanRef.current?.focus()
  }

  const doUnscan = async (itemId: string) => {
    setBusy(true)
    const res = await unscanDispensationItem(itemId)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    scanRef.current?.focus()
  }

  const doReady = async () => {
    if (blocked || busy) return
    setBusy(true)
    setErr(null)
    const res = await markDispensationReady(r.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onToast(`${res.dispensationCode ?? 'Dispensación'} lista · comprobante N° ${res.correlative} generado`)
  }

  const doCancel = async () => {
    setBusy(true)
    setErr(null)
    const res = await cancelDispensationPreparation(r.id)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onChanged()
    onClose()
    onToast('Preparación cancelada · vuelve a Solicitadas')
  }

  return (
    <>
      <div ref={bodyRef} style={body}>
        {/* El IP va ARRIBA de los renglones a propósito: acá la constancia no es un adjunto, es lo
            primero que hay que hacer. La farmacéutica la abre, la imprime y la entrega junto con la
            medicación (D2), así que enterrarla debajo de la lista de escaneo sería ponerla justo
            donde nadie la busca. */}
        {r.includes_ip && (
          <section style={ipBox}>
            <div style={ipTitulo}>
              <Icon name="flask" size={15} color="var(--spira-pharma-solid)" />
              Producto en investigación
            </div>

            {constancia ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* La plana ENTERA (348px), no una miniatura: es el papel que se imprime y se
                    entrega, y un recorte puede dejar afuera el número de kit o la firma. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ConstanciaVista doc={constancia} size="grande" accent="var(--spira-pharma-solid)" />
                </div>
                <div style={{ flex: '0 0 auto', width: 156 }}>
                  <ConstanciaAcciones doc={constancia} layout="columna" accent="var(--spira-pharma-solid)" />
                </div>
              </div>
            ) : (
              // Sin constancia el pedido no puede cerrarse (`readyBlockedReason` lo bloquea). Se dice
              // acá, arriba, y no solo abajo en el pie: es lo que hay que ir a buscar, y quien tiene
              // que cargarla es Coordinación, no Farmacia.
              <div style={faltaBox} role="alert">
                <Icon name="alert" size={15} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
                <div>
                  Falta la constancia del IRT
                  <span style={{ display: 'block', fontWeight: 400, color: 'var(--spira-ink-soft)', marginTop: 2 }}>
                    La carga Coordinación desde la visita. Sin ella no se puede emitir el comprobante.
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Un pedido de IP solo no tiene ningún renglón: mostrarle el campo de escaneo y una lista
            vacía sería pedirle que escanee algo que no existe. */}
        {r.items.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Icon name="barcode" size={17} color="var(--spira-pharma-solid)" />
              <span style={{ fontSize: 13, color: 'var(--spira-ink)' }}>Escaneá cada medicamento para confirmarlo</span>
              <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
                · {scannedCount}/{r.items.length}
              </span>
            </div>

            <ScanField
              label="Código de barras"
              placeholder="Escaneá o tipeá el código…"
              value={code}
              onChange={(v) => { setCode(v); setErr(null) }}
              onSubmit={doScan}
              accentSolid="var(--spira-pharma-solid)"
              inputRef={scanRef}
            />
          </>
        )}

        {err && (
          <div style={errBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>{err}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {r.items.map((i) => (
            <ItemRow key={i.id} {...fromRequestItem(i)} onUnscan={() => doUnscan(i.id)} />
          ))}
        </div>

        {/* La nota dice lo que de verdad va a pasar. El FEFO y el descuento de stock son de la
            medicación de base; el IP no tiene lote ni vencimiento que asignar y descuenta recién al
            ENTREGAR, que es el paso irreversible. Prometer acá que "descuenta el stock" sobre un
            pedido de IP solo sería contar mal lo que hace el botón de al lado. */}
        <div style={noteBox}>
          <Icon name="clock" size={15} color="var(--spira-muted)" />
          <span>
            {r.items.length > 0 && (
              <>Al marcar lista, el sistema asigna el lote por vencimiento (FEFO), descuenta el stock y emite el comprobante. </>
            )}
            {r.items.length === 0 && <>Al marcar lista, el sistema emite el comprobante. </>}
            {r.includes_ip && <>Los kits de producto en investigación se declaran y descuentan al <b>entregar</b>.</>}
          </span>
        </div>
      </div>

      {/* El motivo del bloqueo va en su PROPIA línea, arriba de los botones. Colgado debajo del
          CTA empujaba la fila y la hacía envolver: los dos secundarios quedaban arriba y el
          primario descolgado abajo. Acá el footer tiene una altura estable la aparezca o no. */}
      <div style={foot}>
        {blocked && (
          <div style={motivo}>
            <Icon name={blocked.icon} size={14} color="var(--spira-muted)" />
            {blocked.text}
          </div>
        )}

        {/* Jerarquía: Rechazar es terminal, así que es la MENOS prominente y va más lejos del CTA.
            Cancelar preparación es reversible. Avanzar es lo único sólido. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={onReject} disabled={busy} style={ghostDanger}>Rechazar</button>
          <button type="button" onClick={doCancel} disabled={busy} style={btnOutline}>Cancelar preparación</button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={doReady}
            disabled={!!blocked || busy}
            style={{
              // El deshabilitado conserva su color y baja a opacity 0.6, que es la convención del
              // sistema (DESIGN.md §Buttons). Repintarlo de beige lo sacaba de la paleta y lo hacía
              // leer como un bloque sucio en vez de como el mismo botón, apagado.
              ...btnPrimary(COLUMN_META.lista.color),
              whiteSpace: 'nowrap',
              cursor: blocked || busy ? 'default' : 'pointer',
              opacity: blocked || busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Un momento…' : 'Marcar lista para retirar'}
          </button>
        </div>
      </div>
    </>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const motivo: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  fontSize: 12.5, color: 'var(--spira-muted)',
}

const ghostDanger: CSSProperties = {
  height: 40, padding: '0 12px', border: 'none', background: 'transparent',
  color: 'var(--spira-muted)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 14,
  cursor: 'pointer',
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 11, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}

/** El bloque del IP se separa del escaneo con un filete y aire, no con un fondo teñido: adentro va
 *  un previsualizador de documento y un tinte detrás le compite el foco a la propia constancia. */
const ipBox: CSSProperties = { marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--spira-line)' }

const ipTitulo: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11,
  fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)',
}

const faltaBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', borderRadius: 10,
  background: 'rgba(176, 130, 63, 0.13)', fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600,
}

const noteBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}
