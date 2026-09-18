import { useState } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/Icon'
import { EmptyState } from '../../components/EmptyState'
import { useAuth } from '../../lib/auth'
import { formatAR } from '../../lib/dates'
import { markFeedbackSeen, useFeedbackRecibido } from '../../data/feedback'
import type { FeedbackRow, FeedbackType } from '../../data/feedback'
import { alcanzable, destinoDelLugar, filtrarFeedback } from './bandeja'
import type { FiltroTipo, FiltroVisto } from './bandeja'
import { ACCENT, StCard, StSeg, btnGhost } from './primitives'

/* ============================================================================
   Feedback recibido — la bandeja de gerencia (entrega 2 del spec del 2026-09-17).

   Antes esto se leía entrando a Supabase: la tabla existe desde la 0044 y ninguna pantalla la
   mostraba. Cada renglón trae el mensaje, quién lo mandó, cuándo, Y DÓNDE ESTABA PARADO —que es el
   pedido que originó todo— con un salto a ese mismo lugar.

   ⚠️ LA RAMA DE PERMISO SE DECIDE CON `useAuth`, NO CONTANDO FILAS. La RLS de la 0044 deja ver el
   feedback sólo a gerencia y filtra EN SILENCIO: sin el módulo, la consulta devuelve cero filas y
   ningún error. Si esta pantalla dedujera "no vino nada, no hay feedback", alguien sin permiso —o un
   administrador con la migración sin aplicar— vería un vacío indistinguible de un sistema roto. Es
   el mismo criterio que documenta `EquipoYAccesosSection`.
   ============================================================================ */

const TIPOS: { v: FiltroTipo; l: string }[] = [
  { v: 'todos', l: 'Todos' },
  { v: 'problema', l: 'Problemas' },
  { v: 'sugerencia', l: 'Sugerencias' },
  { v: 'idea', l: 'Ideas' },
]
/* Arranca en «Pendientes»: la bandeja es para trabajar lo que llegó, y lo ya visto está a un clic. */
const VISTOS: { v: FiltroVisto; l: string }[] = [
  { v: 'pendientes', l: 'Pendientes' },
  { v: 'todos', l: 'Todos' },
]

/** Ícono y color por tipo. El color dice QUÉ ES, no decora: el problema en rojo, el resto neutro. */
const PINTA: Record<FeedbackType, { icon: IconName; color: string }> = {
  problema: { icon: 'alert', color: 'var(--spira-acc-deep-danger)' },
  sugerencia: { icon: 'message', color: 'var(--spira-muted)' },
  idea: { icon: 'heart', color: 'var(--spira-muted)' },
}

export function FeedbackSection({ onIrAlLugar }: {
  /** Navegar al lugar desde donde se reportó. Lo pasa el shell, que es el que sabe navegar. */
  onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void
}) {
  const { modules } = useAuth()
  const esGerencia = modules.includes('gerencia')
  const q = useFeedbackRecibido()
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [visto, setVisto] = useState<FiltroVisto>('pendientes')
  /** Errores de marcado, POR FILA: el de una no puede tapar la lista entera. */
  const [errores, setErrores] = useState<Record<string, string>>({})

  if (!esGerencia) {
    return (
      <EmptyState
        accent={ACCENT}
        icon="lock"
        title="Sin acceso"
        description="El feedback del equipo lo ve gerencia."
        minHeight={240}
      />
    )
  }

  const filas = filtrarFeedback(q.data ?? [], { tipo, visto })

  const marcar = async (f: FeedbackRow) => {
    const res = await markFeedbackSeen(f.id)
    if (res.error) {
      const msg = res.error
      setErrores((e) => ({ ...e, [f.id]: msg }))
      return
    }
    setErrores((e) => {
      const resto = { ...e }
      delete resto[f.id]
      return resto
    })
    q.refetch()
  }

  return (
    <StCard
      title="Feedback recibido"
      desc="Lo que manda el equipo desde «Dar feedback», con la pantalla en la que estaba."
      pad={false}
    >
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '13px 18px', borderBottom: '1px solid var(--spira-line)' }}>
        <StSeg options={TIPOS} value={tipo} onChange={setTipo} label="Filtrar por tipo" />
        <StSeg options={VISTOS} value={visto} onChange={setVisto} label="Filtrar por estado" />
      </div>

      {q.loading && !q.data && <div style={{ padding: 18, fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando…</div>}
      {q.error && <div style={{ padding: 18, fontSize: 13.5, color: 'var(--spira-acc-deep-danger)' }}>{q.error}</div>}

      {/* La lista vacía va LLANA y no con `EmptyState`: ése es una tarjeta propia de 320px, y adentro
          de ésta quedaba una tarjeta dentro de otra. */}
      {!q.loading && !q.error && filas.length === 0 && (
        <div style={{ padding: '26px 18px', textAlign: 'center', fontSize: 13.5, color: 'var(--spira-muted)' }}>
          {visto === 'pendientes' ? 'Nada pendiente: ya miraste todo lo que llegó.' : 'Todavía no mandaron feedback.'}
        </div>
      )}

      <FeedbackRenglones filas={filas} userModules={modules} errores={errores} onIrAlLugar={onIrAlLugar} onMarcar={marcar} />
    </StCard>
  )
}

