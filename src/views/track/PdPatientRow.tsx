import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PrivacyAvatar } from '../../components/PrivacyAvatar'
import type { PatientRow } from '../../data/patients'
import type { TrackVisitRow } from '../../data/visits'
import { prevCurrentNext, visitIndex } from '../../lib/visits'
import { formatShortAR } from '../../lib/dates'
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
  const { prev, current, next } = prevCurrentNext(visits)
  const medico = visits[0]?.treating_physician ?? '—'

  const cell = (v: typeof prev) => (v ? `V${idx.get(v.id)} · ${formatShortAR(v.estimated_date)}` : '—')

  const col = (label: string, value: string, isNow: boolean) => (
    <div style={{ minWidth: 88, textAlign: 'center' }}>
      <div style={{ ...microLabel, color: isNow ? accent : 'var(--spira-faint)' }}>{label}</div>
      <div className="spira-mono" style={{ fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', color: isNow ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: isNow ? 700 : 400 }}>{value}</div>
    </div>
  )
  const arrow = <Icon name="arrowRight" size={15} color={accent} style={{ flex: '0 0 auto', marginTop: 8 }} />

  return (
    <div
      style={{
        border: `1px solid ${open ? accent + '55' : 'var(--spira-line)'}`, borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 10, boxShadow: open ? `0 8px 22px ${accent}14` : 'none', transition: 'border-color .15s, box-shadow .15s',
      }}
    >
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer', padding: '13px 16px' }}>
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
          {/* tracker */}
          {visits.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {col('Anterior', cell(prev), false)}{arrow}{col('Actualidad', cell(current), true)}{arrow}{col('Próxima', cell(next), false)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--spira-faint)' }}>Sin esquema de visitas</div>
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
            <Icon name="chevronDown" size={17} color={open ? accent : 'var(--spira-muted)'} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s, color .15s', flex: '0 0 auto' }} />
          </div>
        </div>
      </div>
      {open && visits.length > 0 && (
        <div style={{ padding: '6px 16px 16px 70px' }}>
          <PdVisitFlow visits={visits} currentId={current?.id ?? null} accent={accent} />
        </div>
      )}
    </div>
  )
}
