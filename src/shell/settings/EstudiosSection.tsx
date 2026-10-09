import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { useAuth } from '../../lib/auth'
import { useMyCoordinations, useProtocols } from '../../data/protocols'
import type { ProtocolRow } from '../../data/protocols'
import { protocolStatusLabel, protocolStatusVar } from '../../views/protocolStatus'
import { DESTINO_ESTUDIOS } from '../../views/resumen/destinos'
import { StCard, StPill, btnGhost } from './primitives'

/* ============================================================================
   Ajustes › Estudios del centro — todos los protocolos, para gestionarlos.

   Nació el 2026-10-09 al sacar el alternador «Mis estudios / Todos» de Coordinación › Estudios y
   pacientes (ver `views/protocolosDeLaGrilla.ts`). «Todos» mostraba los estudios ajenos con
   «0 pacientes»: jefatura ve todos los protocolos (0028) pero sólo los pacientes de los suyos (0006),
   así que el cero era falta de acceso y no un dato. La grilla quedó con los estudios cuyos pacientes
   ves; ésta es la puerta a los demás, que jefatura sigue necesitando para editar sus datos o armarles
   el cronograma.

   POR ESO NO CUENTA PACIENTES. Es la diferencia con la grilla, y es todo el punto: acá un estudio es
   un registro a administrar, no una lista de personas. «Asignado a vos» dice cuáles de éstos además
   ves en la grilla.

   Sólo para jefatura de Coordinación (líder o más): es a quien la RLS de protocolos le muestra todos.
   Gerencia no la necesita —su grilla ya los tiene todos, con sus pacientes— y a una coordinadora la
   RLS le devolvería sólo los suyos, que ya están en la grilla. Ver `seccionVisible`.
   ============================================================================ */

export function EstudiosSection({ onIrAlLugar }: {
  /** Abrir el estudio en Coordinación. Lo pasa el shell, que es el que navega (y cierra Ajustes). */
  onIrAlLugar?: (moduleKey: string, subKey: string, target: Record<string, unknown>) => void
}) {
  const { profile } = useAuth()
  const protocolos = useProtocols()
  const coordinaciones = useMyCoordinations(profile?.id ?? null)
  const mios = useMemo(
    () => new Set((coordinaciones.data ?? []).map((c) => c.protocol_id)),
    [coordinaciones.data],
  )

  if (protocolos.loading || coordinaciones.loading) {
    return <div style={{ fontSize: 13.5, color: 'var(--spira-muted)' }}>Cargando los estudios…</div>
  }

  if (protocolos.error || coordinaciones.error) {
    return (
      <div role="alert" style={alerta}>
        <Icon name="alertCircle" size={15} color="var(--spira-danger)" />
        No pudimos cargar los estudios. Cerrá y volvé a abrir Ajustes.
      </div>
    )
  }

  const filas = protocolos.data ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
      <StCard
        title="Estudios del centro"
        desc="Para editar sus datos y su cronograma. Sus pacientes los ven las personas asignadas"
        pad={false}
      >
        {filas.length === 0 ? (
          <div style={{ padding: '13px 18px', fontSize: 13.5, color: 'var(--spira-muted)' }}>Todavía no hay estudios.</div>
        ) : filas.map((p, i) => (
          <FilaEstudio
            key={p.id}
            fila={p}
            asignado={mios.has(p.id)}
            last={i === filas.length - 1}
            onAbrir={onIrAlLugar && (() => onIrAlLugar(DESTINO_ESTUDIOS.moduleKey, DESTINO_ESTUDIOS.subKey, { protocolId: p.id }))}
          />
        ))}
      </StCard>
    </div>
  )
}

/* Una fila: el mismo `13px 18px` de borde a borde que `FilaPlataforma` y `FilaDePersona`, las otras
   listas de Ajustes. Acrónimo como identidad (así lo nombra el centro) y el código en mono debajo,
   igual que la tarjeta de la grilla. */
function FilaEstudio({ fila, asignado, last, onAbrir }: {
  fila: ProtocolRow
  asignado: boolean
  last: boolean
  onAbrir?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderBottom: last ? 'none' : '1px solid var(--spira-line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* `height: 23`, el alto de la píldora: así las filas con y sin «Asignado a vos» miden igual. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, height: 23 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fila.name}
          </span>
          {asignado && <StPill tone="accent">Asignado a vos</StPill>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--spira-muted)', minWidth: 0 }}>
          <span className="spira-mono" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fila.code}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: protocolStatusVar(fila.status) }} />
            {protocolStatusLabel(fila.status)}
          </span>
        </div>
      </div>
      {onAbrir && (
        <button type="button" style={btnGhost} onClick={onAbrir} aria-label={`Abrir ${fila.name}`}>
          Abrir <Icon name="chevronRight" size={14} color="var(--spira-muted)" />
        </button>
      )}
    </div>
  )
}

const alerta: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--spira-acc-deep-danger)',
  background: 'rgba(166, 72, 59, 0.10)', borderRadius: 10, padding: '12px 14px', maxWidth: 720,
}