/**
 * Los renglones de la bandeja, aparte de la sección: la sección trae los datos y decide el permiso,
 * esto sólo dibuja lo que recibe. La separación es la que deja montar el componente REAL con filas de
 * juguete en un banco de pruebas —sin sesión no hay datos, y sin gerencia la sección ni llega acá—.
 */
export function FeedbackRenglones({ filas, userModules, errores, onIrAlLugar, onMarcar }: {
  filas: FeedbackRow[]
  /** Los módulos de quien mira: deciden si «Ir al lugar» se puede dar (ver `alcanzable`). */
  userModules: readonly string[]
  /** Errores de marcado por id de feedback. */
  errores: Record<string, string>
  onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void
  onMarcar: (f: FeedbackRow) => void
}) {
  return (
    <>
      {filas.map((f, i) => {
        const d = destinoDelLugar(f.place_target)
        /* Sólo si se puede ir DE VERDAD: `navigate` sale en silencio sin acceso al módulo o con un
           submódulo que ya no existe, y el botón quedaría muerto (ver `alcanzable`). */
        const destino = d && alcanzable(d, userModules) ? d : null
        const pinta = PINTA[f.type]
        return (
          <div
            key={f.id}
            data-visto={f.seen_at ? 'true' : 'false'}
            style={{ display: 'flex', gap: 12, padding: '14px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--spira-line)', opacity: f.seen_at ? 0.6 : 1 }}
          >
            <Icon name={pinta.icon} size={17} color={pinta.color} style={{ flex: '0 0 auto', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--spira-ink)', lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.message}</div>
              {/* EL LUGAR, que es el punto de toda la feature. Sin él —feedback anterior a la 0129—
                  se muestra la ruta de siempre, para que el renglón nunca quede mudo. */}
              <div style={{ fontSize: 12, color: 'var(--spira-muted)', marginTop: 5 }}>
                {f.place_label ?? f.route ?? 'Sin lugar registrado'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--spira-muted)', marginTop: 3 }}>
                {f.reporter_name ?? 'Alguien del equipo'} · {formatAR(f.created_at.slice(0, 10))}
                {f.app_version ? ` · v${f.app_version}` : ''}
                {f.seen_at ? ' · visto' : ''}
              </div>
              {errores[f.id] && <div style={{ fontSize: 12, color: 'var(--spira-acc-deep-danger)', marginTop: 5 }}>{errores[f.id]}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto', alignItems: 'flex-end' }}>
              {/* Sin destino NO se dibuja el botón: no se ofrece un salto que no se puede dar. */}
              {destino && onIrAlLugar && (
                <button type="button" style={btnGhost} onClick={() => onIrAlLugar(destino.moduleKey, destino.subKey, destino.target)}>
                  Ir al lugar <Icon name="arrowRight" size={15} color="currentColor" />
                </button>
              )}
              {!f.seen_at && (
                <button type="button" style={btnGhost} onClick={() => onMarcar(f)}>
                  Marcar como visto
                </button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
