import type { CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { btnOutline } from '../components/buttons'
import { EmptyState } from '../components/EmptyState'
import { useAuth } from '../lib/auth'
import { useVisitsForDay } from '../data/dayVisits'
import { useActiveAlerts } from '../data/alertDismissals'
import { useReceptions } from '../data/pharma'
import { visitTitle } from '../lib/visits'
import { todayISO } from '../lib/dates'
import { MODULES } from '../modules/registry'
import { VISIT_STATES, OperationalStageChip } from './visitStates'
import { VisitSummaryRow } from './VisitSummaryRow'
import { alertItemStyle } from './alertItem'
import { ordenarDia, priorizarAlertas } from './visitRules'
import type { ViewProps } from './types'

const display = 'var(--spira-font-display)'
const card: CSSProperties = {
  background: 'var(--spira-white)', border: '1px solid var(--spira-line)',
  borderRadius: 'var(--spira-radius-lg)', padding: '18px 20px',
}
const cardTitle: CSSProperties = { fontFamily: display, fontWeight: 700, fontSize: 16 }
/* "Ver visitas del día" / "Ver todo": el atajo del encabezado a la LISTA completa. Las filas de abajo
   llevan cada una a su ítem puntual, así que esto es la salida al listado, no el destino
   principal. Se muestra siempre —incluso con la tarjeta vacía— porque la lista existe igual. */
const verLink: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-primary)',
}

/**
 * Home del módulo Inicio: saludo + tarjetas de módulos + "Lo prioritario" (alertas) + "Tu día"
 * (visitas de hoy, sin hora). Reusa los datos reales de Track y Pharma (no fabrica datos que el
 * schema no tiene: turno/centro, tareas, Lab/Contable). Sigue el patrón de TrackResumenView (loading/error).
 */
export function InicioResumenView({ module, submodule, onNavigate }: ViewProps) {
  const accent = module.accent
  const { modules: userModules } = useAuth()
  const day = useVisitsForDay(todayISO())
  /* Alertas VIGENTES: las mismas que ve la campana y la vista de Alertas, ya sin las
     descartadas (0070). El filtro vive una sola vez, en useActiveAlerts. */
  const alertsQ = useActiveAlerts()
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
  const alerts = alertsQ.visitAlerts
  /* "Lo prioritario": las CRÍTICAS (ventana vencida) primero; dentro de cada grupo se conserva
     el orden por fecha que trajo la consulta. La regla vive en visitRules y está testeada. */
  const priorityAlerts = priorizarAlertas(alerts)
  /* "Tu día" por orden de llegada: las que YA llegaron primero y las pendientes al final —
     mismo criterio que la cola del médico. La regla vive en visitRules y está testeada. */
  const dayRows = ordenarDia(visits)
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
                  className="spira-card-link"
                  onClick={() => onNavigate?.(m.key, m.submodules[0].key)}
                  style={{
                    textAlign: 'left', borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                    background: 'var(--spira-white)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--spira-font-text)',
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
        {/* Tu día (visitas de hoy, sin hora) — primero (lo accionable del día). Cada fila abre SU
            visita; el rótulo del encabezado queda para ir a la lista completa. */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardTitle}>Tu día</span>
            {/* Dice a dónde va DE VERDAD: navega a track/visitas, no a la Agenda (que además
                está fuera del menú). El rótulo "Ver agenda" quedó de cuando ese link iba ahí. */}
            <button type="button" style={verLink} onClick={() => onNavigate?.('track', 'visitas')}>
              Ver visitas del día
              <Icon name="arrowRight" size={14} color="var(--spira-primary)" />
            </button>
          </div>
          {dayRows.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              <Icon name="calendar" size={16} color="var(--spira-faint)" />
              No hay visitas hoy.
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {dayRows.map((v) => (
                <VisitSummaryRow
                  key={v.id}
                  visit={v}
                  accent={accent}
                  /* Eje OPERATIVO: en la portada se mira el recorrido del paciente por el
                     centro HOY. `compact` no es un lujo, son ~34 px que la columna no tiene. */
                  chip={<OperationalStageChip stage={v.operational_stage} compact />}
                  onClick={() => onNavigate?.('track', 'visitas', { visitId: v.id, visitDate: todayISO() })}
                  ariaLabel={`Abrir la visita de ${v.patient_name} — ${visitTitle(v)}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Lo prioritario (alertas) — segundo. Cada alerta lleva a Alertas y abre ahí su visita:
            el detalle se mira sin salir del módulo donde se trabaja la alerta. */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={cardTitle}>Lo prioritario</span>
            <button type="button" style={verLink} onClick={() => onNavigate?.('track', 'alertas')}>
              Ver todo
              <Icon name="arrowRight" size={14} color="var(--spira-primary)" />
            </button>
          </div>
          {alerts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--spira-muted)', padding: '14px 0 4px' }}>
              <Icon name="check" size={16} color="var(--spira-good)" />
              Sin alertas. Todo al día.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {priorityAlerts.slice(0, 5).map((a) => {
                const c = VISIT_STATES[a.computed_status].color
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="spira-card-link"
                    /* A Alertas, no a Visitas: la alerta se trabaja en su módulo, y el modal de
                       la visita se abre ahí adentro. Sin fecha — esa vista carga todas. */
                    onClick={() => onNavigate?.('track', 'alertas', { visitId: a.id })}
                    aria-label={`Abrir en Alertas la visita de ${a.patient_name} — ${VISIT_STATES[a.computed_status].label}`}
                    style={alertItemStyle(c)}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 1 }}>
                      <Icon name={a.computed_status === 'ventana_vencida' ? 'alertCircle' : 'clock'} size={18} color={c} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.patient_name}</span>
                        <span className="spira-mono" style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontWeight: 400 }}>{a.patient_code ?? '—'}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {VISIT_STATES[a.computed_status].label} · {visitTitle(a)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
