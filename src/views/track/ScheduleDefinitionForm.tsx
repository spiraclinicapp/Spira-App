import { useState, type CSSProperties, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { FormField, fieldInput, fieldLabelStyle } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { VisitDefinition, DefinitionInput } from '../../data/visitDefinitions'
import type { VisitType } from '../../data/visits'
import { InfoTip } from '../../components/InfoTip'
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
/* Métrica de los números (código, día, semana): lo mismo que la clase `.spira-mono`, pero inline
   porque el input del código y el espejo que le da el ancho tienen que compartirla EXACTAMENTE
   (ver `CodeInput`). */
const codeText: CSSProperties = {
  fontFamily: 'var(--spira-font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 14,
}
/* La palabra que rotula una mitad de una casilla compuesta ("Día", "Semana"). Va en tinta atenuada
   y un punto más chica que el valor: nombra al número sin competirle. */
const unidad: CSSProperties = { fontSize: 13, color: 'var(--spira-muted)', flex: '0 0 auto' }

/**
 * El input del código, que CRECE con lo que se escribe para que el nombre quede pegado a él y los
 * dos se lean como un valor solo ("V16 W48") en vez de a una distancia fija.
 *
 * El ancho no se mide por JS ni con el atributo `size`: la fuente de los códigos es Inter (ver
 * `--spira-font-mono`, que de monoespaciada no tiene nada), así que `size` —que cuenta caracteres
 * de ancho promedio— quedaría corto o largo según las letras. En su lugar, un espejo invisible con
 * el mismo texto y la misma métrica es el ÚNICO elemento en flujo, y por lo tanto el que fija el
 * ancho; el input va absoluto encima. Exacto para cualquier fuente y sin un render de más.
 *
 * El input tiene que estar FUERA DEL FLUJO, no simplemente encima: mientras compartía la celda de
 * un grid con el espejo, el ancho intrínseco del `<input>` seguía entrando en la cuenta del
 * `max-content` y le ponía un piso de 39px a la casilla — ni `size={1}` lo bajaba. Resultado: "V1",
 * "V16" y "V999" medían todos igual y los códigos cortos (o sea, todos) quedaban con un hueco
 * muerto antes de la semana, que es justo lo que se vino a eliminar. Absoluto, no mide nada.
 * Los 2px del espejo son el lugar del cursor cuando está al final del texto.
 */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', flex: '0 0 auto', alignSelf: 'stretch' }}>
      <span aria-hidden style={{ ...codeText, display: 'block', visibility: 'hidden', whiteSpace: 'pre', paddingRight: 2 }}>
        {value || 'V1'}
      </span>
      <input
        className="spira-bare-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="V1"
        aria-label="Código"
        style={{ ...bareInput, ...codeText, position: 'absolute', inset: 0, width: '100%' }}
      />
    </span>
  )
}

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
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
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
    setName(nombreTrasCambiarEtapa(name, etapa, next))
    setEtapa(next)
  }

  /* Válido = código y nombre con texto + las cantidades en días son enteras (vacío → 0).
     El offset admite negativos (screening pre-rando); las ventanas son magnitudes, no
     pueden ser negativas ni fraccionarias (la columna es `integer` y un negativo invertiría
     la ventana en silencio al sincronizar). */
  const isInt = (v: string) => Number.isInteger(Number(v))
  const isNonNegInt = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 0
  const offsetInvalid = !isInt(offset)
  const windowInvalid = !isNonNegInt(windowDays)
  const valid =
    code.trim() !== '' && name.trim() !== '' && !offsetInvalid && !windowInvalid

  const submit = async () => {
    setBusy(true)
    setError(null)
    const res = await onSubmit({
      code: code.trim(),
      name: name.trim(),
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
        {/* El código y el nombre son UN dato y se leen de corrido ("V16 W48"), así que viven en un
            solo recuadro —la geometría de `fieldInput`— con las dos partes peladas adentro, y no en
            dos campos separados (pedido del Director, 2026-09-20). En la base siguen siendo dos
            columnas: esto es presentación.
            No usa `FormField` porque ése envuelve en un <label>, y un label asocia a UN control: con
            dos adentro, el lector de pantalla le adjudicaría el rótulo al primero y dejaría al otro
            mudo. Acá el rótulo nombra al grupo (`role="group"` + `aria-labelledby`) y cada mitad
            lleva su propio `aria-label`: para el ojo es una pieza, para el lector siguen siendo dos
            partes nombradas. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span id="def-visita-label" style={fieldLabelStyle}>Visita</span>
          <div
            className="spira-field-group"
            role="group"
            aria-labelledby="def-visita-label"
            style={{ ...fieldInput, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <CodeInput value={code} onChange={setCode} />
            <input
              className="spira-bare-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la visita"
              aria-label="Nombre"
              style={{ ...bareInput, flex: 1 }}
            />
          </div>
        </div>
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
              style={{ ...bareInput, ...codeText, width: 62 }}
            />
            <span style={{ ...unidad, marginLeft: 11 }}>Semana</span>
            <input
              className="spira-bare-input spira-num-limpio"
              type="number"
              step="1"
              value={semana}
              onChange={(e) => cambiarSemana(e.target.value)}
              aria-label="Semana"
              style={{ ...bareInput, ...codeText, width: 52 }}
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
