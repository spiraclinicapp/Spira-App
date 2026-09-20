import { Panel } from './Panel'
import { IndicadoresVisita } from '../visitAtoms'
import type { ResumenVisita as Resumen } from './resumenVisita'

/**
 * El panel «Resumen de la visita»: qué lleva, de un vistazo.
 *
 * Cuerpo = la tira de indicadores y nada más. Sin contador de realizados (el trabajo por hacer lo
 * dice el panel de abajo) y sin recordatorios operativos: «pedir el retiro del courier» se sabe.
 *
 * EL VACÍO SE EXPLICA, a diferencia de la fila del día, que simplemente no dibuja la tira. Acá el
 * panel ya existe, y un cuadro con título y nada adentro se lee como un error (Director,
 * 2026-08-06, el mismo criterio que Dispensación).
 */
export function PanelResumenVisita({ resumen, porCargar, accent, cargando, error, visitDefId }: {
  resumen: Resumen | null
  /** Reportes por cargar. `null` = la visita no define ninguno: el indicador no se dibuja. */
  porCargar: number | null
  accent: string
  cargando: boolean
  error: string | null
  /** Null = visita suelta: no tiene cuadro del que sacar procedimientos. */
  visitDefId: string | null
}) {
  return (
    <Panel title="Resumen de la visita" icon="clipboardCheck" accent={accent}>
      {error ? (
        <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '2px 0' }}>
          No se pudieron cargar los procedimientos: {error}
        </div>
      ) : resumen ? (
        <IndicadoresVisita resumen={resumen} variante="modal" porCargar={porCargar} />
      ) : cargando ? (
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '2px 0' }}>Cargando procedimientos…</div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '2px 0', lineHeight: 1.45 }}>
          {visitDefId
            ? 'Esta visita no tiene procedimientos asignados. Se asignan por visita en el cronograma del protocolo.'
            : 'Las visitas sueltas no tienen procedimientos del cuadro.'}
        </div>
      )}
    </Panel>
  )
}
