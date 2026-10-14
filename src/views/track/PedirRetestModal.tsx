import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { DateField } from '../../components/DateField'
import { fieldInput } from '../../components/FormField'
import { btnOutline, btnPrimary } from '../../components/buttons'
import { registerVisitEvent } from '../../data/visitEvents'
import { useVisitProcedureStatus } from '../../data/procedures'
import { usePatientVisits } from '../../data/visits'
import type { DayVisitRow } from '../../data/dayVisits'
import { formatAR, formatDayMonth, todayISO, yearsFromTodayISO } from '../../lib/dates'
import { visitCode } from '../../lib/visits'
import { CasillasDeProcedimientos } from './CasillasDeProcedimientos'
import { procedimientosRepetibles } from './retomar'
import { MOTIVOS_DE_RETEST, contadorDeProcedimientos, notaDelRetest, proximaVisitaDe } from './pedirRetest'
import type { MotivoDeRetest } from './pedirRetest'
import './botonEtapa.css'

type Cuando = 'hoy' | 'proxima' | 'elegir'

/**
 * «Pedir retest» (menú del botón de etapa en una visita completa; handoff
 * `docs/design_handoff_boton_etapa/` §3, captura 08).
 *
 * Es un ATAJO del alta manual de retest (v0145, `FormRetest` en «Agendar visita»), que sigue donde
 * estaba: MISMO RPC (`register_visit_event` con `p_retest_of`), misma visita nueva asociada a la
 * original —que sigue completa— y mismas reglas. Lo que cambia es que la visita de origen ya viene
 * elegida. Tres diferencias con el mock, las tres por no inventar datos:
 *   · sin columna de «resultado» por procedimiento ni preselección: el modelo no guarda qué salió mal,
 *     y el alta manual tampoco preselecciona (decisión 9 del spec de la 0145);
 *   · el motivo no viene elegido de antemano, y va al frente de la nota (no hay columna; los motivos
 *     están a validar, handoff §6 — ver `pedirRetest.ts`);
 *   · «Próxima visita» sólo aparece si hay una del cronograma por delante.
 */
