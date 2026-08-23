import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useAuth } from '../../lib/auth'
import { ScheduleEditor } from './ScheduleEditor'
import { ProceduresCatalog } from './procedimientos/ProceduresCatalog'

const SUBS = [
  { key: 'visitas', label: 'Visitas' },
  { key: 'procedimientos', label: 'Procedimientos del estudio' },
] as const

type Sub = (typeof SUBS)[number]['key']

/**
 * La solapa "Cronograma" del detalle de protocolo, con sus dos mitades:
 *
 *   Visitas                    → el cuadro de visitas (V1, V2…) y qué procedimientos lleva cada una.
 *   Procedimientos del estudio → el catálogo de este protocolo y los reportes que genera cada
 *                                procedimiento (0089).
 *
 * Es un envoltorio a propósito, y no una reforma de `ScheduleEditor`: ese archivo ya resuelve el
 * cuadro de visitas entero (alta, borrado con impacto, reordenado, sync) y meterle adentro un
 * segundo modo lo habría convertido en dos componentes conviviendo en uno. Acá el interruptor vive
 * aparte y cada mitad se lee sola.
 */
export function CronogramaTab({ protocolId, accent, accentSolid, canEdit, onChanged }: {
  protocolId: string
  accent: string
  accentSolid: string
  canEdit: boolean
  onChanged: () => void
}) {
  const [sub, setSub] = useState<Sub>('visitas')
  const { hasMinRole, modules } = useAuth()
  /* Espejo de la RLS de `procedures` (0061): crear o renombrar en el catálogo GLOBAL afecta a
     TODOS los protocolos, así que pide gerencia o líder de Coordinación. Armar el cuadro de UN
     estudio y sus reportes pide operator, que es lo que ya trae `canEdit`. */
  const canManageCatalog = modules.includes('gerencia') || hasMinRole('track', 'leader')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div role="tablist" aria-label="Secciones del cronograma" style={{ display: 'flex', gap: 6 }}>
        {SUBS.map((s) => {
          const on = sub === s.key
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSub(s.key)}
              className="spira-no-press"
              style={tab(on, accent)}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {sub === 'visitas' ? (
        <ScheduleEditor
          protocolId={protocolId}
          accent={accent}
          accentSolid={accentSolid}
          canEdit={canEdit}
          onChanged={onChanged}
        />
      ) : (
        <ProceduresCatalog
          protocolId={protocolId}
          accent={accent}
          accentSolid={accentSolid}
          canEdit={canEdit}
          canManageCatalog={canManageCatalog}
        />
      )}
    </div>
  )
}

/** Mismo vocabulario de pestaña-píldora que la solapa de arriba (ProtocolDetailView). */
function tab(on: boolean, accent: string): CSSProperties {
  return {
    fontSize: 12.5, fontWeight: 600, padding: '5px 12px', borderRadius: 'var(--spira-radius-pill)',
    cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
    color: on ? accent : 'var(--spira-muted)',
    background: on ? accent + '14' : 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: on ? 'transparent' : 'var(--spira-line)',
  }
}
