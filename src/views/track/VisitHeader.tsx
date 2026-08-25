import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'
import { SearchableSelect } from '../../components/SearchableSelect'
import { AutocompleteInput, textSuggestions } from '../../components/AutocompleteInput'
import { setVisitCoordinator, setVisitPhysician } from '../../data/dayVisits'
import type { DayVisitRow } from '../../data/dayVisits'
import { useProtocolCoordinators } from '../../data/pharma/coordinators'
import { useTreatingPhysicians } from '../../data/patients'
import { setEstimatedDate, setRealDate } from '../../data/visits'
import { desvioDias, fueraDeVentana, visitCode, visitTitle } from '../../lib/visits'
import { VisitDateInline } from './VisitDateInline'
import {
  datosDelPaciente, medicoDeVisita, puedeEditarCoordinador, puedeEditarFechaReal, puedeEditarMedico,
} from './visitHeaderRules'

/**
 * Encabezado del modal de visita (handoff `docs/handoff-visitas-encabezado/`, §3-§6). Tres bandas:
 *
 * ```
 * .util  51px   protocolo · código · tag de visita ······ [coordinador] [1 de 4 ‹ ›] [✕]
 * .idw  ~140px  ┌ identidad ────────┬ datos ─────────┬ fechas ────────────┐
 *               │ nombre 23/700     │ Sexo    Edad   │ FECHA EST. [ 32px ]│
 *               │ nº de paciente    │ F.nac   Fértil │ FECHA REAL [ 32px ]│
 *               │ MÉDICO A CARGO    │                │                    │
 *               └───────────────────┴────────────────┴────────────────────┘
 * ```
 *
 * El estado de la visita NO se dice acá: va una sola vez, en el listón de la barra de acción
 * (checklist de QA del handoff). Por eso la identidad ya no lleva chip de etapa.
 *
 * Todos los datos salen de `v_track_visits` en UNA consulta — la fertilidad se sumó a la vista en
 * la 0079 justamente para eso: era la única que obligaba a una segunda consulta al paciente, que
 * llegaba después y recomponía la rejilla a la vista del usuario en cada apertura y cada ↑↓.
 */
