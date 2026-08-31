import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Drawer } from '../../../components/Drawer'
import { Icon } from '../../../components/Icon'
import { Modal } from '../../../components/Modal'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import type { DispensationRequestRow } from '../../../data/pharma'
import {
  activeDispensation, cancelDispensationPreparation, columnOf, constanciaVigente,
  origenLabel, rejectDispensationRequest, useDispensationRequest,
} from '../../../data/pharma'
import { chipExcepcion, COLUMN_META } from './estados'
import type { AccionMenu } from './MenuAcciones'
import { MenuAcciones } from './MenuAcciones'
import { ModalHistorial } from './ModalHistorial'
import { ModalReasignar } from './ModalReasignar'
import { RailProceso } from './RailProceso'
import { VisorConstancia } from './VisorConstancia'
import { PanelPreparando } from './PanelPreparando'
import { PanelLista } from './PanelLista'
import { PanelEntregada } from './PanelEntregada'
import { PanelRechazada } from './PanelRechazada'
import { ComprobanteImprimible } from './ComprobanteImprimible'

/**
 * El cajón: resuelve una solicitud sin sacar a la farmacéutica del tablero.
 *
 * Rutea al panel según el estado real (columnOf), y le pasa a Drawer el ref del campo de escaneo
 * para que el foco caiga ahí y no en el ✕ del encabezado — sin eso, el primer disparo del lector
 * de código de barras se pierde.
 */