export function PedirRetestModal({ visit, accent, onClose, onDone }: {
  visit: DayVisitRow
  accent: string
  onClose: () => void
  /** Se pidió: `mensaje` es el aviso («Retest pedido · 2 procedimientos»). */
  onDone: (mensaje: string) => void
}) {
  const hoy = todayISO()
  const procs = useVisitProcedureStatus(visit.id, visit.protocol_id)
  const visitas = usePatientVisits(visit.patient_id, visit.protocol_id)
  const repetibles = procedimientosRepetibles(procs.data ?? [], visit.real_date !== null)
  const proxima = proximaVisitaDe(visitas.data ?? [], visit, hoy)

  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState<MotivoDeRetest | null>(null)
  const [cuando, setCuando] = useState<Cuando>('hoy')
  const [fechaElegida, setFechaElegida] = useState('')
  const [comentario, setComentario] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fecha = cuando === 'hoy' ? hoy : cuando === 'proxima' ? proxima?.estimated_date ?? null : fechaElegida || null
  const todos = repetibles.length > 0 && repetibles.every((p) => elegidos.has(p.procedure_id))
  const puede = elegidos.size > 0 && fecha !== null && !busy

  const pedir = async () => {
    if (!fecha) { setError('Elegí la fecha.'); return }
    if (elegidos.size === 0) return
    setBusy(true)
    setError(null)
    const res = await registerVisitEvent(visit.enrollment_id, 'retest', fecha, notaDelRetest(motivo, comentario), [...elegidos], visit.id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    onDone(`Retest pedido · ${contadorDeProcedimientos(elegidos.size)}`)
  }

  const codigo = visitCode(visit)
  const subtitulo = [
    codigo ? `Visita ${codigo}` : null,
    visit.real_date ? `completa el ${formatDayMonth(visit.real_date)}` : 'completa',
    visit.patient_name,
  ].filter(Boolean).join(' · ')

  return (
    <Modal title="Pedir retest" subtitle={subtitulo} onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 2 }}>
        <section>
          <div style={rotulo}>
            <span>Procedimientos a repetir</span>
            {repetibles.length > 1 && (
              <button
                type="button"
                className="spira-no-press"
                style={linkTodos}
                onClick={() => setElegidos(todos ? new Set() : new Set(repetibles.map((p) => p.procedure_id)))}
              >
                {todos ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            )}
          </div>
          {procs.loading && !procs.data ? (
            <div style={nota}>Cargando procedimientos…</div>
          ) : procs.error ? (
            <div style={{ ...nota, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos. Probá de nuevo.</div>
          ) : repetibles.length === 0 ? (
            <div style={nota}>En esta visita no quedó nada hecho para repetir.</div>
          ) : (
            <CasillasDeProcedimientos items={repetibles} elegidos={elegidos} onChange={setElegidos} accent={accent} variante="lista" />
          )}
        </section>

        <section>
          <div style={rotulo}><span>Motivo</span></div>
          <div style={seg} role="radiogroup" aria-label="Motivo">
            {/* Uno solo, y se puede soltar: es opcional (el alta manual tampoco lo pide). */}
            {MOTIVOS_DE_RETEST.map((m) => (
              <Opcion key={m} activa={motivo === m} onClick={() => setMotivo((x) => (x === m ? null : m))}>{m}</Opcion>
            ))}
          </div>
        </section>

        <section>
          <div style={rotulo}><span>Cuándo</span></div>
          <div style={seg} role="radiogroup" aria-label="Cuándo">
            <Opcion activa={cuando === 'hoy'} onClick={() => setCuando('hoy')}>Hoy</Opcion>
            {proxima?.estimated_date && (
              <Opcion activa={cuando === 'proxima'} onClick={() => setCuando('proxima')}>
                Próxima visita ({visitCode(proxima) || formatAR(proxima.estimated_date)})
              </Opcion>
            )}
            <Opcion activa={cuando === 'elegir'} onClick={() => setCuando('elegir')}>Elegir fecha…</Opcion>
          </div>
          {cuando === 'proxima' && proxima?.estimated_date && (
            <div style={{ ...nota, marginTop: 6 }}>El {formatAR(proxima.estimated_date)}, junto con esa visita.</div>
          )}
          {cuando === 'elegir' && (
            <div style={{ marginTop: 8, maxWidth: 220 }}>
              {/* Desde el día de la visita que se repite: un retest no puede ser anterior a su origen
                  (`visitasParaRetest` usa la misma regla en el alta manual). */}
              <DateField value={fechaElegida} onChange={setFechaElegida} min={visit.real_date ?? hoy} max={yearsFromTodayISO(2)} autoFocus />
            </div>
          )}
        </section>

        <section>
          <div style={rotulo}><span>Comentario (opcional)</span></div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Detalle para el equipo o el laboratorio"
            style={{ ...fieldInput, height: 'auto', minHeight: 62, padding: '9px 11px', resize: 'vertical', fontSize: 13 }}
          />
        </section>

        {error && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginRight: 'auto' }}>{contadorDeProcedimientos(elegidos.size)}</span>
          <button type="button" onClick={onClose} style={{ ...btnOutline, height: 36, fontSize: 13.5 }}>Cancelar</button>
          <button
            type="button"
            onClick={() => void pedir()}
            disabled={!puede}
            style={{ ...btnPrimary(accent), height: 36, fontSize: 13.5, opacity: puede ? 1 : 0.55, cursor: puede ? 'pointer' : 'default' }}
          >
            {busy ? 'Pidiendo…' : 'Pedir retest'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Una opción de «Motivo» o «Cuándo»: botones de radio con el aspecto de chip del mock. */
function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={activa} className={'spira-retest-opcion' + (activa ? ' elegida' : '')} onClick={onClick}>
      {children}
    </button>
  )
}

/* Rótulo de sección en versalitas, como los de la casa. `--spira-muted` y no el gris tenue del mock:
   a 10,5 px es texto normal para AA (ver la nota de contraste en tokens.css, campana v2). */
const rotulo: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6,
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--spira-muted)',
}
const linkTodos: CSSProperties = {
  border: 0, background: 'none', padding: 0, cursor: 'pointer', letterSpacing: 0, textTransform: 'none',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600, color: 'var(--spira-acc-deep-track)',
}
const seg: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }
const nota: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }
