import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import type { PatientRow } from '../../data/patients'
import type { TrackVisitRow } from '../../data/visits'
import { KIND_SHORT } from '../../data/visitEvents'
import { todaySplit, visitIndex } from '../../lib/visits'
import { formatShortAR, todayISO } from '../../lib/dates'
import { PdVisitFlow } from './PdVisitFlow'

const microLabel: CSSProperties = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }

/**
 * Fila de paciente del Detalle de Protocolo. Plegada: identidad (avatar privacidad +
 * código + médico) + tracker Anterior→Actualidad→Próxima + "Abrir ficha". Click en la
 * fila despliega el tracker horizontal completo; "Abrir ficha" navega (stopPropagation).
 */
export function PdPatientRow({ patient, visits, accent, protocolCode, onOpen }: {
  patient: PatientRow
  visits: TrackVisitRow[]
  accent: string
  /** Código del protocolo, opcional: se muestra como chip junto al IVRS en listas
   * cruza-protocolos (Todos los pacientes). El tablero de un protocolo lo omite. */
  protocolCode?: string
  onOpen: (patientId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const idx = visitIndex(visits)
  /* "Hoy" en la línea de tiempo: anterior (última visita pasada), hoy, próxima (siguiente). */
  const today = todayISO()
  const { prev, next, todayVisit } = todaySplit(visits, today)
  const flowCurrentId = todayVisit?.id ?? next?.id ?? prev?.id ?? null
  const medico = patient.treating_physician ?? '—'
  /* La fila solo se despliega si hay algo que trackear; sin visitas no hay tracker que mostrar. */
  const expandable = visits.length > 0

  /* Etiqueta de la celda del tracker: V# para las programadas; el tipo (Scr/Firma/Rando…) para
     las sueltas. La fecha sale de la estimada (programadas) o la real (sueltas). */
  const cell = (v: typeof prev) => {
    if (!v) return '—'
    const n = idx.get(v.id)
    const label = n != null ? `V${n}` : KIND_SHORT[v.kind]
    const fecha = v.estimated_date ?? v.real_date
    return fecha ? `${label} · ${formatShortAR(fecha)}` : label
  }

  const col = (label: string, value: string, isNow: boolean) => (
    <div style={{ minWidth: 88, textAlign: 'center' }}>
      <div style={{ ...microLabel, color: isNow ? accent : 'var(--spira-faint)' }}>{label}</div>
      <div className="spira-mono" style={{ fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', color: isNow ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: isNow ? 700 : 400 }}>{value}</div>
    </div>
  )
  /* Conector entre columnas: lleno (accent) hasta "Hoy", vacío después → la línea queda a medio
     llenar cuando hoy cae entre dos visitas. */
  const conn = (filled: boolean) => (
    <div style={{ width: 26, height: 3, marginTop: 9, borderRadius: 2, background: filled ? accent : 'var(--spira-line-2)', flex: '0 0 auto' }} />
  )

  return (
    <div
      style={{
        border: `1px solid ${open ? accent + '55' : 'var(--spira-line)'}`, borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 10, boxShadow: open ? `0 8px 22px ${accent}14` : 'none', transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div onClick={() => { if (expandable) setOpen((o) => !o) }} style={{ cursor: expandable ? 'pointer' : 'default', padding: '13px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
          {/* identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <PrivacyAvatar fullName={patient.full_name} size={40} color={accent} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="spira-mono" style={{ fontSize: 14.5, fontWeight: 500, color: patient.code ? 'var(--spira-ink)' : 'var(--spira-faint)', whiteSpace: 'nowrap' }}>{patient.code ?? 'Sin IVRS'}</span>
                {protocolCode && (
                  <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{protocolCode}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{medico}</div>
            </div>
          </div>
          {/* tracker Anterior · Hoy · Próxima sobre la línea de tiempo completa (sueltas + cronograma).
              "Hoy" es la fecha actual; el conector queda lleno hasta hoy y vacío después. */}
          {expandable ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {col('Anterior', cell(prev), false)}{conn(prev !== null)}
              {col('Hoy', todayVisit ? cell(todayVisit) : formatShortAR(today), true)}{conn(false)}
              {col('Próxima', cell(next), false)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>Sin visitas registradas</div>
          )}
          {/* acción */}
          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(patient.id) }}
              onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = 'var(--spira-on-accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = accent + '10'; e.currentTarget.style.color = accent }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8,
                border: `1px solid ${accent}59`, background: accent + '10', color: accent, cursor: 'pointer',
                fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', transition: 'background .14s, color .14s',
              }}
            >
              Abrir ficha <Icon name="arrowRight" size={14} color="currentColor" />
            </button>
            {expandable && (
              <Icon name="chevronDown" size={17} color={open ? accent : 'var(--spira-muted)'} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s, color .15s', flex: '0 0 auto' }} />
            )}
          </div>
        </div>
      </div>
      {open && expandable && (
        <div style={{ padding: '6px 16px 16px 70px' }}>
          <PdVisitFlow visits={visits} currentId={flowCurrentId} accent={accent} />
        </div>
      )}
    </div>
  )
}