export function DispensacionDrawer({ r: inicial, onClose: cerrarTablero, onChanged, onToast, onOpenPatient }: {
  r: DispensationRequestRow
  onClose: () => void
  /** Refresca el TABLERO. Se llama una sola vez, al cerrar (ver `refrescar` abajo). */
  onChanged: () => void
  onToast: (msg: string) => void
  onOpenPatient?: () => void
}) {
  /**
   * El cajón trabaja sobre su PROPIA copia del pedido, no sobre la del tablero.
   *
   * Con una pasada por unidad, hacer que cada escaneo recargara el tablero disparaba dos consultas
   * con todos los embeds por pasada —12 para un pedido de 6 unidades— y bloqueaba el contador en el
   * camino más caliente de la pantalla. Acá cada pasada recarga UNA fila.
   *
   * El servidor sigue siendo la única fuente de verdad del contador: no se guarda un conteo
   * optimista en memoria. En un sistema auditable no se muestra una unidad que la base no confirmó.
   */
  const { data: fresca, refetch: refrescar } = useDispensationRequest(inicial.id)
  const r = fresca ?? inicial

  // El tablero se entera al cerrar, de una sola vez: mientras el cajón está abierto lo tapa entero.
  const onClose = () => { onChanged(); cerrarTablero() }

  const scanRef = useRef<HTMLInputElement>(null)
  const [rejecting, setRejecting] = useState(false)
  const [viendoConstancia, setViendoConstancia] = useState(false)
  const [reasignando, setReasignando] = useState(false)
  const [viendoHistorial, setViendoHistorial] = useState(false)
  const [errAccion, setErrAccion] = useState<string | null>(null)

  const disp = activeDispensation(r)
  const column = columnOf(r)

  /**
   * Nombres de medicamento para el historial.
   *
   * El `audit_log` guarda `medication_id` y nada más, así que sin este mapa la crónica diría "se
   * escaneó 1 unidad" sin decir de qué — que es justo el dato que se viene a buscar. Se arma con lo
   * que el cajón YA tiene cargado (renglones pedidos + renglones entregados) en vez de con una
   * consulta nueva: son los mismos medicamentos y el historial se abre sobre un pedido ya abierto.
   *
   * Un id que no esté en el mapa —el medicamento VIEJO de una sustitución, un renglón borrado—
   * devuelve null y la línea se queda sin nombre, en vez de inventar uno.
   */
  const nombreMedicamento = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const i of r.items) if (i.medication?.name) mapa.set(i.medication_id, i.medication.name)
    for (const l of disp?.items ?? []) if (l.medication?.name) mapa.set(l.medication_id, l.medication.name)
    return (id: unknown) => (typeof id === 'string' ? mapa.get(id) ?? null : null)
  }, [r.items, disp])
  const rechazada = r.status === 'rechazada'
  const paciente = r.enrollment?.patient
  const protocolo = r.protocol
  const constancia = constanciaVigente(r)

  const titulo = disp?.dispensation_code
    ?? (rechazada ? 'Solicitud rechazada' : 'Solicitud de dispensación')
  const estado = rechazada ? 'Rechazada' : column ? COLUMN_META[column].estado : '—'

  // El riel solo tiene sentido sobre los tres pasos del flujo vivo. Una solicitud RECHAZADA está
  // fuera del recorrido (es terminal, no un paso), y una que todavía no se tomó no empezó ninguno:
  // dibujarles un riel sería inventarles una posición en un proceso en el que no están.
  const conRiel = !rechazada && column !== null && column !== 'solicitada'

  /**
   * Las acciones del menú ⋯. NINGUNA es decorativa: cada una hace algo de verdad. El handoff lo
   * anuncia como "Rechazar, reasignar, historial" y las tres se construyeron (0077); si alguna no
   * aplica al estado actual, no se dibuja, en vez de aparecer inerte.
   *
   * Orden: lo reversible primero, lo terminal último y lo más lejos posible del resto.
   */
  const acciones: AccionMenu[] = []
  const preparando = !rechazada && column === 'preparando'

  if (preparando) {
    acciones.push({
      id: 'cancelar', label: 'Cancelar preparación', icon: 'arrowLeft',
      onSelect: async () => {
        setErrAccion(null)
        const res = await cancelDispensationPreparation(r.id)
        if (res.error) { setErrAccion(res.error); return }
        onClose(); onToast('Preparación cancelada · vuelve a Solicitadas')
      },
    })
    acciones.push({
      id: 'reasignar', label: 'Reasignar a otra persona', icon: 'users',
      onSelect: () => setReasignando(true),
    })
  }

  // El historial va SIEMPRE: hace falta justo cuando el pedido está raro —volvió a la cola, tiene un
  // renglón que nadie pidió, el contador en cero—, y esos no son estados del camino feliz.
  acciones.push({
    id: 'historial', label: 'Ver historial', icon: 'clock',
    onSelect: () => setViendoHistorial(true),
  })

  if (!rechazada && (column === 'solicitada' || column === 'preparando')) {
    acciones.push({
      id: 'rechazar', label: 'Rechazar solicitud', icon: 'x',
      peligrosa: true,
      onSelect: () => setRejecting(true),
    })
  }

  return (
    <>
      <Drawer
        title={`${titulo} · ${estado}`}
        onClose={onClose}
        // 720 del handoff §4. El riel se lleva 240 fijos y al trabajo le quedan 480 — que es más de
        // lo que tenía antes, cuando el cajón entero medía 560. Aquellos 560 existían para que
        // entraran tres botones en el pie; ahora dos de esos tres viven en el menú ⋯.
        maxWidth={720}
        chrome="propio"
        initialFocusRef={column === 'preparando' ? scanRef : undefined}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <div style={head}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={tituloEstilo}>
                {titulo} · {estado}
              </h2>
              <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 5, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--spira-ink)', fontWeight: 600 }}>
                  <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${paciente?.full_name ?? 'este paciente'}`}>
                    {paciente?.full_name ?? '—'}
                  </PatientLink>
                </span>
                <span style={dot} />
                <span className="spira-mono">
                  {paciente?.code
                    ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${paciente.code}`}>{paciente.code}</PatientLink>
                    : '—'}
                </span>
                {onOpenPatient && <PatientLinkArrow />}
                <span style={dot} />
                <span className="spira-mono">{protocolo?.code ?? '—'}</span>
                <span style={dot} />
                {/* Origen real (0059). Antes decía "Coordinación" fijo, lo que pasaba a ser falso
                    en cuanto Pharma pudo dar de alta. */}
                <span>{origenLabel(r.requested_by_module)}</span>
              </div>

              {/* La excepción viaja con su MOTIVO (D11). Va en el encabezado y no adentro de un
                  panel para que se vea en los cuatro estados —preparando, lista, entregada,
                  rechazada— sin repetirla en cada uno: una excepción que solo conoce quien la hizo
                  no es una excepción auditada. Es el mismo texto que sale impreso en el
                  comprobante, así que acá se muestra el sellado en la fila, nunca uno recalculado.
                  El mock la aplana a un ítem más del subtítulo, lo que BORRARÍA el motivo: se
                  conserva el chip + texto a propósito. */}
              {r.off_schedule && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={chipExcepcion}>
                    <Icon name="info" size={11} stroke={2.4} />
                    Fuera de cronograma
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--spira-ink)' }}>
                    {r.off_schedule_reason ?? 'Sin motivo registrado'}
                  </span>
                </div>
              )}

              {errAccion && (
                <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', marginTop: 8 }} role="alert">
                  {errAccion}
                </div>
              )}
            </div>

            {acciones.length > 0 && <MenuAcciones acciones={acciones} />}

            <button
              type="button" onClick={onClose} aria-label="Cerrar" title="Cerrar"
              className="spira-icon-btn" style={cerrarBtn}
            >
              <Icon name="x" size={17} />
            </button>
          </div>

          {/* El cuerpo se parte: riel fijo de 240 a la izquierda, trabajo a la derecha. El
              `minHeight: 0` es obligatorio en los dos niveles — sin él, un hijo con scroll propio
              no se encoge y termina empujando el alto del cajón en vez de scrollear adentro. */}
          <div style={split}>
            {conRiel && <RailProceso r={r} actual={column} />}

            <div style={work}>
              {rechazada ? (
                <PanelRechazada r={r} onClose={onClose} />
              ) : column === 'preparando' ? (
                <PanelPreparando
                  r={r} scanRef={scanRef} onChanged={refrescar}
                  onVerConstancia={() => setViendoConstancia(true)}
                  visorAbierto={viendoConstancia}
                  onToast={onToast}
                />
              ) : column === 'lista' && disp ? (
                <PanelLista r={r} disp={disp} onChanged={refrescar} onClose={onClose} onPrint={() => window.print()} onToast={onToast} />
              ) : column === 'entregada' && disp ? (
                <PanelEntregada r={r} disp={disp} onClose={onClose} onPrint={() => window.print()} />
              ) : (
                <div style={{ padding: '18px 22px 22px', fontSize: 13, color: 'var(--spira-muted)' }}>
                  Esta solicitud todavía no se tomó. Cerrá el cajón y apretá <b>Preparar</b> en la card.
                </div>
              )}
            </div>
          </div>

          {/* Anclado al CAJÓN (el panel lleva `position: relative` por `chrome="propio"`), no al
              viewport: tapa la dispensación y deja ver que el tablero sigue detrás. Al cerrarlo, el
              foco vuelve al campo de escaneo, que es donde tiene que estar para el lector. */}
          {viendoConstancia && constancia && (
            <VisorConstancia
              doc={constancia}
              onClose={() => { setViendoConstancia(false); scanRef.current?.focus() }}
              onImpresa={refrescar}
            />
          )}
        </div>
      </Drawer>

      {reasignando && (
        <ModalReasignar
          requestId={r.id}
          onClose={() => setReasignando(false)}
          onHecho={(nombre) => {
            setReasignando(false); onClose()
            onToast(`Preparación reasignada a ${nombre}`)
          }}
        />
      )}

      {viendoHistorial && (
        <ModalHistorial
          requestId={r.id}
          codigo={titulo}
          nombreMedicamento={nombreMedicamento}
          onClose={() => setViendoHistorial(false)}
        />
      )}

      {rejecting && (
        <RejectModal
          request={r}
          onClose={() => setRejecting(false)}
          onDone={() => { setRejecting(false); onClose(); onToast('Solicitud rechazada') }}
        />
      )}

      {/* Solo existe en papel (@media print). Se monta con la dispensación en contexto para que
          window.print() imprima ESTE comprobante y no la pantalla. */}
      {disp && <ComprobanteImprimible r={r} disp={disp} />}
    </>
  )
}

