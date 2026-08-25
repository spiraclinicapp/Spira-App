import { useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { PatientLink, PatientLinkArrow } from '../../components/PatientLink'
import { usePopover } from '../../components/usePopover'
import { visitCode } from '../../lib/visits'
import { KIND_LABELS } from '../../lib/visitLabels'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import type { DayProcedureSummary } from '../../data/procedures'
import { OperationalStageChip, OPERATIONAL_STAGES, VisitChip, VISIT_STATES } from '../visitStates'
import { ProtoTag, ProcDots, Persona, VisitCodeTag } from '../visitAtoms'
import { NEXT_STEP, advanceRole } from './advanceStep'
import { etapaProgreso } from './visitHeaderRules'

/**
 * Fila de "Visitas del día" v2 — layout `paciente` del handoff (`handoff_visitas_dia/`), rebindeada
 * al modelo real. La hora de cita NO existe en el schema → la columna izquierda muestra el chip de
 * ESTADO (decisión del Director). El nombre del paciente va de titular (desde 2026-08-04 se muestra
 * en toda la app, ver CLAUDE.md). Toda la fila abre el modal; los controles internos
 * cortan la propagación para no dispararlo. La columna derecha (médico · CTA · ⋯) es de ancho fijo:
 * queda alineada al pixel entre filas pase lo que pase con el estado.
 */
export function DayVisitRowItem({
  visit, accent, canReception, canClinical, busyId, procs,
  onAdvance, onOpenDoctor, onNoShow, onReschedule, onOpen, onOpenPatient,
}: {
  visit: DayVisitRow
  accent: string
  /** Recepción/Admin: puede marcar la llegada y "No vino". */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Inicio de atención / Fin de atención / médico. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  /** Resumen de procedimientos de la visita (del hook batch); undefined = sin procedimientos. */
  procs?: DayProcedureSummary
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onOpenDoctor: (visit: DayVisitRow) => void
  /** Marca (true) o deshace (false) "No vino". */
  onNoShow: (visit: DayVisitRow, value: boolean) => void
  onReschedule: (visit: DayVisitRow) => void
  onOpen: (visit: DayVisitRow) => void
  /** Abrir la ficha del paciente. Sin esto, nombre e IVRS quedan como texto (ver `PatientLink`). */
  onOpenPatient?: () => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const [hov, setHov] = useState(false)

  // El riel tiene que coincidir con el chip que se muestra (ver más abajo): si la visita está
  // "Por reprogramar" el chip es el CLÍNICO, así que el riel usa ese mismo color — mostrar riel
  // operativo (gris de "Por llegar") al lado de un chip marrón contradice al propio chip.
  const railColor = visit.computed_status === 'por_reprogramar'
    ? VISIT_STATES.por_reprogramar.color
    : OPERATIONAL_STAGES[stage]?.color ?? OPERATIONAL_STAGES.por_llegar.color
  // Mismo cálculo que llena el riel de la barra del modal: una sola fuente para "cuánto lleva
  // recorrido esta visita", así la lista y el detalle no pueden decir cosas distintas.
  const { pct } = etapaProgreso(stage)
  const visitName = visit.visit_name ?? KIND_LABELS[visit.kind]

  const shell: CSSProperties = {
    position: 'relative', background: 'var(--spira-white)', borderRadius: 14, cursor: 'pointer',
    border: `1px solid ${hov ? 'var(--spira-line-2)' : 'var(--spira-line)'}`,
    boxShadow: hov ? '0 6px 18px rgba(20,48,46,0.10)' : '0 1px 2px rgba(20,48,46,0.06)',
    transition: 'box-shadow .18s ease, border-color .18s ease',
    // Padding izquierdo igual al derecho: la barra de color a sangre que ocupaba esos 6px de más
    // se fue, y su trabajo lo hace ahora el riel de la columna de estado.
    overflow: 'hidden', padding: '12px 16px', marginBottom: 8,
    /* GRID y no flex: es una lista de columnas, y con flex cada fila resolvía sus anchos por el
       largo de SU contenido —la identidad medía lo que midiera su línea más ancha—, así que la
       visita caía en un x distinto en cada renglón. Quedaba casi alineada, que es peor que
       claramente desalineada: el ojo lee el temblor. Con anchos determinísticos, las cinco columnas
       coinciden entre filas por construcción y no por casualidad de que los nombres midan parecido.
       La identidad crece hasta 460px —antes se truncaba con 800px libres al lado, porque el
       sobrante del `flex: 1` se depositaba en un vacío muerto en el medio—, y el resto lo absorbe
       la columna de la visita, cuyo contenido va anclado al inicio (`justifySelf: start`): el chip
       queda pegado al paciente y el aire cae después, donde sí separa dos grupos distintos
       (quién y qué visita · quién lo atiende). */
    display: 'grid', gridTemplateColumns: '104px minmax(200px, 460px) 1fr 206px auto',
    alignItems: 'center', gap: 16,
  }

  return (
    <div
      style={shell}
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => { if (!busy) onOpen(visit) }}
      onKeyDown={(e) => {
        // Solo si el evento nació en la fila misma: sin esta guarda, Enter sobre un botón
        // interno dispara la acción Y abre el modal.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) onOpen(visit) }
      }}
    >
      {/* Columna izquierda: chip de estado (reemplaza la hora, que no existe en el schema) + el
          riel del recorrido debajo. El riel trae a la lista el idioma de la barra de acción del
          modal, y de paso agrega el dato que la fila no tenía: no solo CÓMO SE LLAMA la etapa,
          sino cuánto lleva recorrido. Reemplaza a la barra de color a sangre que estaba pegada al
          borde izquierdo — decía menos y pesaba más.
          Si la visita quedó "Por reprogramar" mandamos el chip CLÍNICO: operativamente sigue en
          "Por llegar", y dejar ese chip diría que el paciente está por llegar cuando ya se sabe
          que no viene. Se mira `computed_status` y no `no_show_at` porque la vista ya resuelve la
          precedencia (ventana vencida le gana a por reprogramar). */}
      <div>
        {visit.computed_status === 'por_reprogramar'
          ? <VisitChip status="por_reprogramar" compact />
          : <OperationalStageChip stage={stage} compact />}
        <div style={{ height: 3, borderRadius: 2, background: 'var(--spira-line-2)', marginTop: 7, overflow: 'hidden' }}>
          <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: railColor, borderRadius: 2 }} />
        </div>
      </div>

      {/* identidad — columna 2 */}
      <div className="spira-link-group" style={{ minWidth: 0 }}>
        {/* La flecha se para al COSTADO del par y centrada entre sus dos líneas, no colgando del
            IVRS: el nombre vive arriba y el número abajo, así que dentro de una de las dos se lee
            caída respecto de la otra —apuntás el nombre y la marca aparece un renglón más abajo—.
            Los procedimientos quedan FUERA de este flex a propósito: la flecha se centra contra la
            identidad, que es lo que abre, y no contra un bloque que crece con datos ajenos. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--spira-ink)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${visit.patient_name}`}>
                {visit.patient_name}
              </PatientLink>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
              <span className="spira-mono" style={{ fontSize: 12.5, color: visit.patient_code ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>
                {visit.patient_code
                  ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${visit.patient_code}`}>{visit.patient_code}</PatientLink>
                  : 'Sin IVRS'}
              </span>
            </div>
          </div>
          {onOpenPatient && <PatientLinkArrow />}
        </div>
        {procs && procs.names.length > 0 && (
          <div style={{ marginTop: 9 }}><ProcDots names={procs.names} accent={accent} /></div>
        )}
      </div>

      {/* visita — columna 3. Se lleva el sobrante de la fila, pero el contenido va anclado al
          INICIO: el chip queda pegado al paciente y el aire cae a su derecha, separando el grupo
          "quién y qué visita" del grupo "quién lo atiende".
          Visita y semana son UN dato en dos renglones ("V12" arriba, "W48" abajo), así que van
          apilados y centrados entre sí. Centrados y no alineados por la izquierda porque el chip
          tiene padding propio: pegados por el borde, el glifo del código arrancaría 9px más adentro
          que el de la semana. */}
      <div style={{ justifySelf: 'start', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <VisitCodeTag code={visitCode(visit)} />
        <span style={{ fontSize: 12.5, color: 'var(--spira-faint)', whiteSpace: 'nowrap' }}>{visitName}</span>
      </div>

      {/* responsables — columna 4 (ancho fijo, alineados a la derecha) */}
      <div style={{ width: 206, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, overflow: 'hidden' }}>
        <Persona role="Coord." name={visit.coordinator_name} icon="user" />
        <Persona role="Médico" name={visit.treating_physician} icon="users" />
      </div>

      {/* acciones — columna 5 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <DoctorButton visit={visit} accent={accent} canClinical={canClinical} busy={busy} onOpenDoctor={onOpenDoctor} />
        <AdvanceCTA stage={stage} accent={accent} canAdvance={advanceRole(stage) === 'reception' ? canReception : advanceRole(stage) === 'clinical' ? canClinical : false} busy={busy} onAdvance={(next) => onAdvance(visit, next)} />
        <RowMenu visit={visit} canReception={canReception} busy={busy} onNoShow={onNoShow} onReschedule={onReschedule} />
      </div>
    </div>
  )
}

/** Botón médico de 3 estados y ancho fijo (134). Abre el modal de derivación (motivo) del padre. */
function DoctorButton({ visit, accent, canClinical, busy, onOpenDoctor }: {
  visit: DayVisitRow
  accent: string
  canClinical: boolean
  busy: boolean
  onOpenDoctor: (visit: DayVisitRow) => void
}) {
  const base: CSSProperties = {
    width: 134, height: 40, flex: '0 0 auto', borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
  }
  if (visit.doctor_seen_at) {
    return (
      <div title="Atendido por el médico" style={{ ...base, background: '#5C8A5A22', color: 'var(--spira-good)', border: '1px solid transparent' }}>
        <Icon name="users" size={15} color="var(--spira-good)" /> Visto por médico
      </div>
    )
  }
  const eligible = canClinical && visit.operational_stage !== 'por_llegar' && visit.operational_stage !== 'fin_atencion'
  if (!eligible) return <div style={{ width: 134, flex: '0 0 auto' }} />
  const on = visit.wants_doctor
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!busy) onOpenDoctor(visit) }}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      title={on ? 'Ver / editar atención médica' : 'Marcar para ver médico'}
      style={{
        ...base, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        border: `1px solid ${on ? accent : 'var(--spira-line-2)'}`,
        background: on ? accent + '14' : 'var(--spira-white)', color: on ? accent : 'var(--spira-muted)',
      }}
    >
      <Icon name="users" size={15} color="currentColor" /> {on ? 'En cola' : 'Quiere médico'}
    </button>
  )
}

