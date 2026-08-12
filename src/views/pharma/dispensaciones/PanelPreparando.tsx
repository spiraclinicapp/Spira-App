import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Icon } from '../../../components/Icon'
import { ScanField } from '../wizard/ScanField'
import { btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow } from '../../../data/pharma'
import {
  constanciaVigente,
  markDispensationReady,
  scanDispensationItem,
  todoEscaneado,
  totalUnits,
  unidadesOk,
  unscanDispensationItem,
} from '../../../data/pharma'
import { COLUMN_META, readyBlockedReason } from './estados'
import { ItemRow, fromRequestItem } from './ItemRow'
import { PanelSustitucion } from './PanelSustitucion'
import { TarjetaConstancia } from './TarjetaConstancia'

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
export function PanelPreparando({ r, scanRef, onChanged, onVerConstancia, visorAbierto, onToast }: {
  r: DispensationRequestRow
  scanRef: RefObject<HTMLInputElement | null>
  onChanged: () => void
  /** Abre el visor de la constancia, que vive en el cajón (se ancla al panel entero). */
  onVerConstancia: () => void
  /** El visor está abierto: hay que soltarle el foco y apagar la captura de teclas. */
  visorAbierto: boolean
  onToast: (msg: string) => void
}) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Id del renglón con el panel de sustitución abierto. Uno a la vez: dos paneles desplegados
   *  sobre la misma lista es exactamente donde se sustituye el renglón equivocado. */
  const [sustituyendo, setSustituyendo] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const blocked = readyBlockedReason(r)
  const constancia = constanciaVigente(r)
  const paciente = r.visit?.enrollment?.patient?.full_name ?? 'este paciente'
  const uTot = totalUnits(r)
  const uOk = unidadesOk(r)
  const completo = todoEscaneado(r)

  // Captura global dentro del panel: si la farmacéutica dispara el lector con el foco en otro lado,
  // la tecla igual entra al campo. Sin esto el primer disparo después de cualquier click se pierde.
  //
  // SE APAGA CON EL VISOR ABIERTO. El handoff pide que el campo no se enfoque mientras se mira la
  // constancia (§5.2), y esta captura hacía justo lo contrario: cualquier tecla —incluidas las de
  // zoom— arrastraba el foco de vuelta al escaneo y sacaba al usuario del visor. Las dos reglas se
  // peleaban; gana el visor, que es lo que la persona está mirando.
  useEffect(() => {
    const el = bodyRef.current
    if (!el || visorAbierto) return
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
  }, [scanRef, visorAbierto])

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
              // La plana entera de 348px se cambió por MINIATURA + VISOR. El motivo de aquella
              // decisión —no recortar el papel, que un recorte puede dejar afuera el número de kit
              // o la firma— se respeta mejor así: el visor lo muestra completo Y con lupa, mientras
              // que acá la miniatura solo tiene que decir "es este documento". Lo que se ganó es el
              // ancho: con el riel de 240px al trabajo le quedan 480, y 348 de constancia se los comía.
              <TarjetaConstancia doc={constancia} onVer={onVerConstancia} />
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
            <ScanField
              label="Código de barras"
              placeholder="Escaneá o tipeá el código…"
              value={code}
              onChange={(v) => { setCode(v); setErr(null) }}
              onSubmit={doScan}
              accentSolid="var(--spira-pharma-solid)"
              inputRef={scanRef}
            />

            {/* El hint se REEMPLAZA por el error, no se apila con él: dos líneas de ayuda debajo del
                campo, una diciendo cómo trabajar y otra que algo salió mal, se leen peleadas. */}
            {err ? (
              <div style={errBox} role="alert">
                <Icon name="alertCircle" size={15} />
                <span>{err}</span>
              </div>
            ) : (
              <div style={hint}>
                {completo
                  ? 'Todo escaneado'
                  : 'El lector escribe y confirma solo · una pasada por unidad'}
              </div>
            )}

            {/* Contador de UNIDADES, no de renglones: un renglón de 3 necesita tres pasadas y el
                número grande tiene que contar lo mismo que cuenta el lector. */}
            <div style={ctop}>
              <span style={ctopK}>{uOk}/{uTot}</span>
              <span style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>unidades escaneadas</span>
              <span
                style={{
                  marginLeft: 'auto', fontSize: 12, fontWeight: 600,
                  color: completo ? 'var(--spira-good)' : 'var(--spira-primary-deep)',
                }}
              >
                {completo ? 'Completo' : `Faltan ${uTot - uOk}`}
              </span>
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: r.items.length > 0 ? 0 : 16 }}>
          {r.items.map((i) => (
            <ItemRow
              key={i.id}
              {...fromRequestItem(i)}
              onUnscan={() => doUnscan(i.id)}
              accionExtra={
                <button
                  type="button"
                  onClick={() => setSustituyendo((v) => (v === i.id ? null : i.id))}
                  aria-expanded={sustituyendo === i.id}
                  style={{ ...sustBtn, ...(sustituyendo === i.id ? sustBtnOn : {}) }}
                >
                  Sustituir
                </button>
              }
              desplegado={sustituyendo === i.id ? (
                <PanelSustitucion
                  itemId={i.id}
                  paciente={paciente}
                  onCancelar={() => { setSustituyendo(null); scanRef.current?.focus() }}
                  onHecho={(nombre) => {
                    setSustituyendo(null)
                    onChanged()
                    scanRef.current?.focus()
                    onToast(`Sustituido por ${nombre} · registrado en trazabilidad`)
                  }}
                />
              ) : undefined}
            />
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

        {/* Rechazar y Cancelar preparación se mudaron al menú ⋯ del encabezado. Acá queda SOLO el
            camino feliz: el pie de un cajón que se opera con lector no es lugar para poner la acción
            terminal a un centímetro de la que se aprieta veinte veces por turno. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

const sustBtn: CSSProperties = {
  flex: '0 0 auto', padding: '6px 9px', borderRadius: 8, whiteSpace: 'nowrap',
  // Longhands: el estado abierto pisa el color del borde.
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12, cursor: 'pointer',
}

const sustBtnOn: CSSProperties = {
  background: 'var(--spira-primary)', borderColor: 'var(--spira-primary)',
  color: 'var(--spira-on-accent)',
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 11, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.28)', borderRadius: 10, padding: '10px 12px',
  lineHeight: 1.4,
}

/** Ayuda bajo el campo. Ocupa el lugar del error, nunca los dos a la vez. */
const hint: CSSProperties = {
  fontSize: 12, color: 'var(--spira-muted)', marginTop: 11,
}

/** Contador grande de unidades, sobre la lista de renglones. */
const ctop: CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 10, margin: '18px 0 12px',
}

/** Tipografía de TEXTO y no mono (handoff §10, decisión 8), con cifras de ancho fijo para que el
 *  número no baile mientras la farmacéutica pasa cajas por el lector. */
const ctopK: CSSProperties = {
  fontFamily: 'var(--spira-font-text)', fontSize: 23, fontWeight: 700,
  letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: 'var(--spira-ink)',
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
