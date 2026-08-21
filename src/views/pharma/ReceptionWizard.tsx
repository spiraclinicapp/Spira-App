import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Stepper } from '../../components/Stepper'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { createReception, createIpReception, useMedicationCodes } from '../../data/pharma'
import type { ReceptionKind, StorageLocation } from '../../data/pharma'
import { Step0Setup } from './wizard/Step0Setup'
import { Step1Scan } from './wizard/Step1Scan'
import { Step2Lots } from './wizard/Step2Lots'
import { Step3Summary } from './wizard/Step3Summary'
import { Step1ControlCargaIp } from './wizard/Step1ControlCargaIp'
import { Step2DobleCheckIp } from './wizard/Step2DobleCheckIp'
import { Step3CierreIp } from './wizard/Step3CierreIp'

/** Borrador de un lote a recibir (se construye en el Paso 2). */
export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }

/** Medicamento con cantidad y lotes ya contados (se arma en el Paso 1 y se detalla en el Paso 2).
 *  `code` es el código escaneado/asociado (para mostrar el EAN en la lista; a mano queda vacío). */
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[]; code?: string }

/** Estado del control de temperatura del ingreso de IP. `null` = sin elegir. */
export type TempStatus = 'ok' | 'excursion' | null

interface Props {
  accentSolid: string
  initialTipo: ReceptionKind
  initialProtocolId: string
  onClose: () => void
  onCreated: (id: string) => void
}

/**
 * Wizard de recepción tipada (4 pasos). Maneja el estado global del wizard y la validación por paso
 * (`canAdvance`); cambiar tipo o cancelar con datos cargados pide confirmación. El submit vive ACÁ
 * (no en los Step3) porque el CTA de cierre está en la barra fija de abajo.
 *
 * Dos ramas por `tipo`:
 *  - **Base** (protocolo / ambulatoria): escaneo de medicamentos + lotes por cantidad (sin cambios).
 *  - **IP** (investigación): ingreso MACRO por cargamento (0038) — Tipo (protocolo+coordinador) →
 *    Carga general (temperatura OK/Excursión + cantidad total + rango) → Doble check (documentación +
 *    IRT) → Cierre (ubicación + Confirmar). NO escanea kit por kit; el stock se lleva por cantidad.
 */
