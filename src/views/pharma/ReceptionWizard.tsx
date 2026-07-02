import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Stepper } from '../../components/Stepper'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { createReception, createIpReception } from '../../data/pharma'
import type { ReceptionKind } from '../../data/pharma'
import { Step0Setup } from './wizard/Step0Setup'
import { Step1Scan } from './wizard/Step1Scan'
import { Step2Lots } from './wizard/Step2Lots'
import { Step3Summary } from './wizard/Step3Summary'
import { Step1ScanIp } from './wizard/Step1ScanIp'
import { Step2ReviewIp } from './wizard/Step2ReviewIp'
import { Step3SummaryIp } from './wizard/Step3SummaryIp'

/** Borrador de un lote a recibir (se construye en el Paso 2). */
export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }

/** Borrador de una unidad de IP escaneada (Paso 1 del wizard, rama investigación). */
export interface IpUnitDraft {
  key: number
  kitNumber: string
  rawCode: string
  gtin: string
  lotNumber: string
  expiryDate: string
  drugId: string      // '' = cegado
  drugName: string    // etiqueta para mostrar
  manual: boolean     // vestigial del flujo GS1: hoy siempre false (el IP no parsea). Futuro: marcar carga a mano para auditoría.
}

/** Medicamento con cantidad y lotes ya contados (se arma en el Paso 1 y se detalla en el Paso 2).
 *  `code` es el código escaneado/asociado (para mostrar el EAN en la lista; a mano queda vacío). */
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[]; code?: string }

interface Props {
  accentSolid: string
  initialTipo: ReceptionKind
  initialProtocolId: string
  onClose: () => void
  onCreated: (id: string) => void
}

/**
 * Wizard de recepción tipada (4 pasos). Maneja el estado global del wizard: tipo,
 * protocolo, medicamentos/lotes, fecha y notas. La validación por paso (`canAdvance`)
 * habilita el avance; cambiar tipo o cancelar con datos cargados pide confirmación.
 * El submit (base e IP) vive ACÁ (no en los Step3) porque el CTA "Crear recepción"
 * está en la barra de acciones fija de abajo (handoff 1d).
 */
