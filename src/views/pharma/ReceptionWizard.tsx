import { useState } from 'react'
import { Stepper } from '../../components/Stepper'
import { Modal } from '../../components/Modal'
import { btnOutline, btnPrimary } from '../../components/buttons'
import type { ReceptionKind } from '../../data/pharma'
import { Step0Setup } from './wizard/Step0Setup'
import { Step1Scan } from './wizard/Step1Scan'
import { Step2Lots } from './wizard/Step2Lots'
import { Step3Summary } from './wizard/Step3Summary'

/** Borrador de un lote a recibir (se construye en el Paso 2). */
export interface LotDraft { key: number; lotNumber: string; expiryDate: string; quantity: string }

/** Medicamento con cantidad y lotes ya contados (se arma en el Paso 1 y se detalla en el Paso 2). */
export interface CountedMed { medicationId: string; name: string; quantity: number; lots: LotDraft[] }

const STEPS = ['Setup', 'Escaneo', 'Lotes', 'Resumen']

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
 */
export function ReceptionWizard({ accentSolid, initialTipo, initialProtocolId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [tipo, setTipo] = useState<ReceptionKind>(initialTipo)
  const [protocolId, setProtocolId] = useState(initialProtocolId)
  const [meds, setMeds] = useState<CountedMed[]>([])
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  // Guardamos la acción a confirmar; `null | (() => void)` para evitar el colapso de
  // useState con una función inicializadora que TS no puede discriminar.
  const [confirmDiscard, setConfirmDiscard] = useState<null | (() => void)>(null)

  const hasData = meds.length > 0
  // guard: si hay medicamentos cargados, pide confirmación antes de ejecutar la acción.
  const guard = (action: () => void) => { if (hasData) setConfirmDiscard(() => action); else action() }

  /** Validación por paso. El Paso 3 solo necesita fecha (siempre hay una por default). */
  const canAdvance = (): boolean => {
    if (step === 0) return tipo === 'ambulatoria' || (tipo === 'protocolo' && !!protocolId)
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

  const goto = (i: number) => { setStep(i); setMaxReached((m) => Math.max(m, i)) }
  const next = () => {
    if (!canAdvance()) return
    if (step === 1) setMeds(seedLots)
    goto(step + 1)
  }
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Encabezado: stepper + botón cancelar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Stepper steps={STEPS} current={step} maxReached={maxReached} onJump={goto} accent={accentSolid} />
        <button type="button" onClick={() => guard(onClose)} style={{ ...btnOutline, marginLeft: 'auto' }}>Cancelar</button>
      </div>

      {/* Renderizado del paso actual */}
      {step === 0 && (
        <Step0Setup
          accentSolid={accentSolid}
          tipo={tipo}
          protocolId={protocolId}
          onTipo={(t) => guard(() => { setTipo(t); if (t === 'ambulatoria') setProtocolId(''); setMeds([]) })}
          onProtocol={setProtocolId}
        />
      )}
      {step === 1 && <Step1Scan tipo={tipo} protocolId={protocolId} accentSolid={accentSolid} meds={meds} setMeds={setMeds} />}
      {step === 2 && <Step2Lots meds={meds} setMeds={setMeds} accentSolid={accentSolid} />}
      {step === 3 && <Step3Summary tipo={tipo} protocolId={protocolId} meds={meds} receptionDate={receptionDate} notes={notes} setReceptionDate={setReceptionDate} setNotes={setNotes} accentSolid={accentSolid} onCreated={onCreated} />}

      {/* Navegación inferior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--spira-line)', paddingTop: 14 }}>
        <button type="button" onClick={back} disabled={step === 0} style={{ ...btnOutline, opacity: step === 0 ? 0.5 : 1 }}>Atrás</button>
        {step < 3 && (
          <button type="button" onClick={next} disabled={!canAdvance()} style={{ ...btnPrimary(accentSolid), opacity: canAdvance() ? 1 : 0.6 }}>Siguiente</button>
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
