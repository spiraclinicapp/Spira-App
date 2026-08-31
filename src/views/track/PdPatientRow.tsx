import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { PatientLink } from '../../components/PatientLink'
import type { PatientRow } from '../../data/patients'
import type { TrackVisitRow } from '../../data/visits'
import { orderVisits, todaySplit, visitIndex, visitCode } from '../../lib/visits'
import { formatDayMonth, todayISO } from '../../lib/dates'
import { PdVisitFlow } from './PdVisitFlow'

const microLabel: CSSProperties = { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }

/**
 * Fila de paciente del Detalle de Protocolo. Plegada: identidad (nombre + IVRS + médico) +
 * tracker Anterior→Actualidad→Próxima + botón "Resumen". Click en la fila abre la FICHA del
 * paciente —el destino de la tarjeta es el paciente, que es lo que la tarjeta muestra—; el
 * botón "Resumen" despliega el tracker horizontal completo sin salir de la lista
 * (stopPropagation). El nombre y el IVRS van además como `.spira-textlink`: la fila entera es un
 * `<div>` con `onClick` (no un `button`, para no anidar el de "Resumen" adentro), así que el par
 * nombre/IVRS es la puerta a la ficha que sí alcanza el teclado.
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
  const [hovered, setHovered] = useState(false)
  const idx = visitIndex(visits)
  /* "Hoy" en la línea de tiempo: anterior, hoy, próxima. */
  const today = todayISO()
  const { prev: prevByDate, next, todayVisit } = todaySplit(visits, today)
  /* "Anterior" = la visita inmediatamente anterior a la de hoy en la SECUENCIA, aunque sea del
     mismo día (p. ej. screening + run-in el mismo día: la anterior es la previa, no "—"). Si hoy
     no hay visita, la última con fecha pasada (lo que da todaySplit). */
  const ordered = orderVisits(visits)
  const todayIdx = todayVisit ? ordered.findIndex((v) => v.id === todayVisit.id) : -1
  const prev = todayIdx > 0 ? (ordered[todayIdx - 1] ?? null) : prevByDate
  const flowCurrentId = todayVisit?.id ?? next?.id ?? prev?.id ?? null
  const medico = patient.treating_physician ?? '—'
  /* La fila solo se despliega si hay algo que trackear; sin visitas no hay tracker que mostrar. */
  const expandable = visits.length > 0

  /* Etiqueta de la celda del tracker: V# para las programadas; el tipo (Scr/Firma/Rando…) para
     las sueltas. La fecha sale de la estimada (programadas) o la real (sueltas). */
  const cell = (v: typeof prev) => {
    if (!v) return '—'
    const label = visitCode(v, idx.get(v.id))
    const fecha = v.estimated_date ?? v.real_date
    return fecha ? `${label} · ${formatDayMonth(fecha)}` : label
  }

  const col = (label: string, value: string, isNow: boolean) => (
    <div style={{ minWidth: 88, textAlign: 'center' }}>
      <div style={{ ...microLabel, color: isNow ? accent : 'var(--spira-muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--spira-font-text)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, marginTop: 3, whiteSpace: 'nowrap', color: isNow ? 'var(--spira-ink)' : 'var(--spira-muted)', fontWeight: isNow ? 700 : 400 }}>{value}</div>
    </div>
  )
  const arrow = <Icon name="arrowRight" size={15} color={accent} style={{ flex: '0 0 auto', marginTop: 8 }} />

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered || open ? 'var(--spira-line-2)' : 'var(--spira-line)'}`, borderRadius: 14, background: 'var(--spira-white)',
        marginBottom: 10, boxShadow: hovered || open ? 'var(--spira-shadow-md)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow .15s ease, border-color .15s ease, transform .15s ease',
      }}
    >
      <div onClick={() => onOpen(patient.id)} style={{ cursor: 'pointer', padding: '13px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
          {/* identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {/* Nombre e IVRS abren los dos la ficha —el mismo par que el encabezado de la visita—,
                así que van en un `.spira-link-group` y se subrayan juntos al apuntar cualquiera.

                SIN flecha, a diferencia de las otras catorce pantallas (Director, 2026-08-25):
                acá la fila ENTERA ya abre la ficha, así que una marca de "esto lleva a otro lado"
                no distingue nada —todo lleva al mismo lado— y solo suma ruido. Es el mismo
                criterio por el que la flecha no va en la esquina de una tarjeta: habla del
                DESTINO, y donde el destino es único no hay nada que anunciar. En Visitas o
                Alertas sí va, porque ahí la fila abre la VISITA y el nombre abre otra cosa. */}
            <div className="spira-link-group" style={{ minWidth: 0 }}>
              <div style={{ maxWidth: '100%', fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha de ${patient.full_name}`}>
                  {patient.full_name}
                </PatientLink>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 2 }}>
                <span className="spira-mono" style={{ fontSize: 13, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>
                  {patient.code
                    ? <PatientLink onOpen={() => onOpen(patient.id)} label={`Abrir la ficha del sujeto ${patient.code}`}>{patient.code}</PatientLink>
                    : 'Sin IVRS'}
                </span>
                {protocolCode && (
                  <span className="spira-mono" style={{ fontSize: 11.5, padding: '1px 8px', borderRadius: 'var(--spira-radius-pill)', background: accent + '14', color: accent, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{protocolCode}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{medico}</div>
            </div>
          </div>
          {/* tracker Anterior → Actualidad → Próxima sobre la línea de tiempo (sueltas + cronograma).
              "Actualidad" es la fecha de hoy; el detalle "a medio llenar" vive en el flow desplegado. */}
          {expandable ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              {col('Anterior', cell(prev), false)}{arrow}
              {col('Actualidad', todayVisit ? cell(todayVisit) : formatDayMonth(today), true)}{arrow}
              {col('Próxima', cell(next), false)}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--spira-muted)' }}>Sin visitas registradas</div>
          )}
          {/* acción: solo el desplegable del recorrido. Abrir la ficha es el gesto de la fila
              entera (el `onClick` de arriba), así que no lleva botón propio. Sin visitas no hay
              resumen que desplegar y el botón directamente no está — la fila igual abre la ficha. */}
          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 10 }}>
            {expandable && (
              <button
                type="button"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
                title={open ? 'Ocultar el recorrido de visitas' : 'Ver el recorrido de visitas'}
                onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = 'var(--spira-on-accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = accent + '10'; e.currentTarget.style.color = accent }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 8,
                  border: `1px solid ${accent}59`, background: accent + '10', color: accent, cursor: 'pointer',
                  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', transition: 'background .14s, color .14s',
                }}
              >
                Resumen
                <Icon name="chevronDown" size={15} color="currentColor" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
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