export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [tipo, setTipo] = useState<ReceptionKind>(initialTipo)
  const [protocolId, setProtocolId] = useState(initialProtocolId)
  const [meds, setMeds] = useState<CountedMed[]>([])
  const [ipUnits, setIpUnits] = useState<IpUnitDraft[]>([])
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Guardamos la acción a confirmar; `null | (() => void)` para evitar el colapso de
  // useState con una función inicializadora que TS no puede discriminar.
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null)

  const isIp = tipo === 'investigacion'
  const STEPS = isIp ? ['Setup', 'Escaneo', 'Revisión', 'Resumen'] : ['Setup', 'Escaneo', 'Lotes', 'Resumen']

  const hasData = isIp ? ipUnits.length > 0 : meds.length > 0
  // guard: si hay datos cargados (medicamentos o unidades IP), pide confirmación antes de ejecutar la acción.
  const guard = (action: () => void) => { if (hasData) setConfirmDiscard(() => action); else action() }

  /** Validación por paso. El Paso 3 solo necesita fecha (siempre hay una por default).
   *  El Paso 0 exige protocolo tanto para 'protocolo' como 'investigacion'.
   *  Los pasos 1/2 se ramifican por isIp. */
  const canAdvance = (): boolean => {
    if (step === 0) return tipo === 'ambulatoria' || !!protocolId
    if (isIp) {
      if (step === 1) return ipUnits.length > 0
      if (step === 2) return true   // droga opcional; lote/vto editables en Step2ReviewIp
      return !!receptionDate
    }
    // Rama base (protocolo / ambulatoria)
    if (step === 1) return meds.length > 0 && meds.every((m) => m.quantity > 0)
    if (step === 2) return meds.every((m) => {
      const lotNums = m.lots.map((l) => l.lotNumber.trim()).filter(Boolean)
      const noDups = new Set(lotNums).size === lotNums.length && lotNums.length === m.lots.length
      return (
        noDups &&
        m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0) === m.quantity
      )
    })
    return !!receptionDate
  }

  /** Para cada medicamento sin lotes, crea un lote default con la cantidad total. */
  const seedLots = (list: CountedMed[]): CountedMed[] =>
    list.map((m) => (m.lots.length ? m : { ...m, lots: [{ key: 1, lotNumber: '', expiryDate: '', quantity: String(m.quantity) }] }))

  // Al entrar a cualquier paso ≥ 2 (por avance o salto), sembramos los lotes faltantes solo en la
  // rama de base. seedLots es idempotente: solo rellena medicamentos sin lotes, nunca pisa los editados.
  const goto = (i: number) => {
    if (i >= 2 && !isIp) setMeds(seedLots)
    // Paridad con el submit por-paso previo: al salir del Resumen se descarta el error.
    if (step === 3 && i !== 3) setSubmitError(null)
    setStep(i)
    setMaxReached((m) => Math.max(m, i))
  }
  const next = () => {
    if (!canAdvance()) return
    goto(step + 1)
  }
  const back = () => { if (step === 3) setSubmitError(null); setStep((s) => Math.max(0, s - 1)) }

  /**
   * Submit lifteado de los Step3 (guards portados verbatim). Rama IP: exige protocolo,
   * fecha y N° de kit en toda unidad. Rama base: fecha, ≥1 ítem y suma de lotes == cantidad.
   * Errores del RPC ya llegan serenos desde la capa de datos.
   */
  const submitReception = async () => {
    if (isIp) {
      if (!protocolId || !receptionDate || ipUnits.length === 0) return
      // Guard: toda unidad necesita N° de kit (el fallback manual pudo quedar vacío).
      const sinKit = ipUnits.filter((u) => !u.kitNumber.trim()).length
      if (sinKit > 0) {
        setSubmitError(`Hay ${sinKit} unidad(es) sin N° de kit. Completá en Revisión.`)
        return
      }
      setSubmitBusy(true)
      setSubmitError(null)
      const res = await createIpReception({
        protocolId,
        receptionDate,
        notes: notes.trim() || null,
        units: ipUnits.map((u) => ({
          kit_number: u.kitNumber.trim(),
          raw_code: u.rawCode || null,
          gtin: u.gtin || null,
          lot_number: u.lotNumber || null,
          expiry_date: u.expiryDate || null,
          drug_id: u.drugId || null,
        })),
      })
      setSubmitBusy(false)
      if (res.error) { setSubmitError(res.error); return }
      if (res.id) onCreated(res.id)
      return
    }
    // Guards defensivos de la rama base: el botón es type="button", no hay validación nativa del form.
    if (!receptionDate) {
      setSubmitError('La fecha de recepción es obligatoria.')
      return
    }
    const items = meds.flatMap((m) =>
      m.lots.map((l) => ({
        medication_id: m.medicationId,
        lot_number: l.lotNumber.trim(),
        expiry_date: l.expiryDate || null,
        quantity: Number(l.quantity),
      })),
    )
    if (items.length === 0) {
      setSubmitError('Agregá al menos un ítem antes de crear la recepción.')
      return
    }
    // Guard defensivo: detecta medicamentos cuya suma de lotes no coincide con la cantidad
    // contada (puede pasar si se llega al paso 3 por un salto sin semillar correctamente).
    const bad = meds.find(
      (m) =>
        m.lots.length === 0 ||
        m.lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0) !== m.quantity,
    )
    if (bad) {
      setSubmitError(`Revisá los lotes de ${bad.name}: la suma de lotes no coincide con la cantidad contada.`)
      return
    }
    setSubmitBusy(true)
    setSubmitError(null)
    const res = await createReception({
      tipo,
      protocol_id: tipo === 'ambulatoria' ? null : protocolId,
      reception_date: receptionDate,
      notes: notes.trim() || null,
      items,
    })
    setSubmitBusy(false)
    if (res.error) { setSubmitError(res.error); return }
    onCreated(res.id!)
  }

  return (
    // minHeight:100% llena el área de contenido → la barra de abajo (margin-top:auto) queda
    // pegada al fondo aun cuando el paso es corto (estado vacío), sin sliver de paper.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: '100%' }}>
      {/* Encabezado: stepper CENTRADO (grid 1fr·auto·1fr → alineado al centro de la barra de
          abajo, entre Atrás y Siguiente) + botón cancelar arriba a la derecha. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" />
        <div style={{ width: 680, maxWidth: '100%' }}>
          <Stepper steps={STEPS} current={step} maxReached={maxReached} onJump={goto} accent={accentSolid} />
        </div>
        <button type="button" onClick={() => guard(onClose)} style={{ ...btnOutline, justifySelf: 'end' }}>Cancelar</button>
      </div>

      {/* Renderizado del paso actual */}
      {step === 0 && (
        <Step0Setup
          accentSolid={accentSolid}
          tipo={tipo}
          protocolId={protocolId}
          onTipo={(t) => guard(() => { setTipo(t); if (t === 'ambulatoria') setProtocolId(''); setMeds([]); setIpUnits([]) })}
          onProtocol={setProtocolId}
        />
      )}
      {step === 1 && (isIp
        ? <Step1ScanIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
        : <Step1Scan tipo={tipo} protocolId={protocolId} accentSolid={accentSolid} meds={meds} setMeds={setMeds} />)}
      {step === 2 && (isIp
        ? <Step2ReviewIp accentSolid={accentSolid} units={ipUnits} setUnits={setIpUnits} />
        : <Step2Lots meds={meds} setMeds={setMeds} accentSolid={accentSolid} />)}
      {step === 3 && (isIp
        ? <Step3SummaryIp units={ipUnits} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} />
        : <Step3Summary meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} />)}

      {/* Barra de acciones fija abajo (handoff 1d). Los márgenes negativos sangran sobre el
          padding del contenedor de contenido del shell (16px 26px 26px) para que la barra
          llegue a los bordes; sticky la pega al viewport de scroll. "Atrás" no aparece en
          el primer paso (regla del handoff). El error del submit vive DENTRO de la barra:
          el CTA está siempre visible (sticky), así que su feedback también tiene que estarlo
          (afuera podría quedar scrolleado fuera de pantalla y parecer que "no pasó nada"). */}
      <div style={footerBar}>
        {step > 0 && (
          <button type="button" onClick={back} style={{ ...btnOutline, height: 44, display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
            <Icon name="chevronLeft" size={16} color="var(--spira-ink)" /> Atrás
          </button>
        )}
        {submitError && <div style={{ ...submitErrorBox, flex: 1, margin: '0 14px', minWidth: 0 }} aria-live="assertive">{submitError}</div>}
        {step < 3 ? (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance()}
            style={{ ...btnPrimary(accentSolid), height: 44, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, opacity: canAdvance() ? 1 : 0.6 }}
          >
            Siguiente <Icon name="arrowRight" size={16} color="var(--spira-on-accent)" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submitReception()}
            disabled={submitBusy || (isIp && ipUnits.length === 0)}
            style={{ ...btnPrimary(accentSolid), height: 44, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, opacity: submitBusy ? 0.7 : 1 }}
          >
            {submitBusy ? (isIp ? `Creando ${ipUnits.length} unidades…` : 'Creando…') : 'Crear recepción'}
            {!submitBusy && <Icon name="check" size={16} color="var(--spira-on-accent)" />}
          </button>
        )}
      </div>

      {/* Modal de confirmación de descarte (se muestra solo si `confirmDiscard` tiene una acción) */}
      {confirmDiscard && (
        <Modal title="¿Descartar la recepción en curso?" onClose={() => setConfirmDiscard(null)}>
          <p style={{ fontSize: 14, color: 'var(--spira-muted)', lineHeight: 1.5 }}>Cargaste medicamentos en esta recepción. Si seguís, se pierden.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setConfirmDiscard(null)} style={btnOutline}>Volver</button>
            <button type="button" onClick={() => { const a = confirmDiscard; setConfirmDiscard(null); a?.() }} style={btnPrimary('var(--spira-danger)')}>Descartar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const footerBar: CSSProperties = {
  position: 'sticky', bottom: 0, zIndex: 10,
  // margin-top:auto la empuja al fondo cuando el paso es corto (junto al minHeight:100% del
  // wizard); sticky la mantiene visible cuando el contenido scrollea. Los -26 laterales sangran
  // sobre el padding lateral del shell → la barra llega a los bordes. El contenedor del shell ya
  // NO tiene padding-bottom, así que la barra queda al ras del borde inferior (sin sliver).
  marginTop: 'auto', marginLeft: -26, marginRight: -26, marginBottom: 0,
  padding: '14px 26px',
  borderTop: '1px solid var(--spira-line)', background: 'var(--spira-white)',
  display: 'flex', alignItems: 'center',
}
const submitErrorBox: CSSProperties = {
  fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166,72,59,0.10)',
  borderRadius: 8, padding: '8px 12px',
}
