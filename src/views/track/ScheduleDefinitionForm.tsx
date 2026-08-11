import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
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

/* El nombre se DERIVA de la etapa: Screening/Randomización son fijos; Tratamiento es la SEMANA
   (Día ÷ 7, con "W" adelante: W1, W2…); "Otra manual" es texto libre. Devuelve null para manual
   → el input queda editable. */
function forcedName(etapa: Etapa, offset: string): string | null {
  if (etapa === 'screening') return 'Screening'
  if (etapa === 'randomizacion') return 'Randomización'
  if (etapa === 'tratamiento') {
    const n = Number(offset)
    return `W${Number.isFinite(n) ? Math.round(n / 7) : 0}`
  }
  return null
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
  // Ventana simétrica ±N días (un solo campo: window_minus = window_plus). Edición: si la fila
  // legacy era asimétrica, tomamos window_plus como referencia y al guardar queda simétrica.
  const [windowDays, setWindowDays] = useState(String(initial?.window_plus ?? initial?.window_minus ?? 0))
  const [dispenses, setDispenses] = useState(initial?.dispenses ?? false)
  const [dispensesIp, setDispensesIp] = useState(initial?.dispenses_ip ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* El nombre se deriva de la etapa (forcedName); solo "manual" usa el texto libre `name`. */
  const forced = forcedName(etapa, offset)
  const effectiveName = forced ?? name

  /* Válido = código y nombre con texto + las cantidades en días son enteras (vacío → 0).
     El offset admite negativos (screening pre-rando); las ventanas son magnitudes, no
     pueden ser negativas ni fraccionarias (la columna es `integer` y un negativo invertiría
     la ventana en silencio al sincronizar). */
  const isInt = (v: string) => Number.isInteger(Number(v))
  const isNonNegInt = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 0
  const offsetInvalid = !isInt(offset)
  const windowInvalid = !isNonNegInt(windowDays)
  const valid =
    code.trim() !== '' && effectiveName.trim() !== '' && !offsetInvalid && !windowInvalid

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onSubmit({
      code: code.trim(),
      name: effectiveName.trim(),
      visit_type: visitType,
      offset_days: Number(offset || 0),
      window_minus: Number(windowDays || 0),
      window_plus: Number(windowDays || 0),
      dispenses,
      dispenses_ip: dispensesIp,
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
          <input
            value={effectiveName}
            onChange={(e) => setName(e.target.value)}
            disabled={forced !== null}
            placeholder="Nombre de la visita"
            style={forced !== null
              ? { ...fieldInput, background: 'var(--spira-surface)', color: 'var(--spira-muted)', cursor: 'default' }
              : fieldInput}
          />
          {etapa === 'tratamiento' && (
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--spira-muted)' }}>
              El nombre es la semana: se calcula desde el Día (Día ÷ 7).
            </div>
          )}
        </FormField>
        <FormField label="Etapa">
          <SearchableSelect value={etapa} onChange={(v) => setEtapa(v as Etapa)} options={ETAPA_OPTS} placeholder="Elegí la etapa" />
        </FormField>
        <FormField label="Modalidad">
          <SearchableSelect value={visitType} onChange={(v) => setVisitType(v as VisitType)} options={TYPES} placeholder="Elegí la modalidad" />
        </FormField>
        <FormField label={esLibre ? 'Día de referencia (ventana del protocolo)' : 'Día (offset desde la randomización)'}>
          <input type="number" step="1" value={offset} onChange={(e) => setOffset(e.target.value)} style={fieldInput} />
          {offsetInvalid && <Hint>Tiene que ser un número entero de días.</Hint>}
        </FormField>
        <FormField label="Ventana (± días)">
          <input type="number" min="0" step="1" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} style={fieldInput} />
          {windowInvalid && <Hint>Un entero de 0 o más.</Hint>}
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={dispenses} onChange={(e) => setDispenses(e.target.checked)} />
          Entrega medicación
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={dispensesIp} onChange={(e) => setDispensesIp(e.target.checked)} />
          Entrega producto en investigación (IP)
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
