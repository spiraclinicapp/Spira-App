import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../../components/Icon'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { initials } from '../../../components/PrivacyAvatar'
import { btnOutline, btnPrimary } from '../../../components/buttons'
import { usePatients } from '../../../data/patients'
import { usePatientMedications } from '../../../data/pharma'
import { useVisitasDispensables, createDispensationRequest } from '../../../data/pharma'
import type { RequestItemInput } from '../../../data/pharma'
import { formatAR } from '../../../lib/dates'

/**
 * Alta manual desde el mostrador (el "Nueva dispensación" del handoff).
 *
 * TRES CANDADOS que el prototipo no tenía, y que no son burocracia:
 *
 * 1 · La dispensación cuelga de una VISITA, no de un paciente suelto. El prototipo pedía código
 *     IVRS + protocolo y listo; acá se elige la visita real, porque toda dispensación tiene que
 *     ser trazable a un acto clínico (decisión D2 del plan). Por eso el formulario tiene un paso
 *     más que el mock: es el precio de que el dato sirva para una auditoría.
 *
 * 2 · Los medicamentos salen de la medicación ACTIVA del paciente, no del catálogo. Un select
 *     libre haría que el trigger `check_request_item_protocol` rechazara el pedido recién al
 *     enviarlo, con un error de base en la cara. Mejor no ofrecer lo que no se puede pedir.
 *
 * 3 · Las visitas que ya tienen una solicitud viva se ofrecen deshabilitadas, con el motivo. No se
 *     esconden: que no aparezcan haría pensar que la visita no existe.
 */
export function PanelNuevaDispensacion({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (requestId: string) => void
}) {
  const [patientId, setPatientId] = useState('')
  const [visitId, setVisitId] = useState('')
  const [medId, setMedId] = useState('')
  const [qty, setQty] = useState('1')
  const [items, setItems] = useState<RequestItemInput[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pacientes = usePatients()

  // Un paciente puede estar en varios protocolos; la medicación y las visitas cuelgan del
  // enrolamiento, no de la persona. Tomamos el primero: hoy no hay UI para elegir protocolo acá,
  // y ofrecer un paciente sin decir en qué protocolo sería peor que la limitación.
  const paciente = pacientes.data?.find((p) => p.id === patientId) ?? null
  const enrollmentId = paciente?.enrollments?.[0]?.id ?? null

  const visitas = useVisitasDispensables(enrollmentId)
  const medicacion = usePatientMedications(enrollmentId)

  /**
   * Solo pacientes con enrolamiento en un protocolo: sin eso no hay visitas dispensadoras ni
   * medicación habilitada, así que ofrecerlos sería un callejón sin salida.
   *
   * Los que todavía no tienen IVRS (se asigna en la randomización) se desambiguan con las
   * iniciales: sin eso, dos pacientes distintos aparecían los dos como "Sin IVRS · PROT-A" y no
   * había forma de saber cuál era cuál — elegir el equivocado en una dispensación es grave.
   * Iniciales y no nombre completo, que es el estándar de privacidad del proyecto (PrivacyAvatar).
   */
  const opcionesPaciente = useMemo(
    () => (pacientes.data ?? [])
      .filter((p) => p.enrollments?.[0]?.protocol?.code)
      .map((p) => ({
        value: p.id,
        label: p.code
          ? `${p.code} · ${p.enrollments[0].protocol!.code}`
          : `Sin IVRS · ${initials(p.full_name)} · ${p.enrollments[0].protocol!.code}`,
      })),
    [pacientes.data],
  )

  const opcionesVisita = useMemo(
    () => (visitas.data ?? []).map((v) => ({
      value: v.visit_id,
      label: v.ya_solicitada
        ? `${v.visit_name} · ya tiene una solicitud abierta`
        : `${v.visit_name}${v.visit_date ? ` · ${formatAR(v.visit_date)}` : ''}`,
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

  const visitaElegida = visitas.data?.find((v) => v.visit_id === visitId) ?? null
  const bloqueada = visitaElegida?.ya_solicitada === true

  const agregar = () => {
    if (!medId) return
    const n = Number(qty)
    if (!Number.isFinite(n) || n <= 0) return
    setItems((prev) => [...prev, { medication_id: medId, quantity: n }])
    setMedId('')
    setQty('1')
  }

  const motivoBloqueo = (): string | null => {
    if (!patientId) return 'Elegí un paciente'
    if (!enrollmentId) return 'Ese paciente no tiene enrolamiento activo'
    if (!visitId) return 'Elegí la visita que entrega la medicación'
    if (bloqueada) return 'Esa visita ya tiene una solicitud abierta'
    if (items.length === 0) return 'Agregá al menos un medicamento'
    return null
  }
  const bloqueo = motivoBloqueo()

  const crear = async () => {
    if (bloqueo || busy) return
    setBusy(true); setErr(null)
    // 'pharma': esta pantalla ES el alta manual del mostrador. La base valida que quien lo declara
    // pueda operar en Pharma, así que el dato no es una promesa vacía.
    const res = await createDispensationRequest(visitId, items, null, 'pharma')
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
            value={patientId}
            onChange={(v) => { setPatientId(v); setVisitId(''); setItems([]); setErr(null) }}
            options={opcionesPaciente}
            placeholder={pacientes.loading ? 'Cargando pacientes…' : 'Elegí un paciente'}
            searchPlaceholder="Buscar por código o protocolo…"
            entity="paciente"
            mono
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="np-visita" style={lbl}>Visita que entrega la medicación</label>
          <SearchableSelect
            id="np-visita"
            value={visitId}
            onChange={(v) => { setVisitId(v); setErr(null) }}
            options={opcionesVisita}
            placeholder={
              !patientId ? 'Elegí primero el paciente'
                : visitas.loading ? 'Cargando visitas…'
                : opcionesVisita.length === 0 ? 'Este paciente no tiene visitas que dispensen'
                : 'Elegí la visita'
            }
            entity="visita"
            disabled={!patientId || visitas.loading || opcionesVisita.length === 0}
          />
        </div>

        {bloqueada && (
          <div style={avisoBox} role="alert">
            <Icon name="alertCircle" size={15} />
            <span>Esa visita ya tiene una solicitud abierta. Resolvé la que está en el tablero
              en vez de crear otra.</span>
          </div>
        )}

        {patientId && !visitas.loading && opcionesVisita.length === 0 && (
          <div style={notaBox}>
            <Icon name="info" size={15} color="var(--spira-muted)" />
            Las visitas que entregan medicación existen recién después de la randomización.
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
          <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', padding: '6px 2px' }}>
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
  color: 'var(--spira-warn)', background: 'rgba(176, 130, 63, 0.09)',
  border: '1px solid rgba(176, 130, 63, 0.28)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const notaBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12,
  color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  border: '1px solid var(--spira-line)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.45,
}

const errBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 12, fontSize: 12.5,
  color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.08)',
  border: '1px solid rgba(166, 72, 59, 0.25)', borderRadius: 8, padding: '9px 11px',
}
