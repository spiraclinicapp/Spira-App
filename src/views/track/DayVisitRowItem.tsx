import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { usePopover } from '../../components/usePopover'
import { visitCode } from '../../lib/visits'
import { KIND_LABELS } from '../../lib/visitLabels'
import type { DayVisitRow, OperationalStage } from '../../data/dayVisits'
import type { DayProcedureSummary } from '../../data/procedures'
import { OperationalStageChip, OPERATIONAL_STAGES } from '../visitStates'
import { ProtoTag, ProcDots, Persona } from './visitAtoms'
import { NEXT_STEP, advanceRole } from './advanceStep'

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
  onAdvance, onOpenDoctor, onNoShow, onOpen,
}: {
  visit: DayVisitRow
  accent: string
  /** Recepción/Admin: puede marcar En el sitio / Fuera del sitio y "No vino". */
  canReception: boolean
  /** Clínico/Coord asignado a este protocolo: Atendido / Listo / médico. */
  canClinical: boolean
  /** id de la visita con mutación en vuelo (deshabilita sus controles). */
  busyId: string | null
  /** Resumen de procedimientos de la visita (del hook batch); undefined = sin procedimientos. */
  procs?: DayProcedureSummary
  onAdvance: (visit: DayVisitRow, next: OperationalStage) => void
  onOpenDoctor: (visit: DayVisitRow) => void
  onNoShow: (visit: DayVisitRow) => void
  onOpen: (visit: DayVisitRow) => void
}) {
  const stage = visit.operational_stage
  const busy = busyId === visit.id
  const [hov, setHov] = useState(false)

  const railColor = OPERATIONAL_STAGES[stage]?.color ?? OPERATIONAL_STAGES.por_llegar.color
  const visitName = visit.visit_name ?? KIND_LABELS[visit.kind]

  const shell: CSSProperties = {
    position: 'relative', background: 'var(--spira-white)', borderRadius: 14, cursor: 'pointer',
    border: `1px solid ${hov ? 'var(--spira-line-2)' : 'var(--spira-line)'}`,
    boxShadow: hov ? '0 6px 18px rgba(20,48,46,0.10)' : '0 1px 2px rgba(20,48,46,0.06)',
    transition: 'box-shadow .18s ease, border-color .18s ease',
    overflow: 'hidden', padding: '12px 16px 12px 22px', marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 16,
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
      {/* rail de estado */}
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: railColor }} />

      {/* columna izquierda: chip de estado (reemplaza la hora, que no existe en el schema) */}
      <div style={{ flex: '0 0 auto', width: 96 }}>
        <OperationalStageChip stage={stage} compact />
      </div>

      {/* bloque central */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--spira-font-display)', fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--spira-ink)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {visit.patient_name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <ProtoTag code={visit.protocol_code} protocolId={visit.protocol_id} />
          <span className="spira-mono" style={{ fontSize: 12.5, color: visit.patient_code ? 'var(--spira-muted)' : 'var(--spira-faint)' }}>
            {visit.patient_code ?? 'Sin IVRS'}
          </span>
          <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--spira-ink)', color: 'var(--spira-paper)', fontSize: 11.5, fontWeight: 800 }}>
            {visitCode(visit)}
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>{visitName}</span>
        </div>
        {procs && procs.names.length > 0 && (
          <div style={{ marginTop: 9 }}><ProcDots names={procs.names} accent={accent} /></div>
        )}
      </div>

      {/* responsables: coordinador + médico (ancho fijo, alineados a la derecha) */}
      <div style={{ flex: '0 0 auto', width: 206, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, overflow: 'hidden' }}>
        <Persona role="Coord." name={visit.coordinator_name} icon="user" />
        <Persona role="Médico" name={visit.treating_physician} icon="users" />
      </div>

      {/* acciones (ancho fijo) */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <DoctorButton visit={visit} accent={accent} canClinical={canClinical} busy={busy} onOpenDoctor={onOpenDoctor} />
        <AdvanceCTA stage={stage} accent={accent} canAdvance={advanceRole(stage) === 'reception' ? canReception : advanceRole(stage) === 'clinical' ? canClinical : false} busy={busy} onAdvance={(next) => onAdvance(visit, next)} />
        <RowMenu visit={visit} canReception={canReception} busy={busy} onNoShow={onNoShow} />
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
  const eligible = canClinical && visit.operational_stage !== 'por_llegar' && visit.operational_stage !== 'fuera'
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
 * CTA de avanzar etapa. Ancho fijo (150), relleno de marca, siempre a la derecha. 'fuera' muestra
 * el estado terminal "Finalizada"; sin paso o sin permiso deja un hueco del mismo ancho (conserva
 * la alineación de la columna derecha en las demás filas). El desenlace de screening/randomización
 * lo resuelve el padre en `onAdvance` (abre el cierre clínico).
 */
function AdvanceCTA({ stage, accent, canAdvance, busy, onAdvance }: {
  stage: OperationalStage
  accent: string
  canAdvance: boolean
  busy: boolean
  onAdvance: (next: OperationalStage) => void
}) {
  if (stage === 'fuera') {
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

/** Menú ⋯ de la fila: acciones que SÍ están cableadas (no vino → reprogramar · copiar N°). */
function RowMenu({ visit, canReception, busy, onNoShow }: {
  visit: DayVisitRow
  canReception: boolean
  busy: boolean
  onNoShow: (visit: DayVisitRow) => void
}) {
  const [open, setOpen] = useState(false)
  // usePopover posiciona `fixed` (getBoundingClientRect) → el menú escapa al `overflow: hidden` de
  // la fila (que existe para recortar el rail). Sin esto el popover se abría CLIPADO por la fila y no
  // se veía. Maneja Esc + click-afuera. El menú se monta como descendiente en el árbol de React, así
  // que igual corta la propagación del click para no abrir el modal de la fila.
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, () => setOpen(false))
  const canNoShow = visit.operational_stage === 'por_llegar' && canReception

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
      {open && pos && (
        <div
          ref={popRef}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60, width: 210, padding: 5, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 11, boxShadow: 'var(--spira-shadow-md)' }}
        >
          {canNoShow && (
            <MenuItem label="Marcar como no vino" danger onClick={() => { if (!busy) onNoShow(visit); setOpen(false) }} />
          )}
          <MenuItem
            label="Copiar N° de paciente"
            disabled={!visit.patient_code}
            onClick={() => { if (visit.patient_code) navigator.clipboard?.writeText(visit.patient_code); setOpen(false) }}
          />
        </div>
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
