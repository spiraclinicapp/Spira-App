import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { EmptyState } from '../components/EmptyState'
import { PrivacyAvatar } from '../components/PrivacyAvatar'
import { useAuth } from '../lib/auth'
import { useVisitsForDay } from '../data/dayVisits'
import { useVisitAlerts } from '../data/visits'
import type { VisitType } from '../data/visits'
import { useReceptions } from '../data/pharma'
import { visitTitle } from '../lib/visits'
import { todayISO } from '../lib/dates'
import { MODULES } from '../modules/registry'
import { VISIT_STATES, OperationalStageChip } from './visitStates'
import type { ViewProps } from './types'

const display = 'var(--spira-font-display)'
const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const cardTitle: CSSProperties = { fontFamily: display, fontWeight: 700, fontSize: 16 }
const verLink: CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-primary)',
}
const btnOutline: CSSProperties = {
  height: 38, padding: '0 15px', border: '1px solid var(--spira-line-2)', borderRadius: 10,
  background: 'var(--spira-white)', color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
}
const TIPO_LABEL: Record<VisitType, string> = { presencial: 'Presencial', telefonica: 'Telefónica' }

/**
 * Home del módulo Inicio: saludo + tarjetas de módulos + "Lo prioritario" (alertas) + "Tu día"
 * (visitas de hoy, sin hora). Reusa los datos reales de Track y Pharma (no fabrica datos que el
 * schema no tiene: turno/centro, tareas, Lab/Contable). Sigue el patrón de TrackResumenView (loading/error).
 */
