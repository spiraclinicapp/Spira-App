import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useVisit } from '../../data/dayVisits'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { VisitProcedures } from './VisitProcedures'
import { CommentThread } from './CommentThread'
import { VisitDispensationPanel } from '../pharma/VisitDispensationPanel'
import { advanceRole } from './advanceStep'
import { Panel } from './Panel'
import { VisitHeader } from './VisitHeader'
import { VisitActionBar } from './VisitActionBar'
import { DoctorRequestModal } from './DoctorRequestModal'

/**
 * Detalle de una visita (rediseño del encabezado, handoff `docs/handoff-visitas-encabezado/`). El
 * MISMO componente se abre desde tres lugares: la vista del día (`context="day"`), la ficha del
 * paciente y la cola del médico (ambas `context="patient"`, SOLO LECTURA). Trae sus datos por id con
 * `useVisit`, así los tres quedan sincronizados por construcción.
 *
 * ```
 * ┌ VisitHeader ────────────────────────────────────────────────┐ ~191px
 * │ util: protocolo · código · tag ···· [coord] [1 de 4 ‹›] [✕]  │
 * │ idw:  identidad+médico │ datos del paciente │ fechas         │
 * ├ VisitActionBar ─────────────────────────────────────────────┤   68px
 * │ etapa · hora · contexto      2 DE 4  │  [sec] [PRIMARIA]     │
 * ├ cuerpo (scroll) ────────────────────────────────────────────┤
 * │ Procedimientos          │  Dispensación                     │
 * │ Comentarios (a ancho completo) ─────────────────────────────│
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Dos diferencias deliberadas contra el mock, las dos decididas en la `/plan-eng-review` del
 * 2026-08-13 y explicadas en el PLAN de esa carpeta: **Comentarios se conserva** (el mock no lo
 * dibuja, pero está en producción desde la 0048) y **el anexo de retroceder/historial no está**
 * (no tiene backend; anotado en `TODOS.md`).
 */
