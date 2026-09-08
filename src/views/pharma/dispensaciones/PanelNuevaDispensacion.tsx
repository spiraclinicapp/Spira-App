import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { usePatients } from '../../../data/patients'
import { usePatientMedications } from '../../../data/pharma'
import { useVisitasDispensables, createDispensationRequest, registrarVnp } from '../../../data/pharma'
import type { RequestItemInput, VisitaDispensableRow } from '../../../data/pharma'
import { formatAR, todayISO } from '../../../lib/dates'
import { visitTitle } from '../../../lib/visits'
import {
  MOTIVOS_FUERA_CRONOGRAMA,
  MOTIVO_VNP,
  FALTA_MOTIVO_MSG,
  necesitaMotivoFueraCronograma,
} from '../motivosFueraCronograma'
import { opcionesDeEnrolamiento } from './opcionesEnrolamiento'

/**
 * Alta manual desde el mostrador (el "Nueva dispensación" del handoff).
 *
 * LO QUE CAMBIÓ EN 2026-09-08, y por qué la versión anterior de este comentario ya no aplica:
 * decía que "la dispensación cuelga de una VISITA, no de un paciente suelto" y presentaba el
 * filtro de visitas como un candado deliberado. La primera mitad sigue siendo cierta; la segunda
 * era un malentendido. La base NUNCA exigió que la visita fuera del cronograma: desde la 0071,
 * `create_dispensation_request` acepta CUALQUIER visita mientras venga un motivo fuera de
 * cronograma, y eso es lo que Coordinación hace todos los días desde el panel de la visita. El
 * que estaba desactualizado era este desplegable, que además escondía las VNP por un INNER JOIN
 * contra `visit_definitions` (una suelta nace sin definición). La farmacéutica con el paciente
 * enfrente no tenía contra qué dispensar.
 *
 * LOS CANDADOS QUE SÍ SON CANDADOS, y ninguno es burocracia:
 *
 * 1 · Toda dispensación es trazable a un acto clínico. Se elige una visita real, y si el
 *     cronograma no la preveía, se DECLARA EL MOTIVO — que es la única puerta que tiene la base
 *     para saltear esa validación, y queda sellado en la fila (`off_schedule`) y en el
 *     comprobante impreso. La salida no es aflojar el modelo: es declarar la excepción.
 *
 * 2 · Se elige el ENROLAMIENTO, no el paciente. Un paciente puede estar en varios protocolos y
 *     la medicación, las visitas y los lotes cuelgan del enrolamiento: elegir "la persona" y
 *     resolver el protocolo por el primero de la lista imputaba la entrega al sponsor equivocado,
 *     sin error visible cuando el medicamento existía en los dos (ver `opcionesEnrolamiento.ts`).
 *
 * 3 · Los medicamentos salen de la medicación ACTIVA del paciente, no del catálogo. Un select
 *     libre haría que el trigger `check_request_item_protocol` rechazara el pedido recién al
 *     enviarlo, con un error de base en la cara. Mejor no ofrecer lo que no se puede pedir.
 *
 * 4 · Las visitas que ya tienen una solicitud viva se ofrecen deshabilitadas, con el motivo. No
 *     se esconden: que no aparezcan haría pensar que la visita no existe.
 */
export function PanelNuevaDispensacion({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (requestId: string) => void
}) {
  const [enrollmentId, setEnrollmentId] = useState('')
  const [visitId, setVisitId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [medId, setMedId] = useState('')
  const [qty, setQty] = useState('1')
  const [items, setItems] = useState<RequestItemInput[]>([])
  const [busy, setBusy] = useState(false)
  const [creandoVnp, setCreandoVnp] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pacientes = usePatients()
  const visitas = useVisitasDispensables(enrollmentId || null)
  const medicacion = usePatientMedications(enrollmentId || null)

  const opcionesEnrolamiento = useMemo(
    () => opcionesDeEnrolamiento(pacientes.data),
    [pacientes.data],
  )

  /**
   * La etiqueta sale de `visitTitle`, el mismo helper que usa Coordinación: "V7 - Semana 12" para
   * las del cuadro y "VNP"/"Retest" para las sueltas. Armarla en SQL habría duplicado
   * `KIND_LABELS` en un `case` de plpgsql que nadie está obligado a completar cuando aparezca un
   * tipo nuevo.
   *
   * La segunda línea (`desc`) es la que evita el error caro: con el desplegable abierto a todas
   * las visitas, la que no dispensa tiene que decirlo ANTES de elegirla, no después.
   */
  const opcionesVisita = useMemo(
    () => (visitas.data ?? []).map((v) => ({
      value: v.visit_id,
      label: v.visit_date ? `${visitTitle(v)} · ${formatAR(v.visit_date)}` : visitTitle(v),
      desc: v.ya_solicitada
        ? 'Ya tiene una solicitud abierta'
        : necesitaMotivoFueraCronograma(v, 'renglones')
          ? 'Fuera de cronograma · pide motivo'
          : undefined,
    })),
    [visitas.data],
  )

  const activas = (medicacion.data ?? []).filter((m) => m.active)
  const opcionesMed = useMemo(
    () => activas
      .filter((m) => !items.some((i) => i.medication_id === m.medication_id))
      .map((m) => ({ value: m.medication_id, label: m.medication?.name ?? 'Medicamento' })),
    [activas, items],
  )

  const visitaElegida: VisitaDispensableRow | null =
    visitas.data?.find((v) => v.visit_id === visitId) ?? null
  const bloqueada = visitaElegida?.ya_solicitada === true

  /**
   * Este panel SIEMPRE manda renglones de medicación (el botón exige al menos uno), así que el
   * camino es 'renglones' y no 'cualquiera'. La diferencia importa: una visita que entrega IP
   * pero no medicación concomitante autorizaría el pedido por el otro camino y la base igual
   * rechazaría estos renglones con "Esta visita no entrega medicación".
   */
  const necesitaMotivo = visitaElegida != null && necesitaMotivoFueraCronograma(visitaElegida, 'renglones')
  const motivoLabel = MOTIVOS_FUERA_CRONOGRAMA.find((m) => m.value === motivo)?.label ?? null
  /* Lo que viaja al servidor es la ETIQUETA legible y no la clave: ese texto sale impreso en el
     comprobante que lee un monitor, y `ajuste_dosis` ahí no dice nada. */
  const razonExcepcion = necesitaMotivo ? motivoLabel : null

  const elegirEnrolamiento = (v: string) => {
    setEnrollmentId(v); setVisitId(''); setMotivo(''); setItems([]); setErr(null)
  }

  const elegirVisita = (v: string) => {
    setVisitId(v); setErr(null)
    /* El motivo elegido pertenece a la visita que lo motivó: al cambiar de visita se limpia, o el
       pedido saldría con la excepción declarada para otra cosa. */
    setMotivo('')
  }

  /**
   * Registra una VNP de HOY y la deja elegida.
   *
   * Es el caso del mostrador y por eso la fecha no se pregunta: el paciente está enfrente. Una
   * VNP de otra fecha la registra la coordinadora desde la ficha del paciente, donde además ve el
   * cronograma completo para decidir.
   *
   * Va por `registrar_vnp` (0114) y no por `register_visit_event`: aquella función no acepta a
   * Farmacia en su authz y devolvería 42501. El motivo queda preseleccionado en "Visita no
   * programada (VNP)", que es literalmente lo que acaba de pasar.
   */
  const crearVnp = async () => {
    if (!enrollmentId || creandoVnp) return
    setCreandoVnp(true); setErr(null)
    const res = await registrarVnp(enrollmentId, todayISO(), null)
    if (res.error) { setCreandoVnp(false); setErr(res.error); return }
    await visitas.refetch()
    if (res.id) setVisitId(res.id)
    setMotivo(MOTIVO_VNP)
    setCreandoVnp(false)
  }

  const agregar = () => {
    if (!medId) return
    const n = Number(qty)
    if (!Number.isFinite(n) || n <= 0) return
    setItems((prev) => [...prev, { medication_id: medId, quantity: n }])
    setMedId('')
    setQty('1')
  }

  const motivoBloqueo = (): string | null => {
    if (!enrollmentId) return 'Elegí un paciente'
    if (!visitId) return 'Elegí la visita que entrega la medicación'
    if (bloqueada) return 'Esa visita ya tiene una solicitud abierta'
    if (necesitaMotivo && !motivoLabel) return FALTA_MOTIVO_MSG
    if (items.length === 0) return 'Agregá al menos un medicamento'
    return null
  }
  const bloqueo = motivoBloqueo()

  const crear = async () => {
    if (bloqueo || busy) return
    setBusy(true); setErr(null)
    // 'pharma': esta pantalla ES el alta manual del mostrador. La base valida que quien lo declara
    // pueda operar en Pharma, así que el dato no es una promesa vacía.
    const res = await createDispensationRequest(visitId, items, null, 'pharma', razonExcepcion)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    if (res.id) onCreated(res.id)
  }

  const nombreMed = (id: string) =>
    activas.find((m) => m.medication_id === id)?.medication?.name ?? 'Medicamento'

  return (
    <>
      <div style={body}>
        <p className="spira-eyebrow" style={{ marginBottom: 10 }}>Paciente y visita</p>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="np-paciente" style={lbl}>Paciente</label>
          <SearchableSelect
            id="np-paciente"
            value={enrollmentId}
            onChange={elegirEnrolamiento}
            options={opcionesEnrolamiento}
            placeholder={pacientes.loading ? 'Cargando pacientes…' : 'Elegí un paciente'}
            searchPlaceholder="Buscar por nombre, código o protocolo…"
            entity="paciente"
            mono
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="np-visita" style={lbl}>Visita que entrega la medicación</label>
          <SearchableSelect
            id="np-visita"
            value={visitId}
            onChange={elegirVisita}
            options={opcionesVisita}
            menuWidth="auto"
            placeholder={
              !enrollmentId ? 'Elegí primero el paciente'
                : visitas.loading ? 'Cargando visitas…'
                : opcionesVisita.length === 0 ? 'Este paciente todavía no tiene visitas'
                : 'Elegí la visita'
            }
            entity="visita"
            disabled={!enrollmentId || visitas.loading || opcionesVisita.length === 0}
          />
        </div>

        {/* El paciente vino sin cita: la VNP es el acto clínico contra el que se dispensa. El botón
            vive acá, pegado al desplegable que va a completar, y no en el pie: es una acción sobre
            este campo, no sobre el formulario. */}
        {enrollmentId && !visitas.loading && (
          <button
            type="button"
            onClick={crearVnp}
            disabled={creandoVnp}
            className="spira-row-link"
            style={{
              ...btnOutline,
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, height: 34, padding: '0 12px',
              cursor: creandoVnp ? 'default' : 'pointer', opacity: creandoVnp ? 0.7 : 1,
            }}
          >
            <Icon name="plus" size={14} color="var(--spira-muted)" />
            {creandoVnp ? 'Registrando…' : 'Registrar una visita no programada de hoy'}
          </button>
        )}

        {bloqueada && (
          <div style={avisoBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>Esa visita ya tiene una solicitud abierta. Resolvé la que está en el tablero
              en vez de crear otra.</span>
          </div>
        )}

        {/* El motivo va INMEDIATAMENTE después de elegir la visita y antes de la medicación: es
            una decisión sobre la visita, no un trámite al final. Mismo criterio que el panel de
            Coordinación, donde la excepción abre el formulario. */}
        {necesitaMotivo && (
          <div style={{ marginTop: 12 }}>
            <label htmlFor="np-motivo" style={lbl}>Motivo de la dispensación fuera de cronograma</label>
            <SearchableSelect
              id="np-motivo"
              value={motivo}
              onChange={setMotivo}
              options={MOTIVOS_FUERA_CRONOGRAMA}
              menuWidth="auto"
              placeholder="Elegí el motivo"
              entity="motivo"
            />
            <div style={notaBox}>
              <Icon name="info" size={15} color="var(--spira-muted)" />
              El cronograma no prevé una entrega en esta visita. El motivo queda registrado en la
              solicitud y sale impreso en el comprobante.
            </div>
          </div>
        )}

        {enrollmentId && !visitas.loading && opcionesVisita.length === 0 && (
          <div style={notaBox}>
            <Icon name="info" size={15} color="var(--spira-muted)" />
            Este paciente todavía no tiene ninguna visita registrada. Registrá una visita no
            programada si vino sin cita.
          </div>
        )}

        <p className="spira-eyebrow" style={{ marginTop: 20, marginBottom: 10 }}>Medicación solicitada</p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchableSelect
              value={medId}
              onChange={setMedId}
              options={opcionesMed}
              placeholder={
                !enrollmentId ? 'Elegí primero el paciente'
                  : medicacion.loading ? 'Cargando…'
                  : opcionesMed.length === 0
                    ? (activas.length === 0 ? 'Sin medicación habilitada' : 'Ya agregaste toda la medicación')
                    : 'Medicamento…'
              }
              entity="medicamento"
              disabled={!enrollmentId || opcionesMed.length === 0}
            />
          </div>
          <input
            type="number" min={1} value={qty}
            onChange={(e) => setQty(e.target.value)}
            aria-label="Cantidad"
            style={cant}
          />
          <button type="button" onClick={agregar} disabled={!medId} style={{ ...btnOutline, opacity: medId ? 1 : 0.6 }}>
            Agregar
          </button>
        </div>

        {/* La medicación habilitada es el candado: si el paciente no tiene ninguna activa, no hay
            nada que pedir y decirlo es más útil que un desplegable vacío. */}
        {enrollmentId && !medicacion.loading && activas.length === 0 && (
          <div style={avisoBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>Este paciente no tiene medicación habilitada. Asignásela desde su ficha antes
              de dispensar.</span>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '6px 2px' }}>
            Todavía no agregaste medicación.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((i, ix) => (
              <div key={i.medication_id} style={itemRow}>
                <Icon name="pill" size={16} color="var(--spira-muted)" />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{nombreMed(i.medication_id)}</span>
                <span className="spira-mono" style={{ fontSize: 13, fontWeight: 700 }}>
                  {i.quantity}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--spira-muted)' }}> u.</span>
                </span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, k) => k !== ix))}
                  aria-label={`Quitar ${nombreMed(i.medication_id)}`}
                  style={quitar}
                >
                  <Icon name="x" size={14} color="var(--spira-muted)" />
                </button>
              </div>
            ))}
          </div>
        )}

        {err && (
          <div style={errBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>{err}</span>
          </div>
        )}
      </div>

      <div style={foot}>
        <button type="button" onClick={onClose} style={btnOutline}>Cancelar</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            type="button" onClick={crear} disabled={!!bloqueo || busy}
            style={{
              ...btnPrimary(bloqueo ? 'var(--spira-line-2)' : 'var(--spira-pharma-solid)'),
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: bloqueo || busy ? 'default' : 'pointer', opacity: bloqueo || busy ? 0.7 : 1,
            }}
          >
            <Icon name="plus" size={16} color="var(--spira-on-accent)" />
            {busy ? 'Creando…' : 'Crear y preparar'}
          </button>
          {bloqueo && <span style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{bloqueo}</span>}
        </div>
      </div>
    </>
  )
}

const body: CSSProperties = { padding: '4px 22px 22px', overflowY: 'auto', flex: 1 }

const foot: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 22px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
}

const lbl: CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-muted)', marginBottom: 6,
}

const cant: CSSProperties = {
  width: 74, height: 44, padding: '0 12px', borderRadius: 10,
  border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14,
  boxSizing: 'border-box',
}

const itemRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
  border: '1px solid var(--spira-line)', borderRadius: 10,
}

const quitar: CSSProperties = {
  width: 26, height: 26, display: 'grid', placeItems: 'center', background: 'transparent',
  border: 'none', borderRadius: 8, cursor: 'pointer', flex: '0 0 auto',
}

const avisoBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, marginBottom: 4, fontSize: 12.5,
  color: 'var(--spira-acc-deep-warn)', background: 'rgba(176, 130, 63, 0.09)',
  border: '1px solid rgba(176, 130, 63, 0.28)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const notaBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, fontSize: 12.5,
  color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}