export function InicioResumenView({ module, submodule, onNavigate }: ViewProps) {
  const accent = module.accent
  const { modules: userModules } = useAuth()
  const day = useVisitsForDay(todayISO())
  const alertsQ = useVisitAlerts()
  /* Pharma está operativo (v0.8+): su tarjeta muestra la cola de verificación, no "Próximamente".
     Para quien no tiene el módulo, RLS devuelve vacío en silencio (y la tarjeta ni se pinta). */
  const recepQ = useReceptions(null, null)

  if (day.loading || alertsQ.loading || recepQ.loading) {
    return <EmptyState accent={accent} icon={submodule.icon} title="Cargando tu inicio…" description="Un momento." />
  }
  if (day.error || alertsQ.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-danger)', background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px' }}>
          <Icon name="alertCircle" size={18} color="var(--spira-danger)" />
          No pudimos cargar tu inicio. Probá de nuevo.
        </div>
        <button onClick={() => { day.refetch(); alertsQ.refetch() }} style={{ ...btnOutline, alignSelf: 'flex-start' }}>
          Reintentar
        </button>
      </div>
    )
  }

  const visits = day.data ?? []
  const alerts = alertsQ.data ?? []
  /* "Lo prioritario": las CRÍTICAS (ventana vencida) primero, después los ítems vencidos (sort
     estable → preserva el orden por fecha de useVisitAlerts dentro de cada grupo); luego las 5. */
  const priorityAlerts = [...alerts].sort(
    (a, b) => (a.computed_status === 'ventana_vencida' ? 0 : 1) - (b.computed_status === 'ventana_vencida' ? 0 : 1),
  )
  /* "Tu día" por orden de llegada: las que YA llegaron primero (arrived_at asc) y las pendientes
     (sin arrived_at) al final — mismo criterio que la cola del médico (nullsFirst:false). Sin hora. */
  const dayRows = [...visits].sort((a, b) => {
    const aa = a.arrived_at
    const bb = b.arrived_at
    if (aa && bb && aa !== bb) return aa.localeCompare(bb)
    if (!aa && bb) return 1
    if (aa && !bb) return -1
    return (a.patient_code ?? '').localeCompare(b.patient_code ?? '')
  })
  const moduleCards = MODULES.filter((m) => m.key !== 'inicio')
  /* Cola de verificación de Pharma (recepciones en 'pendiente'). null → sin dato (query falló):
     la tarjeta se pinta sin bajada antes que mentir con "Próximamente". */
  const pharmaPendientes = recepQ.data ? recepQ.data.filter((r) => r.status === 'pendiente').length : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── tus módulos ── */}
      <div>
        <div style={cardTitle}>Tus módulos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 12 }}>
          {moduleCards.map((m) => {
            const accessible = (userModules as string[]).includes(m.key)
            /* Módulo aún no construido: tarjeta SELLADA. Sin texto a la vista —solo un
               candado centrado sobre placa, en la superficie apagada— para que no compita
               con los módulos operativos ni prometa de más. El nombre sigue disponible en
               `title` (hover) y en texto oculto para lectores de pantalla: bloqueado a la
               vista, no para la accesibilidad. La altura la empareja el grid (stretch). */
            if (m.proximamente) {
              return (
                <div
                  key={m.key}
                  title={`${m.full} · Próximamente`}
                  style={{
                    position: 'relative', minHeight: 116, borderRadius: 14,
                    border: '1px solid var(--spira-line)', background: 'var(--spira-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--spira-line)', display: 'grid', placeItems: 'center' }}>
                    <Icon name="lock" size={22} stroke={2} color="var(--spira-muted)" />
                  </span>
                  <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 }}>
                    {m.full} · Próximamente
                  </span>
                </div>
              )
            }
            if (accessible) {
              return (
                <button
                  key={m.key}
                  onClick={() => onNavigate?.(m.key, m.submodules[0].key)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = m.accent; e.currentTarget.style.boxShadow = 'var(--spira-shadow-md)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--spira-line)'; e.currentTarget.style.boxShadow = 'none' }}
                  style={{
                    textAlign: 'left', border: '1px solid var(--spira-line)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                    background: 'var(--spira-white)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--spira-font-text)',
                    transition: 'border-color .15s ease, box-shadow .15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, background: m.accent + '16', display: 'grid', placeItems: 'center' }}>
                      <Icon name={m.icon} size={20} color={m.accent} stroke={2} />
                    </span>
                    <Icon name="arrowRight" size={16} color="var(--spira-faint)" />
                  </div>
                  <div style={{ fontFamily: display, fontWeight: 700, fontSize: 15.5, marginTop: 12, color: 'var(--spira-ink)' }}>{m.full}</div>
                  {m.key === 'track' ? (
                    <div style={{ fontSize: 13, marginTop: 4, color: m.accent, fontWeight: 600 }}>
                      {visits.length} {visits.length === 1 ? 'visita hoy' : 'visitas hoy'}
                    </div>
                  ) : (
                    m.key === 'pharma' && pharmaPendientes !== null && (
                      <div style={{ fontSize: 13, marginTop: 4, color: m.accent, fontWeight: 600 }}>
                        {pharmaPendientes} {pharmaPendientes === 1 ? 'recepción por verificar' : 'recepciones por verificar'}
                      </div>
                    )
                  )}
                </button>
              )
            }
            return (
              <div
                key={m.key}
                style={{
                  border: '1px solid var(--spira-line)', borderRadius: 14, padding: '16px 18px',
                  background: 'var(--spira-surface)', display: 'flex', flexDirection: 'column',
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--spira-line)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="lock" size={18} color="var(--spira-faint)" />
                </span>
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 15.5, marginTop: 12, color: 'var(--spira-muted)' }}>{m.full}</div>
                <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', marginTop: 4 }}>Sin acceso</div>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="spira-no-press"
                  title="El alta de acceso llega con el módulo de roles"
                  style={{ marginTop: 12, alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-faint)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, cursor: 'default' }}
                >
                  Solicitar acceso
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── lo prioritario + tu día ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Tu día (visitas de hoy, sin hora) — primero (lo accionable del día) */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardTitle}>Tu día</span>
            {dayRows.length > 0 && (
              <button style={verLink} onClick={() => onNavigate?.('track', 'visitas')}>Ver agenda</button>
            )}
          </div>
          {dayRows.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              <Icon name="calendar" size={16} color="var(--spira-faint)" />
              No hay visitas hoy.
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {dayRows.map((v) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderTop: '1px solid var(--spira-line)' }}>
                  <PrivacyAvatar fullName={v.patient_name} size={28} color={accent} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span className="spira-mono">{v.patient_code ?? '—'}</span>
                      <span style={{ color: 'var(--spira-faint)', fontWeight: 400 }}> · <span className="spira-mono">{v.protocol_code}</span></span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {visitTitle(v)}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--spira-muted)', whiteSpace: 'nowrap' }}>{TIPO_LABEL[v.visit_type]}</span>
                  <OperationalStageChip stage={v.operational_stage} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lo prioritario (alertas) — segundo */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardTitle}>Lo prioritario</span>
            {alerts.length > 0 && (
              <button style={verLink} onClick={() => onNavigate?.('track', 'alertas')}>Ver todo</button>
            )}
          </div>
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              <Icon name="check" size={16} color="var(--spira-good)" />
              Sin alertas. Todo al día.
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {priorityAlerts.slice(0, 5).map((a) => {
                const c = VISIT_STATES[a.computed_status].color
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 11, padding: '11px 0', borderTop: '1px solid var(--spira-line)' }}>
                    <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={17} color={c} style={{ flex: '0 0 auto', marginTop: 1 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {VISIT_STATES[a.computed_status].label} · {visitTitle(a)}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                        <span className="spira-mono">{a.patient_code ?? '—'}</span>
                        <span style={{ color: 'var(--spira-faint)' }}> · <span className="spira-mono">{a.protocol_code}</span></span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
