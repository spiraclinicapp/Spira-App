import { useState, type CSSProperties, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput, fieldLabelStyle } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import type { VisitType } from '../../data/visits'
import { InfoTip } from '../../components/InfoTip'
import { visitTitle } from '../../lib/visits'
import { diaTrasCambiarSemana, nombreTrasCambiarEtapa, semanaInicial, semanaTrasCambiarDia } from './semanaDeVisita'
import type { Etapa } from './semanaDeVisita'

const TYPES: { value: VisitType; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefonica', label: 'Telefónica' },
]

/* Hint de validación bajo un campo: texto chico y sereno en color de peligro. */
function Hint({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 12, color: 'var(--spira-acc-deep-danger)' }}>{children}</div>
}

/* Input sin chrome propio: el borde, el fondo y la señal de foco los pone el recuadro que lo
   contiene (`.spira-field-group`). Sin esto, cada mitad del campo compuesto dibujaría su propia
   sombra de foco adentro de la caja. */
const bareInput: CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, margin: 0, minWidth: 0,
  color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 14, alignSelf: 'stretch',
}
/* Métrica de los números (el día y la semana): lo mismo que la clase `.spira-mono`, pero inline
   para que gane sobre el estilo del input pelado que lo lleva. */
const numText: CSSProperties = {
  fontFamily: 'var(--spira-font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 14,
}
/* La palabra que rotula una mitad de una casilla compuesta ("Día", "Semana"). Va en tinta atenuada
   y un punto más chica que el valor: nombra al número sin competirle. */
const unidad: CSSProperties = { fontSize: 13, color: 'var(--spira-muted)', flex: '0 0 auto' }


