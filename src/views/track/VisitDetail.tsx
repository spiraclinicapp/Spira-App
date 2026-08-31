import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useVisit, markArrived, startVisitAttention, markReady, markReadyWithOutcome, discontinueEnrollment } from '../../data/dayVisits'
import { todayISO } from '../../lib/dates'
import { ConfirmarAvance } from './ConfirmarAvance'
import { ReadyOutcomeModal } from './ReadyOutcomeModal'
import { RegisterVisitFlow } from './RegisterVisitFlow'
import { useVisitPermissions } from '../../lib/visitPermissions'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import { VisitProcedures } from './VisitProcedures'
import { CommentThread } from './CommentThread'
import { VisitDispensationPanel } from '../pharma/VisitDispensationPanel'
import { advanceRole, necesitaConfirmacion } from './advanceStep'
import { Panel } from './Panel'
import { VisitHeader } from './VisitHeader'
import { VisitActionBar } from './VisitActionBar'
import { DoctorRequestModal } from './DoctorRequestModal'

/**
 * Detalle de una visita (rediseño del encabezado, handoff `docs/handoff-visitas-encabezado/`). El
 * MISMO componente se abre desde cuatro lugares —la vista del día, la ficha del paciente, la cola
 * del médico y las alertas— y en todos se puede EDITAR. Trae sus datos por id con `useVisit`, así
 * los cuatro quedan sincronizados por construcción.
 *
 * Hasta el 2026-08-20 solo era editable abierto desde "Visitas del día" (`context="day"`); por las
 * otras tres puertas salía de solo lectura. Eso invertía para qué es la herramienta: no es una
 * ficha de consulta, es donde se registra lo que va pasando MIENTRAS pasa, y quien la abre suele
 * tener al paciente delante. Escribir o no lo decide el ROL (`useVisitPermissions`) y la RLS del
 * otro lado, nunca la puerta por la que entraste.
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
  visitId, accent, onClose, canReception, canClinical,
  onAdvance, onChanged, pos, onPrev, onNext, seed, onOpenPatient,
}: {
  visitId: string
  accent: string
  onClose: () => void
  /**
   * Permisos YA resueltos por la vista que abre el modal. Son OPCIONALES: sin ellos el modal los
   * calcula solo (`useVisitPermissions`), que es lo que necesitan la ficha, la cola y las alertas.
   * "Visitas del día" sí los pasa, porque ya los calculó para pintar sus filas y así no repite la
   * consulta de coordinaciones.
   */
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
  /**
   * Abrir la ficha del paciente (nombre y Nº de sujeto pasan a ser navegables). Lo pasa la vista
   * que puede navegar; desde la ficha del paciente NO se pasa, porque el enlace llevaría a donde ya
   * estás. Cierra el modal antes de navegar: la vista destino es otra y el modal es de esta.
   */
  onOpenPatient?: (patientId: string, protocolId: string) => void
}) {
  const q = useVisit(visitId)
  const fetched = q.data?.[0] ?? null
  // Preferimos el dato fresco de ESTE visitId; si todavía no llegó (nav ↑↓), mostramos el seed; y si
  // no hay seed, el último dato (stale-while-revalidate de useSupabaseQuery evita el spinner).
  const visit = (fetched?.id === visitId ? fetched : seed?.id === visitId ? seed : fetched) ?? null

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [doctorOpen, setDoctorOpen] = useState(false)
  /** Etapa a la que se va a avanzar, esperando confirmación (solo si la visita no es de hoy). */
  const [confirmando, setConfirmando] = useState<OperationalStage | null>(null)
  /** Cierre clínico de screening/randomización, y su salida "recitar". */
  const [outcomeFor, setOutcomeFor] = useState<DayVisitRow | null>(null)
  const [recitar, setRecitar] = useState<DayVisitRow | null>(null)

  /* Los permisos se calculan acá salvo que la vista ya los haya pasado (ver el comentario del
     prop). El modal se edita se abra desde donde se abra: lo único que decide es el rol. */
  const perms = useVisitPermissions(canReception === undefined || canClinical === undefined)
  const puedeOperar = canReception ?? perms.canReception
  const readOnly = !puedeOperar
  const canNav = !!(onPrev || onNext)

  const role = visit ? advanceRole(visit.operational_stage) : null
  const puedeClinica = canClinical ?? (visit ? perms.canClinical(visit) : false)
  const canAdvance = role === 'reception' ? puedeOperar : role === 'clinical' ? puedeClinica : false

  // Esc cierra; ↑↓/j k navegan (solo si hay lista y el foco no está en un campo de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Con el popup de "Atención médica" abierto, el teclado es SUYO. Su `Modal` también escucha
      // Escape en `document` y no frena nada, así que sin esto una sola tecla cerraría el popup y
      // la visita de abajo con él; y las flechas navegarían una lista que el usuario ni ve.
      if (doctorOpen) return
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
  }, [onClose, onPrev, onNext, canNav, doctorOpen])

  const refrescar = () => { onChanged?.(); q.refetch() }

  /**
   * Pedir el avance. Si la visita NO es de hoy, primero confirma: desde la ficha o las alertas es
   * fácil tener abierta una de hace dos meses y avanzarla creyendo que es la del día, y el cambio
   * de etapa queda firmado en el audit_log. En el recorrido normal (visita de hoy) no interrumpe.
   */
  const advance = (next: OperationalStage) => {
    if (!visit) return
    if (necesitaConfirmacion(visit.real_date, todayISO())) { setConfirmando(next); return }
    ejecutar(next)
  }

  /**
   * Ejecutar el avance. Corre acá y no en el padre: el modal se abre desde cuatro pantallas y solo
   * "Visitas del día" pasaba `onAdvance` — desde las otras tres el botón no hacía NADA (se veía
   * habilitado y no pasaba nada al apretarlo). Si el padre lo pasa, sigue mandando él: mantiene sus
   * avisos en la lista y su propio cierre clínico.
   */
  const ejecutar = async (next: OperationalStage) => {
    if (!visit) return
    setBusy(true); setErr(null)

    /* Avanzar NO escribe la fecha real. Acá se le ponía la de hoy a la visita sin fechar; se
       retiró el 2026-08-30 porque hacía saltar la etapa por encima del inicio de atención y se
       comía el sello de la 0102 — ver el comentario en `advanceStep.ts`. La fecha la pone
       `start_visit_attention`, cuando la atención empieza. */

    if (onAdvance) {
      await onAdvance(visit, next)
      setBusy(false); setConfirmando(null)
      refrescar()
      return
    }

    // Screening y randomización no se cierran de un click: el desenlace clínico se captura en su
    // propio modal (IVRS / randomizó), igual que en la lista del día.
    if (next === 'fin_atencion' && (visit.role === 'screening' || visit.role === 'randomizacion')) {
      setBusy(false); setConfirmando(null); setOutcomeFor(visit)
      return
    }

    const res =
      next === 'concurrio_al_centro' ? await markArrived(visit.id)
      // Preserva la fecha real que ya tenga: acá "iniciar atención" puede estar corrigiendo el
      // recorrido de una visita vieja, y pisarla con hoy le cambiaría el dato clínico. Desde la
      // 0102 esa preservación la garantiza además el servidor (`coalesce(pv.real_date, …)`), así
      // que ya no depende de que este call-site se acuerde.
      : next === 'inicio_atencion' ? await startVisitAttention(visit.id, visit.real_date ?? todayISO())
      : next === 'fin_atencion' ? await markReady(visit.id)
      : { error: 'Etapa desconocida.' }

    setBusy(false); setConfirmando(null)
    if (res.error) { setErr(res.error); return }
    refrescar()
  }

  return (
    <>
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
          <div style={{ padding: '30px 24px', fontSize: 13.5, color: 'var(--spira-acc-deep-danger)' }}>No se pudo cargar la visita: {q.error}</div>
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
              onOpenPatient={onOpenPatient ? () => { onClose(); onOpenPatient(visit.patient_id, visit.protocol_id) } : undefined}
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
              <div style={{ margin: '12px 18px 0', fontSize: 13, color: 'var(--spira-acc-deep-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 8, padding: '8px 12px', flex: '0 0 auto' }}>{err}</div>
            )}

            {/* Cuerpo: lo que se HACE en la visita, en dos columnas parejas (handoff §8). */}
            <div style={{ padding: '16px 22px 24px', overflow: 'auto' }}>
              <div className="spira-visit-body" style={body}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                  {/* Monta su propio `Panel` (el contador "n/total" va en la línea del rótulo). */}
                  <VisitProcedures visitId={visit.id} visitDefId={visit.visit_def_id} accent={accent} readOnly={readOnly} />

                  {/* Comentarios NO está en el mock y se conserva igual (decisión del Director,
                      2026-08-13): es una función en producción desde la 0048 y desde la ficha del
                      paciente este modal es la única puerta al hilo.
                      Va DENTRO de la columna izquierda y no a ancho completo debajo: ahí dejaba una
                      banda muerta entre los dos paneles cortos y el hilo. Y de este lado por la
                      misma medición que ya le eligió lugar en el diseño anterior — con una
                      dispensación cargada la columna derecha se estira casi al doble que la
                      izquierda, así que el hilo es justo lo que las empareja. */}
                  <Panel title="Comentarios" icon="message" accent={accent}>
                    <CommentThread visitId={visit.id} accent={accent} onAdded={onChanged} />
                  </Panel>
                </div>

                {/* Monta su propio `Panel`, con la banda sólida del realce siempre puesta. */}
                <div style={{ minWidth: 0 }}>
                  <VisitDispensationPanel visit={visit} accent={accent} readOnly={readOnly} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </div>

    {/* "Solicitar médico" de la barra abre el popup que YA existe (motivo por chips + hilo), en vez
        de duplicar el panel adentro del modal.

        Va FUERA del backdrop, no adentro. El backdrop cierra la visita con su `onMouseDown` y el
        único que frena la propagación es la tarjeta, así que un popup montado ahí adentro le
        entrega cada clic —incluido el de su propio ✕— al backdrop: cerrabas el popup y se cerraba
        la visita entera con él. Como hermano, sus clics nunca pasan por el backdrop. */}
    {doctorOpen && visit && (
      <DoctorRequestModal
        visitId={visit.id}
        accent={accent}
        canClinical={puedeClinica}
        onClose={() => setDoctorOpen(false)}
        onChanged={refrescar}
      />
    )}

    {/* Los tres van FUERA del backdrop, por el mismo motivo que el popup del médico. */}
    {confirmando && visit && (
      <ConfirmarAvance
        visit={visit}
        busy={busy}
        onCancel={() => setConfirmando(null)}
        onConfirmar={() => ejecutar(confirmando)}
      />
    )}

    {outcomeFor && (outcomeFor.role === 'screening' || outcomeFor.role === 'randomizacion') && (
      <ReadyOutcomeModal
        role={outcomeFor.role}
        accentSolid={accent}
        onClose={() => setOutcomeFor(null)}
        onConfirm={async (opts) => {
          const res = await markReadyWithOutcome(outcomeFor.id, opts)
          if (!res.error) refrescar()
          return res
        }}
        onReschedule={() => { setOutcomeFor(null); setRecitar(outcomeFor) }}
        onDiscontinue={async () => {
          const res = await discontinueEnrollment(outcomeFor.enrollment_id)
          if (!res.error) refrescar()
          return res
        }}
      />
    )}

    {recitar && (
      <RegisterVisitFlow
        enrollmentId={recitar.enrollment_id}
        protocolId={recitar.protocol_id}
        randomizationDate={recitar.enrollment_randomization_date}
        usedKinds={[]}
        preselectDefId={recitar.visit_def_id}
        accentSolid={accent}
        onClose={() => setRecitar(null)}
        onDone={() => { setRecitar(null); refrescar() }}
      />
    )}
    </>
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
