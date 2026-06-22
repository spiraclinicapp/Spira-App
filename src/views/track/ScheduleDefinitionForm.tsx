import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import type { VisitType } from '../../data/visits'

const TYPES: { value: VisitType; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefonica', label: 'Telefónica' },
]

/* Hint de validación bajo un campo: texto chico y sereno en color de peligro. */
function Hint({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 12, color: 'var(--spira-danger)' }}>{children}</div>
}

/* Una sola "etapa de la visita" de dominio que deriva role + date_mode, en vez de
   exponer los dos enums crudos (que permitirían combinaciones sin sentido como
   "screening automática"). screening/randomización son siempre pre-rando (libres). */
type Etapa = 'screening' | 'randomizacion' | 'tratamiento' | 'manual'
const ETAPA_OPTS: { value: Etapa; label: string }[] = [
  { value: 'tratamiento', label: 'Tratamiento / seguimiento — se genera desde la randomización' },
  { value: 'screening', label: 'Screening — se agenda a mano' },
  { value: 'randomizacion', label: 'Randomización — se agenda a mano' },
  { value: 'manual', label: 'Otra manual (selección, etc.)' },
]
function etapaToFields(e: Etapa): { role: 'screening' | 'randomizacion' | 'comun'; date_mode: 'libre' | 'automatica' } {
  if (e === 'screening') return { role: 'screening', date_mode: 'libre' }
  if (e === 'randomizacion') return { role: 'randomizacion', date_mode: 'libre' }
  if (e === 'manual') return { role: 'comun', date_mode: 'libre' }
  return { role: 'comun', date_mode: 'automatica' } // tratamiento
}
function fieldsToEtapa(role: string, dateMode: string): Etapa {
  if (role === 'screening') return 'screening'
  if (role === 'randomizacion') return 'randomizacion'
  return dateMode === 'libre' ? 'manual' : 'tratamiento'
}

/**
 * Alta / edición de una definición del cuadro (V1, V2…) en un modal sobrio. No persiste
 * directo: delega en `onSubmit`. La "etapa" deriva role + date_mode. Para las libres
 * (screening/rando/manual) el día es solo referencia; para tratamiento es el offset real.
 */
export function ScheduleDefinitionForm({
  initial,
  accentSolid,
  onClose,
  onSubmit,
}: {
  initial: VisitDefinition | null
  accentSolid: string
  onClose: () => void
  onSubmit: (input: DefinitionInput) => Promise<{ error: string | null }>
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [etapa, setEtapa] = useState<Etapa>(initial ? fieldsToEtapa(initial.role, initial.date_mode) : 'tratamiento')
  const [visitType, setVisitType] = useState<VisitType>(initial?.visit_type ?? 'presencial')
  const [offset, setOffset] = useState(String(initial?.offset_days ?? 0))
  const [wMinus, setWMinus] = useState(String(initial?.window_minus ?? 0))
  const [wPlus, setWPlus] = useState(String(initial?.window_plus ?? 0))
  const [dispenses, setDispenses] = useState(initial?.dispenses ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Válido = código y nombre con texto + las cantidades en días son enteras (vacío → 0).
     El offset admite negativos (screening pre-rando); las ventanas son magnitudes, no
     pueden ser negativas ni fraccionarias (la columna es `integer` y un negativo invertiría
     la ventana en silencio al sincronizar). */
  const isInt = (v: string) => Number.isInteger(Number(v))
  const isNonNegInt = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 0
  const offsetInvalid = !isInt(offset)
  const wMinusInvalid = !isNonNegInt(wMinus)
  const wPlusInvalid = !isNonNegInt(wPlus)
  const valid =
    code.trim() !== '' && name.trim() !== '' && !offsetInvalid && !wMinusInvalid && !wPlusInvalid

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onSubmit({
      code: code.trim(),
      name: name.trim(),
      visit_type: visitType,
      offset_days: Number(offset || 0),
      window_minus: Number(wMinus || 0),
      window_plus: Number(wPlus || 0),
      dispenses,
      ...etapaToFields(etapa),
    })
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onClose()
  }

  const esLibre = etapa !== 'tratamiento'

  return (
    <Modal title={initial ? 'Editar visita del cuadro' : 'Nueva visita del cuadro'} onClose={onClose} maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V1" className="spira-mono" style={fieldInput} />
        </FormField>
        <FormField label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Screening" style={fieldInput} />
        </FormField>
        <FormField label="Etapa">
          <select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)} style={fieldInput}>
            {ETAPA_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Modalidad">
          <select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)} style={fieldInput}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={esLibre ? 'Día de referencia (ventana del protocolo)' : 'Día (offset desde la randomización)'}>
          <input type="number" step="1" value={offset} onChange={(e) => setOffset(e.target.value)} style={fieldInput} />
          {offsetInvalid && <Hint>Tiene que ser un número entero de días.</Hint>}
        </FormField>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <FormField label="Ventana − (días)">
              <input type="number" min="0" step="1" value={wMinus} onChange={(e) => setWMinus(e.target.value)} style={fieldInput} />
              {wMinusInvalid && <Hint>Un entero de 0 o más.</Hint>}
            </FormField>
          </div>
          <div style={{ flex: 1 }}>
            <FormField label="Ventana + (días)">
              <input type="number" min="0" step="1" value={wPlus} onChange={(e) => setWPlus(e.target.value)} style={fieldInput} />
              {wPlusInvalid && <Hint>Un entero de 0 o más.</Hint>}
            </FormField>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={dispenses} onChange={(e) => setDispenses(e.target.checked)} />
          Entrega medicación
        </label>

        {error && <div style={{ fontSize: 13, color: 'var(--spira-danger)' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={btnOutline} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...btnPrimary(accentSolid), opacity: busy || !valid ? 0.6 : 1, cursor: busy || !valid ? 'default' : 'pointer' }}
            disabled={busy || !valid}
            onClick={() => void submit()}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