/* `Etapa` y el ida y vuelta Día ↔ semana viven en `semanaDeVisita.ts`: son reglas puras con test
   propio, porque pueden quedar al revés sin que la pantalla se vea mal. */
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
  /* UN título, en un solo campo. Al abrir una definición VIEJA —que tiene las dos columnas, "V6" y
     "W16"— se muestran unidas por `visitTitle`, igual que en el resto de la app, así lo que editás
     es exactamente lo que venías viendo. Al guardar sale entero a `name` y `code` queda en null: la
     definición se normaliza sola la primera vez que alguien la toca. */
  const [titulo, setTitulo] = useState(() =>
    initial ? visitTitle({ visit_code: initial.code, visit_name: initial.name, kind: 'programada' }) : '',
  )
  const [etapa, setEtapa] = useState<Etapa>(initial ? fieldsToEtapa(initial.role, initial.date_mode) : 'tratamiento')
  const [visitType, setVisitType] = useState<VisitType>(initial?.visit_type ?? 'presencial')
  const [offset, setOffset] = useState(String(initial?.offset_days ?? 0))
  /* La semana NO se guarda: es `offset` dicho en otra unidad. Vive en su propio estado igual —y no
     como valor derivado— porque es una casilla que se escribe, y mientras la escribís pasa por
     estados que el día no puede representar (vacía, un "-" solo). Derivarla obligaría a redondear
     lo que el usuario está tipeando. */
  const [semana, setSemana] = useState(() => semanaInicial(String(initial?.offset_days ?? 0)))
  // Ventana simétrica ±N días (un solo campo: window_minus = window_plus). Edición: si la fila
  // legacy era asimétrica, tomamos window_plus como referencia y al guardar queda simétrica.
  const [windowDays, setWindowDays] = useState(String(initial?.window_plus ?? initial?.window_minus ?? 0))
  const [dispenses, setDispenses] = useState(initial?.dispenses ?? false)
  const [dispensesIp, setDispensesIp] = useState(initial?.dispenses_ip ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* —— Ida y vuelta Día ↔ Semana ——
     Las dos casillas son el mismo número en distinta unidad: completás una y la otra se calcula.
     Cada dirección se dispara con la EDICIÓN y no con el valor, así que no rebotan entre sí; y
     ninguna escribe en la otra mientras lo tipeado no sea un entero, así que un estado de paso
     —casilla vacía, un "-" solo— no le borra el valor a la de al lado. La regla y su porqué están
     en `semanaDeVisita.ts`, con test. */
  const cambiarOffset = (v: string) => {
    setOffset(v)
    const s = semanaTrasCambiarDia(v)
    if (s !== null) setSemana(s)
  }
  const cambiarSemana = (v: string) => {
    setSemana(v)
    const d = diaTrasCambiarSemana(v)
    if (d !== null) setOffset(d)
  }
  const cambiarEtapa = (next: Etapa) => {
    setTitulo(nombreTrasCambiarEtapa(titulo, etapa, next))
    setEtapa(next)
  }

  /* Válido = el título con texto + las cantidades en días son enteras (vacío → 0).
     El offset admite negativos (screening pre-rando); las ventanas son magnitudes, no
     pueden ser negativas ni fraccionarias (la columna es `integer` y un negativo invertiría
     la ventana en silencio al sincronizar). */
  const isInt = (v: string) => Number.isInteger(Number(v))
  const isNonNegInt = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 0
  const offsetInvalid = !isInt(offset)
  const windowInvalid = !isNonNegInt(windowDays)
  const valid =
    titulo.trim() !== '' && !offsetInvalid && !windowInvalid

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onSubmit({
      /* El título entero va al NOMBRE y el código se anula. Si el viejo se dejara ahí, la app lo
         uniría al título nuevo y mostraría "V1 V5 W4" — el código dejó de ser un dato aparte. */
      code: null,
      name: titulo.trim(),
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

  return (
    <Modal title={initial ? 'Editar visita del cuadro' : 'Nueva visita del cuadro'} onClose={onClose} maxWidth={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* UN solo cuadro de texto para el título (decisión del Director, 2026-09-20). Antes eran
            dos campos —Código y Nombre—, después una casilla con las dos mitades pegadas, y esa
            quedó TAN integrada que no se veía que hubiera dos cosas para llenar: "me costó bastante
            y yo lo estoy buscando". La salida no fue separarlas mejor sino dejar de separarlas:
            el título es lo que el usuario escriba, "V5 W4" o lo que quiera.
            Se guarda entero en `name` y `code` queda en null — la columna sigue existiendo para las
            definiciones viejas, que `tituloDeDefinicion` une al leer. */}
        <FormField label="Visita">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="V5 W4" style={fieldInput} />
        </FormField>
        <FormField label="Etapa">
          <SearchableSelect value={etapa} onChange={(v) => cambiarEtapa(v as Etapa)} options={ETAPA_OPTS} placeholder="Elegí la etapa" />
        </FormField>
        <FormField label="Modalidad">
          <SearchableSelect value={visitType} onChange={(v) => setVisitType(v as VisitType)} options={TYPES} placeholder="Elegí la modalidad" />
        </FormField>
        {/* El mismo número dicho de dos maneras: en la base hay sólo `offset_days`, pero el
            protocolo se escribe en semanas y en semanas se piensa. Por eso van en UNA casilla —el
            mismo criterio que el campo Visita— y completar una completa la otra.
            El rótulo ya no cambia con la etapa (antes decía "offset desde la randomización" o "día
            de referencia" según el caso): lo que el día significa en cada etapa lo explica el ⓘ,
            que es donde no le roba lugar al que ya sabe. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span id="def-dia-label" style={{ ...fieldLabelStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Día de la visita según el protocolo
            <InfoTip
              titulo="Día de la visita"
              cuerpo="Cuántos días después de la randomización cae la visita, según el cuadro del protocolo. En las que se agendan a mano es sólo la referencia para calcular la ventana."
              size={14}
            />
          </span>
          <div
            className="spira-field-group"
            role="group"
            aria-labelledby="def-dia-label"
            style={{ ...fieldInput, display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <span style={unidad}>Día</span>
            <input
              className="spira-bare-input spira-num-limpio"
              type="number"
              step="1"
              value={offset}
              onChange={(e) => cambiarOffset(e.target.value)}
              aria-label="Día"
              style={{ ...bareInput, ...numText, width: 62 }}
            />
            <span style={{ ...unidad, marginLeft: 11 }}>Semana</span>
            <input
              className="spira-bare-input spira-num-limpio"
              type="number"
              step="1"
              value={semana}
              onChange={(e) => cambiarSemana(e.target.value)}
              aria-label="Semana"
              style={{ ...bareInput, ...numText, width: 52 }}
            />
          </div>
          {offsetInvalid && <Hint>Tiene que ser un número entero de días.</Hint>}
        </div>
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

        {error && <div style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>{error}</div>}

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
