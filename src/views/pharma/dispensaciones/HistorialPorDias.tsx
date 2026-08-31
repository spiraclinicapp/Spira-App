import type { CSSProperties } from 'react'
import { btnOutline } from '../../../components/buttons'
import { PatientLink, PatientLinkArrow } from '../../../components/PatientLink'
import type { DispensationRequestRow } from '../../../data/pharma'
import { activeDispensation, totalUnits } from '../../../data/pharma'
import { badgeOf } from './estados'
import { dayGroupLabel, fromNow } from '../../../lib/dates'

/**
 * Historial agrupado por día (vista 2 del handoff). A diferencia del tablero, acá el orden es
 * cronológico y no por estado: la pregunta que responde es "qué pasó", no "qué falta hacer".
 *
 * Se agrupa por `updated_at` y no por `created_at`: una solicitud de ayer entregada hoy pertenece
 * al día en que se trabajó, que es lo que la farmacéutica busca cuando revisa la jornada.
 *
 * Paginado de verdad (`hasMore` + "Cargar más"): la versión vieja de esta pantalla traía todo el
 * histórico sin límite.
 */
export function HistorialPorDias({ rows, hasMore, loading, onOpen, onOpenPatient, onMore }: {
  rows: DispensationRequestRow[]
  hasMore: boolean
  loading: boolean
  onOpen: (r: DispensationRequestRow) => void
  onOpenPatient?: (r: DispensationRequestRow) => (() => void) | undefined
  onMore: () => void
}) {
  const grupos = agruparPorDia(rows)

  return (
    <div style={wrap}>
      {grupos.map((g) => (
        <section key={g.dia} style={{ marginBottom: 22 }}>
          <header style={cabecera}>
            <span className="spira-eyebrow">{g.dia}</span>
            <span style={linea} />
            <span className="spira-mono" style={contador}>{g.filas.length}</span>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {g.filas.map((r) => <Fila key={r.id} r={r} onOpen={() => onOpen(r)} onOpenPatient={onOpenPatient?.(r)} />)}
          </div>
        </section>
      ))}

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
          <button type="button" onClick={onMore} disabled={loading} style={{ ...btnOutline, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  )
}

function Fila({ r, onOpen, onOpenPatient }: { r: DispensationRequestRow; onOpen: () => void; onOpenPatient?: () => void }) {
  const disp = activeDispensation(r)
  const meta = badgeOf(r)
  const meds = r.items.map((i) => i.medication?.name ?? 'Medicamento').join(', ')
  /* El nombre está siempre que hay paciente (el tipo lo garantiza); el IVRS puede faltar — y ahí
     el placeholder va AFUERA del link: un guion no es un destino clickeable. */
  const patient = r.enrollment?.patient

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        // Solo si el evento nació en la fila misma: sin esta guarda, Enter sobre el link del
        // paciente dispara SU acción y además abre el cajón.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      style={fila}
      aria-label={`${disp?.dispensation_code ?? 'Solicitud'}, ${meta.label}`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="spira-link-group" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--spira-font-display)', fontSize: 15, fontWeight: 700, color: 'var(--spira-ink)' }}>
            {disp?.dispensation_code ?? 'Solicitud'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--spira-ink)' }}>
            · <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha de ${patient?.full_name ?? 'este paciente'}`}>
                {patient?.full_name ?? '—'}
              </PatientLink>
          </span>
          <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>
            {patient?.code
              ? <PatientLink onOpen={onOpenPatient} label={`Abrir la ficha del sujeto ${patient.code}`}>{patient.code}</PatientLink>
              : 'Sin IVRS'}
          </span>
          {onOpenPatient && <PatientLinkArrow />}
          <span className="spira-mono" style={chipProto}>{r.protocol?.code ?? '—'}</span>
        </div>
        <div style={linea2}>{meds} · {totalUnits(r)} u.</div>
      </div>

      <span style={{ ...badge, background: meta.tint, color: meta.color }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
        {meta.label}
      </span>

      <span style={{ fontSize: 11.5, color: 'var(--spira-muted)', minWidth: 64, textAlign: 'right' }}>
        {fromNow(r.updated_at)}
      </span>

      {/* Sin CTA acá: el historial es para mirar. Lo accionable vive en el tablero; si algo sigue
          pendiente, la fila abre el cajón igual. */}
      <span className="spira-mono" style={{ fontSize: 11.5, color: 'var(--spira-muted)', minWidth: 54, textAlign: 'right' }}>
        {disp ? `N° ${disp.correlative_number}` : ''}
      </span>
    </div>
  )
}

/** Agrupa por día calendario de `updated_at`, preservando el orden (más nuevo primero). */
function agruparPorDia(rows: DispensationRequestRow[]): { dia: string; filas: DispensationRequestRow[] }[] {
  const out: { dia: string; filas: DispensationRequestRow[] }[] = []
  for (const r of rows) {
    const iso = (r.updated_at ?? r.created_at).slice(0, 10)
    const etiqueta = dayGroupLabel(iso)
    const ultimo = out[out.length - 1]
    if (ultimo && ultimo.dia === etiqueta) ultimo.filas.push(r)
    else out.push({ dia: etiqueta, filas: [r] })
  }
  return out
}

const wrap: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }

const cabecera: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11,
}

const linea: CSSProperties = { flex: 1, height: 1, background: 'var(--spira-line)' }

const contador: CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--spira-muted)',
  background: 'var(--spira-surface)', borderRadius: 999, padding: '2px 9px',
}

const fila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px',
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)', borderRadius: 13,
  cursor: 'pointer', textAlign: 'left',
}

const linea2: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const chipProto: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
  background: 'rgba(15, 95, 87, 0.14)', color: 'var(--spira-acc-deep-track)',
}

const badge: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
  padding: '4px 10px', borderRadius: 999, flex: '0 0 auto',
}