/**
 * CTA de avanzar etapa. Ancho fijo (150), relleno de marca, siempre a la derecha. 'fin_atencion'
 * muestra el estado terminal "Finalizada"; sin paso o sin permiso deja un hueco del mismo ancho
 * (conserva la alineación de la columna derecha en las demás filas). El desenlace de
 * screening/randomización lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
function AdvanceCTA({ stage, accent, canAdvance, busy, onAdvance }: {
  stage: OperationalStage
  accent: string
  canAdvance: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
}) {
  if (stage === 'fin_atencion') {
    return (
      <div style={{ width: 150, height: 40, borderRadius: 10, background: '#5C8A5A22', color: 'var(--spira-good)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, flex: '0 0 auto' }}>
        <Icon name="check" size={15} color="var(--spira-good)" /> Finalizada
      </div>
    )
  }
  const step = NEXT_STEP[stage]
  if (!step || !canAdvance) return <div style={{ width: 150, flex: '0 0 auto' }} />
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!busy) onAdvance(step.next) }}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      style={{
        width: 150, height: 40, borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
        background: accent, color: 'var(--spira-on-accent)', boxShadow: `0 2px 8px ${accent}3D`,
        fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: busy ? 0.6 : 1, flex: '0 0 auto',
      }}
    >
      {busy ? 'Guardando…' : step.label}
      <Icon name="arrowRight" size={14} color="var(--spira-on-accent)" />
    </button>
  )
}

/** Menú ⋯ de la fila: acciones que SÍ están cableadas (no vino · reprogramar · copiar N°). */
function RowMenu({ visit, canReception, busy, onNoShow, onReschedule }: {
  visit: DayVisitRow
  canReception: boolean
  busy: boolean
  /** Marca (true) o deshace (false) "No vino". */
  onNoShow: (visit: DayVisitRow, value: boolean) => void
  onReschedule: (visit: DayVisitRow) => void
}) {
  const [open, setOpen] = useState(false)
  // usePopover posiciona `fixed` (getBoundingClientRect) → el menú escapa al `overflow: hidden` de
  // la fila (que existe para recortar el rail). Sin esto el popover se abría CLIPADO por la fila y no
  // se veía. Maneja Esc + click-afuera. El menú se monta como descendiente en el árbol de React, así
  // que igual corta la propagación del click para no abrir el modal de la fila.
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  // Marcar la falta solo tiene sentido antes de que el paciente llegue; deshacerla, mientras siga
  // marcada. El server además rechaza marcar como ausente una visita ya atendida o con la llegada
  // ya marcada (migración 0067).
  const faltaMarcada = visit.no_show_at !== null
  const canNoShow = visit.operational_stage === 'por_llegar' && canReception
  // Mismo guard que sus hermanos AgendaView/PatientFichaView: no se reprograma algo que ya pasó.
  // `rescheduleVisit` es un update directo que solo toca `estimated_date` y no mira `real_date` ni
  // la etapa (ni la RLS, que solo verifica rol/protocolo) — sin este guard en la UI, reprogramar una
  // visita ya en `fin_atencion` deja una visita fantasma en la fecha nueva con `real_date` intacto.
  const canReschedule = canReception && visit.real_date === null

  return (
    <div style={{ flex: '0 0 auto' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onKeyDown={(e) => e.stopPropagation()}
        title="Más acciones"
        style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${open ? 'var(--spira-line-2)' : 'transparent'}`, background: open ? 'var(--spira-surface)' : 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--spira-faint)' }}
      >
        <Icon name="moreVertical" size={17} color="currentColor" />
      </button>
      {/* PORTALEADO a document.body: el menú es `position: fixed` con coordenadas de viewport y
          cualquier ancestro con `backdrop-filter`/`transform` pasaría a ser su bloque contenedor.
          Acá además la fila tiene `overflow: hidden` (recorta la barra a sangre), que ya había
          clipado este mismo menú una vez — el portal lo saca de los dos problemas de una. */}
      {open && pos && createPortal(
        <div
          ref={popRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60, width: 210, padding: 5, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 11, boxShadow: 'var(--spira-shadow-md)' }}
        >
          {canNoShow && !faltaMarcada && (
            <MenuItem label="Marcar como no vino" danger disabled={busy} onClick={() => { if (!busy) onNoShow(visit, true); setOpen(false) }} />
          )}
          {canNoShow && faltaMarcada && (
            <MenuItem label="Deshacer “no vino”" disabled={busy} onClick={() => { if (!busy) onNoShow(visit, false); setOpen(false) }} />
          )}
          {canReschedule && (
            <MenuItem label="Reprogramar" disabled={busy} onClick={() => { if (!busy) onReschedule(visit); setOpen(false) }} />
          )}
          <MenuItem
            label="Copiar N° de paciente"
            disabled={!visit.patient_code}
            onClick={() => { if (visit.patient_code) navigator.clipboard?.writeText(visit.patient_code); setOpen(false) }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

function MenuItem({ label, onClick, danger = false, disabled = false }: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick() }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent',
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontSize: 13, fontWeight: 500,
        color: disabled ? 'var(--spira-faint)' : danger ? 'var(--spira-danger)' : 'var(--spira-ink)',
      }}
    >
      {label}
    </button>
  )
}