/**
 * Rechazar es terminal y queda en el audit_log, así que el motivo es obligatorio (lo exige también
 * la RPC). Lo reversible es "Cancelar preparación", que es otra acción.
 */
function RejectModal({ request, onClose, onDone }: {
  request: DispensationRequestRow
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!reason.trim() || busy) return
    setBusy(true); setErr(null)
    const res = await rejectDispensationRequest(request.id, reason.trim())
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onDone()
  }

  return (
    <Modal title="Rechazar solicitud" onClose={onClose} maxWidth={480} icon="alertCircle" accent="var(--spira-danger)">
      <p style={{ fontSize: 13, color: 'var(--spira-muted)', lineHeight: 1.5, marginTop: 0 }}>
        El rechazo es definitivo y queda registrado con su motivo. Si solo querés soltar la
        preparación para que la tome otra persona, usá <b>Cancelar preparación</b>.
      </p>

      <label htmlFor="reject-reason" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6 }}>
        Motivo del rechazo
      </label>
      <textarea
        id="reject-reason"
        rows={3}
        value={reason}
        onChange={(e) => { setReason(e.target.value); setErr(null) }}
        placeholder="Ej.: sin stock disponible del lote requerido"
        style={textarea}
        autoFocus
      />

      {err && <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', marginTop: 9 }} role="alert">{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} style={btnOutline}>Volver</button>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={submit} disabled={!reason.trim() || busy}
          style={{ ...btnPrimary('var(--spira-danger)'), opacity: !reason.trim() || busy ? 0.6 : 1 }}
        >
          {busy ? 'Un momento…' : 'Rechazar solicitud'}
        </button>
      </div>
    </Modal>
  )
}

/** Encabezado propio del cajón (el `Drawer` cede el suyo con `chrome="propio"`). Blanco sobre el
 *  papel del cajón, con filete abajo: separa el "quién y qué" del trabajo, sin cerrarlo en una caja. */
const head: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '16px 22px 15px',
  background: 'var(--spira-white)', borderBottom: '1px solid var(--spira-line)', flex: '0 0 auto',
}

const tituloEstilo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700,
  letterSpacing: '-0.01em', color: 'var(--spira-ink)', margin: 0,
}

const cerrarBtn: CSSProperties = {
  width: 32, height: 32, borderRadius: 9, background: 'transparent',
  // Longhands: el hover le pinta el borde y mezclar la abreviada lo dejaría roto al salir.
  borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
  color: 'var(--spira-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer',
  flex: '0 0 auto',
}

/** `minHeight: 0` para que los dos hijos puedan scrollear por dentro en vez de estirar el cajón. */
const split: CSSProperties = { display: 'flex', flex: 1, minHeight: 0 }

const work: CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0,
}

const dot: CSSProperties = {
  width: 3, height: 3, borderRadius: '50%', background: 'var(--spira-line-2)',
}

const textarea: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--spira-line-2)',
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
}