export function VisitDetail({
  visitId, accent, context, onClose, canReception = false, canClinical = false,
  onAdvance, onChanged, pos, onPrev, onNext, seed,
}: {
  visitId: string
  accent: string
  context: 'day' | 'patient'
  onClose: () => void
  canReception?: boolean
  canClinical?: boolean
  onAdvance?: (visit: DayVisitRow, next: OperationalStage) => void | Promise<void>
  onChanged?: () => void
  /** Posición dentro de la lista visible ("3 / 14"), para la fila de utilidades. Solo en `day`. */
  pos?: string
  /** Navegación a la visita anterior/siguiente de la lista visible. Solo en `day` (habilita ↑↓). */
  onPrev?: () => void
  onNext?: () => void
  /**
   * Fila que el padre YA tiene (la del día), para pintar el modal al instante mientras `useVisit`
   * refetchea — así abrir y navegar con ↑↓ no esperan la consulta (sin parpadeo/lag). Cuando llega
   * el dato fresco para ESTE visitId, reemplaza al seed. Sin seed (ficha/cola) = espera la consulta.
   */
  seed?: DayVisitRow
}) {
  const q = useVisit(visitId)
  const fetched = q.data?.[0] ?? null
  // Preferimos el dato fresco de ESTE visitId; si todavía no llegó (nav ↑↓), mostramos el seed; y si
  // no hay seed, el último dato (stale-while-revalidate de useSupabaseQuery evita el spinner).
  const visit = (fetched?.id === visitId ? fetched : seed?.id === visitId ? seed : fetched) ?? null

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [doctorOpen, setDoctorOpen] = useState(false)

  const readOnly = context !== 'day'
  const canNav = !!(onPrev || onNext)

  const role = visit ? advanceRole(visit.operational_stage) : null
  const canAdvance = role === 'reception' ? canReception : role === 'clinical' ? canClinical : false

  // Esc cierra; ↑↓/j k navegan (solo si hay lista y el foco no está en un campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const enCampo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      // El guard por target vale TAMBIÉN para Escape, y no solo para las flechas: con el encabezado
      // nuevo hay campos de fecha y de médico que se editan en línea, y ahí Escape significa
      // "descartar la edición", no "cerrar la visita". Antes cerraba el modal y se perdía lo tipeado.
      if (e.key === 'Escape') { if (!enCampo && !e.defaultPrevented) onClose(); return }
      if (!canNav) return
      // Si un control interno ya consumió la tecla (un desplegable abierto —ej. el select de
      // coordinador con pocas opciones— hace preventDefault en las flechas), no la robamos: React
      // corre sus handlers en #root antes que este listener de document, así que ya viene marcada.
      if (e.defaultPrevented) return
      if (enCampo) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); onNext?.() }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); onPrev?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext, canNav])

  const refrescar = () => { onChanged?.(); q.refetch() }

  const advance = async (next: OperationalStage) => {
    if (!visit || !onAdvance) return
    setBusy(true); setErr(null)
    // El padre resuelve el caso especial: en screening/randomización, "Finalizar atención" abre el
    // cierre clínico (ReadyOutcomeModal) en vez de marcar directo.
    await onAdvance(visit, next)
    setBusy(false)
    refrescar()
  }

  return (
    <div style={backdrop} onMouseDown={onClose} role="presentation">
      <div
        style={card}
        role="dialog"
        aria-modal="true"
        aria-label={visit ? `Visita ${visit.patient_code ?? ''}` : 'Visita'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {q.loading && !visit ? (
          <div style={{ padding: '40px 24px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando visita…</div>
        ) : q.error ? (
          <div style={{ padding: '30px 24px', fontSize: 13.5, color: 'var(--spira-danger)' }}>No se pudo cargar la visita: {q.error}</div>
        ) : !visit ? (
          <div style={{ padding: '30px 24px', fontSize: 13.5, color: 'var(--spira-muted)' }}>No se encontró la visita.</div>
        ) : (
          <>
            <VisitHeader
              visit={visit}
              readOnly={readOnly}
              pos={pos}
              onPrev={onPrev}
              onNext={onNext}
              onClose={onClose}
              onSaved={refrescar}
              onError={setErr}
            />

            <VisitActionBar
              visit={visit}
              readOnly={readOnly}
              canAdvance={canAdvance}
              busy={busy}
              onAdvance={advance}
              onSolicitarMedico={() => { setErr(null); setDoctorOpen(true) }}
            />

            {err && (
              <div style={{ margin: '12px 18px 0', fontSize: 13, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px', flex: '0 0 auto' }}>{err}</div>
            )}

            {/* Cuerpo: lo que se HACE en la visita, en dos columnas parejas (handoff §8). */}
            <div style={{ padding: '16px 22px 24px', overflow: 'auto' }}>
              <div className="spira-visit-body" style={body}>
                {/* Cada uno monta su propio `Panel`. */}
                <VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} />
                <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
              </div>

              {/* Comentarios NO está en el mock y se conserva igual (decisión del Director,
                  2026-08-13): es una función en producción desde la 0048 y desde la ficha del
                  paciente este modal es la única puerta al hilo. Va a ancho completo y debajo
                  porque un hilo se lee mejor largo que angosto, y así el cuerpo de arriba queda
                  exactamente como el mock. */}
              <div style={{ marginTop: 14 }}>
                <Panel title="Comentarios" icon="message" accent={accent}>
                  <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
                </Panel>
              </div>
            </div>
          </>
        )}
      </div>

      {/* "Solicitar médico" de la barra abre el popup que YA existe (motivo por chips + hilo),
          en vez de duplicar el panel adentro del modal. */}
      {doctorOpen && visit && (
        <DoctorRequestModal
          visitId={visit.id}
          accent={accent}
          canClinical={canClinical}
          onClose={() => setDoctorOpen(false)}
          onChanged={refrescar}
        />
      )}
    </div>
  )
}

const backdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(20, 48, 46, 0.42)', backdropFilter: 'blur(2px)',
  display: 'grid', placeItems: 'center', zIndex: 50, padding: 22,
  animation: 'spOverlayIn .18s ease both',
}
/** 1120 y no los 1020 de antes: con la dispensación hecha formulario, la columna derecha pasó a
 *  tener renglones de cuatro piezas (nombre · cantidad · estado · quitar) y un selector de tres
 *  (medicamento · cantidad · agregar) en 476px, donde el nombre del medicamento se cortaba y el
 *  selector se comía el aire. Con 1120 la columna queda en ~527 y las dos filas entran sin apretar.
 *  Es además el ancho al que está dibujado el mock del encabezado. El `95vw` sigue siendo el que
 *  manda en pantallas chicas, así que no hay riesgo de desborde. */
const card: CSSProperties = {
  width: 'min(1120px, 95vw)', maxHeight: '90vh', background: 'var(--spira-paper)',
  border: '1px solid var(--spira-line)', borderRadius: 20, boxShadow: 'var(--spira-shadow-lg)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'spModalIn .22s cubic-bezier(.2,.85,.25,1) both',
}
const body: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'start',
}