export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [tipo, setTipo] = useState<ReceptionKind>(initialTipo)
  const [protocolId, setProtocolId] = useState(initialProtocolId)
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Guardamos la acción a confirmar; `null | (() => void)` para evitar el colapso de
  // useState con una función inicializadora que TS no puede discriminar.
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null)
  // Aviso al avanzar del Escaneo si hay medicamentos sin código de barras (no bloquea: confirma).
  const [confirmNoCode, setConfirmNoCode] = useState<null | (() => void)>(null)

  // ── Estado rama base ────────────────────────────────────────────────────────
  const [meds, setMeds] = useState<CountedMed[]>([])
  // Códigos de barra del catálogo (fuente única para el Escaneo): mapa medicamento→código.
  const codes = useMedicationCodes()
  const codeByMed = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of codes.data ?? []) if (!m.has(r.medication_id)) m.set(r.medication_id, r.code)
    return m
  }, [codes.data])
  // Un medicamento "no tiene código" si no viaja escaneado en la fila ni figura en el mapa.
  const medsSinCodigo = meds.filter((m) => !m.code && !codeByMed.has(m.medicationId))

  // ── Estado rama IP macro (0038) ─────────────────────────────────────────────
  const [coordinatorId, setCoordinatorId] = useState('')
  const [tempStatus, setTempStatus] = useState<TempStatus>(null)
  const [totalKits, setTotalKits] = useState('')          // numérico como string
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [docsSigned, setDocsSigned] = useState(false)
  const [irtNotified, setIrtNotified] = useState(false)
  const [storageLocation, setStorageLocation] = useState<StorageLocation | ''>('')
  // Inicio administrativo del proceso: se captura al montar el wizard (Paso 1 del manual).
  const [startedAt] = useState(() => new Date().toISOString())

  const isIp = tipo === 'investigacion'
  const STEPS = isIp
    ? ['Tipo', 'Carga general', 'Doble check', 'Cierre']
    : ['Tipo', 'Escaneo', 'Lotes', 'Resumen']

  // Limpia el estado de ambas ramas (al cambiar de tipo).
  const resetBranches = () => {
    setMeds([])
    setCoordinatorId(''); setTempStatus(null); setTotalKits(''); setRangeFrom(''); setRangeTo('')
    setDocsSigned(false); setIrtNotified(false); setStorageLocation('')
  }

  const hasData = isIp
    ? (!!coordinatorId || !!totalKits.trim() || tempStatus !== null)
    : meds.length > 0
  // guard: si hay datos cargados, pide confirmación antes de ejecutar la acción.
  const guard = (action: () => void) => { if (hasData) setConfirmDiscard(() => action); else action() }

  /** Validación por paso, ramificada por `isIp`. El Paso 3 se cierra con el botón Confirmar (abajo),
   *  no con "Siguiente", así que su gate real vive en el `disabled` del botón. */
  const canAdvance = (): boolean => {
    if (step === 0) {
      if (tipo === 'ambulatoria') return true
      if (!protocolId) return false
      return isIp ? !!coordinatorId : true          // IP también exige coordinador
    }
    if (isIp) {
      if (step === 1) return tempStatus === 'ok' && Number(totalKits) > 0   // Excursión bloquea
      if (step === 2) return docsSigned && irtNotified                       // doble check obligatorio
      return !!storageLocation                                              // Cierre
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

  /** Para cada medicamento sin lotes, crea un lote default con la cantidad total (rama base). */
  const seedLots = (list: CountedMed[]): CountedMed[] =>
    list.map((m) => (m.lots.length ? m : { ...m, lots: [{ key: 1, lotNumber: '', expiryDate: '', quantity: String(m.quantity) }] }))

  // Al entrar a un paso ≥ 2 (por avance o salto) sembramos los lotes faltantes solo en la rama base.
  const goto = (i: number) => {
    if (i >= 2 && !isIp) setMeds(seedLots)
    if (step === 3 && i !== 3) setSubmitError(null)
    setStep(i)
    setMaxReached((m) => Math.max(m, i))
  }
  const next = () => {
    if (!canAdvance()) return
    // Rama base: al salir del Escaneo, avisar si algún medicamento no tiene código de barras.
    if (step === 1 && !isIp && medsSinCodigo.length > 0) {
      setConfirmNoCode(() => () => goto(2))
      return
    }
    goto(step + 1)
  }
  const back = () => { if (step === 3) setSubmitError(null); setStep((s) => Math.max(0, s - 1)) }

  /**
   * Cierre de la recepción. Rama IP: crea el cargamento MACRO ya finalizado (create_ip_reception 0038)
   * — el doble-check ES la verificación. Rama base: crea la recepción 'pendiente' con sus ítems.
   */
  const submitReception = async () => {
    if (isIp) {
      if (!protocolId || !coordinatorId || tempStatus !== 'ok' || Number(totalKits) <= 0
          || !docsSigned || !irtNotified || !storageLocation || !receptionDate) return
      setSubmitBusy(true)
      setSubmitError(null)
      const res = await createIpReception({
        protocolId,
        coordinatorId,
        receptionDate,
        totalKits: Number(totalKits),
        kitRangeFrom: rangeFrom.trim() || null,
        kitRangeTo: rangeTo.trim() || null,
        storageLocation,
        startedAt,
        notes: notes.trim() || null,
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

  // Gate del botón de cierre (Paso 3). IP: ubicación elegida. Base: siempre habilitado (los guards
  // del submit avisan si falta algo).
  const closeDisabled = submitBusy || (isIp && !storageLocation)
  const closeLabel = submitBusy
    ? (isIp ? 'Confirmando…' : 'Creando…')
    : (isIp ? 'Confirmar recepción' : 'Crear recepción')

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
          coordinatorId={coordinatorId}
          onTipo={(t) => guard(() => { setTipo(t); if (t === 'ambulatoria') setProtocolId(''); resetBranches() })}
          onProtocol={(id) => { setProtocolId(id); setCoordinatorId('') }}
          onCoordinator={setCoordinatorId}
        />
      )}
      {step === 1 && (isIp
        ? <Step1ControlCargaIp
            tempStatus={tempStatus} setTempStatus={setTempStatus}
            totalKits={totalKits} setTotalKits={setTotalKits}
            rangeFrom={rangeFrom} setRangeFrom={setRangeFrom}
            rangeTo={rangeTo} setRangeTo={setRangeTo} />
        : <Step1Scan accentSolid={accentSolid} meds={meds} setMeds={setMeds} codeByMed={codeByMed} onCodesChanged={codes.refetch} />)}
      {step === 2 && (isIp
        ? <Step2DobleCheckIp
            accentSolid={accentSolid}
            docsSigned={docsSigned} setDocsSigned={setDocsSigned}
            irtNotified={irtNotified} setIrtNotified={setIrtNotified} />
        : <Step2Lots meds={meds} setMeds={setMeds} accentSolid={accentSolid} />)}
      {step === 3 && (isIp
        ? <Step3CierreIp
            accentSolid={accentSolid}
            storageLocation={storageLocation} setStorageLocation={setStorageLocation}
            totalKits={totalKits} receptionDate={receptionDate} setReceptionDate={setReceptionDate}
            notes={notes} setNotes={setNotes} />
        : <Step3Summary meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} />)}

      {/* Barra de acciones fija abajo. El error del submit vive DENTRO de la barra (el CTA es sticky,
          así que su feedback también tiene que estarlo). "Atrás" no aparece en el primer paso. */}
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
            disabled={closeDisabled}
            style={{ ...btnPrimary(accentSolid), height: 44, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, opacity: closeDisabled ? 0.6 : 1 }}
          >
            {closeLabel}
            {!submitBusy && <Icon name="check" size={16} color="var(--spira-on-accent)" />}
          </button>
        )}
      </div>

      {/* Aviso: medicamentos sin código de barras (al avanzar del Escaneo). No bloquea: confirma. */}
      {confirmNoCode && (
        <Modal title="Medicamentos sin código de barras" onClose={() => setConfirmNoCode(null)}>
          <p style={{ fontSize: 14, color: 'var(--spira-muted)', lineHeight: 1.5 }}>
            Estos medicamentos no tienen ningún código de barras asociado:
          </p>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 14, color: 'var(--spira-ink)', lineHeight: 1.6 }}>
            {medsSinCodigo.map((m) => <li key={m.medicationId}>{m.name}</li>)}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => setConfirmNoCode(null)} style={btnOutline}>Volver</button>
            <button type="button" onClick={() => { const a = confirmNoCode; setConfirmNoCode(null); a?.() }} style={btnPrimary(accentSolid)}>Continuar igual</button>
          </div>
        </Modal>
      )}

      {/* Modal de confirmación de descarte (se muestra solo si `confirmDiscard` tiene una acción) */}
      {confirmDiscard && (
        <Modal title="¿Descartar la recepción en curso?" onClose={() => setConfirmDiscard(null)}>
          <p style={{ fontSize: 14, color: 'var(--spira-muted)', lineHeight: 1.5 }}>Cargaste datos en esta recepción. Si seguís, se pierden.</p>
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