export function VisitHeader({
  visit, readOnly, pos, onPrev, onNext, onClose, onSaved, onError, onOpenPatient,
}: {
  visit: DayVisitRow
  readOnly: boolean
  pos?: string
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
  /** Algo se guardó: refrescar la visita (y la lista del padre). */
  onSaved: () => void
  /** Errores que no caben junto al control (RPC del coordinador): suben al banner del modal. */
  onError: (msg: string) => void
  /**
   * Ir a la ficha del paciente. Con esto, nombre y Nº de sujeto pasan a ser navegables. Sin esto
   * quedan como texto — lo pasa el padre, porque desde la ficha del paciente el enlace llevaría a
   * donde ya estás.
   */
  onOpenPatient?: () => void
}) {
  const canNav = !!(onPrev || onNext)
  const code = visitCode(visit)
  const datos = datosDelPaciente(visit)

  // Desvío y fuera de ventana: las dos pastillas van al lado de la ETIQUETA "Fecha real", no del
  // valor, para no ensanchar el campo (handoff §6). El desvío solo existe con las dos fechas.
  const d = desvioDias(visit.estimated_date, visit.real_date)
  const fuera = fueraDeVentana(visit.real_date, visit.window_start, visit.window_end)

  return (
    <div style={{ background: 'var(--spira-white)', flex: '0 0 auto' }}>
      {/* ── Fila de utilidades ── */}
      <div style={util}>
        <b style={{ fontFamily: 'var(--spira-font-display)', fontSize: 13, fontWeight: 700 }}>{visit.protocol_name}</b>
        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>{visit.protocol_code}</span>
        <span style={visTag}>
          <Icon name="calendar" size={13} color="var(--spira-primary)" />
          {code ? `Visita ${code}` : visitTitle(visit)}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CoordinatorChip visit={visit} readOnly={readOnly} onSaved={onSaved} onError={onError} />
          {canNav && (
            <span style={navpill}>
              <button type="button" onClick={() => onPrev?.()} title="Visita anterior (↑)" aria-label="Visita anterior" style={navBtn}>
                <Icon name="chevronUp" size={15} color="var(--spira-muted)" />
              </button>
              {pos && <span style={cnt}>{pos}</span>}
              <button type="button" onClick={() => onNext?.()} title="Visita siguiente (↓)" aria-label="Visita siguiente" style={navBtn}>
                <Icon name="chevronDown" size={15} color="var(--spira-muted)" />
              </button>
            </span>
          )}
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar" style={xb}>
            <Icon name="x" size={15} color="var(--spira-muted)" />
          </button>
        </span>
      </div>

      {/* ── Identidad · datos · fechas ── */}
      <div className="spira-visit-idw" style={idw}>
        <div style={idn}>
          {/* Nombre y Nº de sujeto abren la MISMA ficha, así que se resaltan juntos: apuntar
              cualquiera de los dos los subraya a los dos (`.spira-link-group`, tokens.css). Si cada
              uno se subrayara solo, se leerían como dos destinos distintos. Siguen siendo dos
              disparadores y no uno que los envuelva: así el resalte lo dispara el texto y no el
              aire alrededor, y cada dato conserva su caja.
              La flecha es UNA para el par y se para al costado del bloque, no colgando de una
              palabra: lo que se abre es el paciente, que son los dos datos juntos. 16px de aire
              porque a menos se lee como un tercer dato de la identidad (mock del 2026-08-24). */}
          <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={nm}>
                <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
                  {visit.patient_name}
                </PatientLink>
              </h2>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 5 }}>
                <b className="spira-mono" style={pid}>
                  {visit.patient_code
                    ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
                    : 'Sin IVRS'}
                </b>
              </div>
            </div>
            {onOpenPatient && <PatientLinkArrow size={16} />}
          </div>
          <PhysicianField visit={visit} readOnly={readOnly} onSaved={onSaved} />
        </div>

        {/* La rejilla se cae entera si el paciente no tiene ningún dato cargado: una columna de
            rótulos con guiones no dice nada que el vacío no diga mejor. */}
        {datos.length > 0 && (
          <div style={col}>
            <div style={facts}>
              {datos.map((f) => (
                <div key={f.k}>
                  <div style={k}>{f.k}</div>
                  <div style={v}>{f.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="spira-visit-dates" style={{ ...col, paddingLeft: 24 }}>
          <VisitDateInline
            label="Fecha est."
            value={visit.estimated_date}
            editable={!readOnly}
            tone="soft"
            onSave={async (iso) => {
              // `setEstimatedDate` y NO `rescheduleVisit`: aquella además limpia la marca de "No
              // vino", que es lo que significa reagendar — no lo que significa corregir un tipeo.
              const res = await setEstimatedDate(visit.id, iso)
              if (res.error) return res.error
              onSaved()
              return null
            }}
          />
          <div style={{ marginTop: 8 }}>
            <VisitDateInline
              label="Fecha real"
              value={visit.real_date}
              editable={!readOnly && puedeEditarFechaReal(visit)}
              title={puedeEditarFechaReal(visit) ? undefined : 'Se completa al iniciar la atención'}
              badge={
                <>
                  {d != null && d !== 0 && <span style={dev}>{d > 0 ? '+' : '−'}{Math.abs(d)} d</span>}
                  {fuera && (
                    <span style={devDanger} title="La fecha real cayó fuera de la ventana del cronograma">
                      <Icon name="alert" size={11} color="var(--spira-danger)" stroke={2.4} />
                      Fuera de ventana
                    </span>
                  )}
                </>
              }
              onSave={async (iso) => {
                const res = await setRealDate(visit.id, iso)
                if (res.error) return res.error
                onSaved()
                return null
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Médico a cargo (handoff §4): etiqueta en versalitas y el nombre debajo, sin avatar. Editable con
 * un botón chevron de 22px; con la visita concretada, candado y nada más.
 *
 * El editor es un autocompletado sobre los médicos ya cargados (mismo componente y misma fuente que
 * la ficha del paciente): es texto libre, así que sin sugerencias el mismo médico entra escrito de
 * cinco maneras. Guardar ADOPTA el heredado — si la visita no tenía médico propio, queda con el que
 * mostraba, congelado (ver `set_visit_physician`, 0079).
 */
function PhysicianField({ visit, readOnly, onSaved }: {
  visit: DayVisitRow; readOnly: boolean; onSaved: () => void
}) {
  const editable = !readOnly && puedeEditarMedico(visit)
  const nombre = medicoDeVisita(visit)
  const [editing, setEditing] = useState(false)

  return (
    <div style={{ marginTop: 12 }}>
      <div style={mlab}>
        Médico a cargo
        {!editable && <Icon name="lock" size={11} color="var(--spira-faint)" />}
      </div>

      {editing ? (
        // El editor va en un componente APARTE y montado solo mientras se edita, a propósito: es el
        // que consulta la lista de médicos ya cargados, y esa consulta barre `patients` entero.
        // Colgada del padre se dispararía en cada apertura del modal para alimentar un
        // autocompletado que casi nunca se abre.
        <PhysicianEditor
          visit={visit}
          inicial={nombre ?? ''}
          onCerrar={() => setEditing(false)}
          onSaved={() => { setEditing(false); onSaved() }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, minHeight: 30 }}>
          <span style={nombre ? mn : { ...mn, color: 'var(--spira-faint)', fontWeight: 500 }}>
            {nombre ?? 'Sin asignar'}
          </span>
          {editable && (
            <button type="button" onClick={() => setEditing(true)} title="Cambiar el médico a cargo" aria-label="Cambiar el médico a cargo" style={sw}>
              <Icon name="chevronDown" size={13} color="var(--spira-muted)" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** El editor del médico. Ver por qué vive aparte en el comentario de su único uso. */
function PhysicianEditor({ visit, inicial, onCerrar, onSaved }: {
  visit: DayVisitRow; inicial: string; onCerrar: () => void; onSaved: () => void
}) {
  const [text, setText] = useState(inicial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const physicians = useTreatingPhysicians()

  const guardar = async () => {
    setBusy(true)
    // Vacío = limpiar el médico propio de la visita; la vista vuelve a caer al del paciente.
    const res = await setVisitPhysician(visit.id, text.trim() || null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    onSaved()
  }

  return (
    <>
      {/* `minHeight` igual al de la fila en reposo: alternar entre leer y editar no puede cambiar
          el alto del encabezado (checklist de QA del handoff). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, minHeight: 30, maxWidth: 300 }}>
        <div
          style={{ flex: 1, minWidth: 0 }}
          onKeyDown={(e) => {
            // Escape acá descarta la edición; sin este corte, el listener de `document` del modal
            // lo lee como "cerrar la visita". Enter guarda, salvo que el autocompletado lo esté
            // usando para aceptar una sugerencia (ahí ya hizo preventDefault).
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onCerrar(); return }
            if (e.key === 'Enter' && !e.defaultPrevented) { e.preventDefault(); void guardar() }
          }}
        >
          {/* `compact`: la caja de 44px de formulario acá pesa el triple que el dato que reemplaza
              y descoloca el bloque de identidad. En 30px el editor ocupa el lugar del nombre. */}
          <AutocompleteInput
            compact
            value={text}
            onChange={setText}
            suggestions={textSuggestions((physicians.data ?? []).map((p) => p.treating_physician))}
            placeholder="Nombre del médico"
            autoFocus
          />
        </div>
        <button type="button" onClick={() => void guardar()} disabled={busy} title="Guardar" aria-label="Guardar" style={okSm(busy)}>
          <Icon name="check" size={14} color="var(--spira-on-accent)" stroke={2.4} />
        </button>
        <button type="button" onClick={onCerrar} disabled={busy} title="Descartar" aria-label="Descartar" style={koSm}>
          <Icon name="x" size={13} color="var(--spira-muted)" />
        </button>
      </div>
      {err && <div style={{ fontSize: 11.5, color: 'var(--spira-danger)', marginTop: 4 }}>{err}</div>}
    </>
  )
}

/**
 * Coordinador de la visita, en la fila de utilidades (handoff §3). Sube desde la línea de identidad
 * del diseño anterior, sin cambiar de mecánica: `SearchableSelect variant="chip"` sobre
 * `set_visit_coordinator` (0065), con el picker acotado a los coordinadores del protocolo
 * (`useProtocolCoordinators`, RPC — sin él la RLS de `users` no deja leer a las demás).
 * En solo lectura, chip inerte; nada si la visita no tiene coordinador.
 */
function CoordinatorChip({ visit, readOnly, onSaved, onError }: {
  visit: DayVisitRow; readOnly: boolean; onSaved: () => void; onError: (msg: string) => void
}) {
  const bloqueado = readOnly || !puedeEditarCoordinador(visit)
  const coords = useProtocolCoordinators(bloqueado ? null : visit.protocol_id)
  const [busy, setBusy] = useState(false)

  if (bloqueado) {
    if (!visit.coordinator_name) return null
    return (
      <span style={coordRO} title={`Coordinador: ${visit.coordinator_name}`}>
        <Icon name="user" size={13} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        <span style={cl}>Coordinador</span>
        {visit.coordinator_name}
        {readOnly ? null : <Icon name="lock" size={11} color="var(--spira-faint)" style={{ flex: '0 0 auto' }} />}
      </span>
    )
  }

  const change = async (id: string) => {
    setBusy(true)
    const res = await setVisitCoordinator(visit.id, id || null)
    setBusy(false)
    if (res.error) { onError(res.error); return }
    onSaved()
  }

  return (
    <SearchableSelect
      variant="chip"
      leadingIcon="user"
      menuWidth="auto"
      value={visit.coordinator_id ?? ''}
      onChange={change}
      options={[
        { value: '', label: '— Sin asignar —' },
        ...(coords.data ?? []).map((c) => ({ value: c.id, label: c.full_name })),
      ]}
      placeholder={coords.loading ? 'Cargando…' : 'Asignar coordinador'}
      disabled={busy || coords.loading}
      entity="coordinador"
    />
  )
}

// ————————————————————————————————————————————————————
// Estilos (medidas del handoff §12)
// ————————————————————————————————————————————————————

const util: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 22px',
  borderBottom: '1px solid var(--spira-line)', minHeight: 51,
}
const visTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 25, padding: '0 11px', borderRadius: 7,
  background: 'rgba(46, 125, 116, 0.14)', fontFamily: 'var(--spira-font-display)', fontSize: 13,
  fontWeight: 700, color: 'var(--spira-primary)', whiteSpace: 'nowrap', letterSpacing: '-.01em',
}
const navpill: CSSProperties = {
  display: 'flex', alignItems: 'center', height: 30, borderRadius: 9, overflow: 'hidden',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', flex: '0 0 auto',
}
/* `padding:0` en las cajas fijas: sin él, el padding del navegador descentra el ícono (§13). */
const navBtn: CSSProperties = {
  width: 30, height: 28, border: 0, background: 'transparent', padding: 0, lineHeight: 0,
  display: 'grid', placeItems: 'center', cursor: 'pointer',
}
const cnt: CSSProperties = {
  height: 28, display: 'flex', alignItems: 'center', padding: '0 11px', fontSize: 12, fontWeight: 600,
  color: 'var(--spira-ink-soft)', borderLeft: '1px solid var(--spira-line)',
  borderRight: '1px solid var(--spira-line)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
}
const xb: CSSProperties = {
  width: 30, height: 30, borderRadius: 9, padding: 0, lineHeight: 0,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto',
}
const idw: CSSProperties = { padding: '15px 22px', display: 'flex', alignItems: 'stretch', gap: 22 }
const idn: CSSProperties = {
  minWidth: 0, flex: 1, borderLeft: '3px solid var(--spira-track)', paddingLeft: 13,
}
const nm: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 23, letterSpacing: '-.02em',
  margin: 0, color: 'var(--spira-ink-2)', lineHeight: 1.15,
}
const pid: CSSProperties = {
  fontSize: 17, fontWeight: 600, color: 'var(--spira-ink-soft)',
  fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em',
}
const col: CSSProperties = {
  flex: '0 0 auto', paddingLeft: 22, borderLeft: '1px solid var(--spira-line)',
  display: 'flex', flexDirection: 'column', justifyContent: 'center',
}
const facts: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, auto))', gap: '10px 26px',
}
const k: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
  color: 'var(--spira-faint)', whiteSpace: 'nowrap',
}
const v: CSSProperties = {
  fontSize: 13, fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', color: 'var(--spira-ink-2)',
}
const mlab: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, fontWeight: 700,
  letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--spira-faint)',
}
const mn: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-.01em',
  color: 'var(--spira-ink-2)', whiteSpace: 'nowrap',
}
const sw: CSSProperties = {
  width: 22, height: 22, padding: 0, lineHeight: 0, borderRadius: 7,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto',
}
/* Del alto de la caja compacta del autocompletado (30px), para que el trío se lea como un control
   y no como un campo con dos cajitas colgadas al lado. */
const okSm = (busy: boolean): CSSProperties => ({
  width: 26, height: 26, padding: 0, lineHeight: 0, borderRadius: 7, border: 'none',
  background: 'var(--spira-track)', display: 'grid', placeItems: 'center', cursor: 'pointer',
  flex: '0 0 auto', opacity: busy ? 0.6 : 1,
})
const koSm: CSSProperties = {
  width: 26, height: 26, padding: 0, lineHeight: 0, borderRadius: 7,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto',
}
const coordRO: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 10px 0 11px',
  borderRadius: 999, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line)',
  background: 'var(--spira-white)', color: 'var(--spira-ink-2)', fontSize: 12.5, fontWeight: 600,
  whiteSpace: 'nowrap', flex: '0 0 auto',
}
const cl: CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase',
  color: 'var(--spira-faint)',
}
const dev: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 6px', borderRadius: 5,
  background: 'rgba(176, 130, 63, 0.16)', color: 'var(--spira-acc-deep-warn)', fontSize: 10.5,
  fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: 0, textTransform: 'none',
}
const devDanger: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 19, padding: '0 6px', borderRadius: 5,
  background: 'rgba(166, 72, 59, 0.14)', color: 'var(--spira-danger)', fontSize: 10.5,
  fontWeight: 700, letterSpacing: 0, textTransform: 'none', whiteSpace: 'nowrap',
}
