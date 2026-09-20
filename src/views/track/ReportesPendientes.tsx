import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Panel } from './Panel'
import type { ReportStatusRow } from '../../data/reportStatus'
import { canUntickProcedure } from './reportes/estados'
import type { ReportStage } from './reportes/estados'
import { badgePorCargar, sublineaProcedimiento } from './reportes/panelDeReportes'
import { ReportCard } from './reportes/ReportCard'

/** Un procedimiento del cuadro que DEJA informe, con sus reportes. */
export interface ProcedimientoConReportes {
  procedure_id: string
  name: string
  completed: boolean
  draws_blood: boolean | null
  reportes: ReportStatusRow[]
}

/**
 * ┌─ El panel «Reportes pendientes» del modal de visita ────────────────────────────────────────┐
 *
 * Contiene SÓLO los procedimientos que dejan informe. Los demás —signos vitales, examen físico— se
 * fueron del panel: lo que la visita lleva se lee arriba, en el Resumen, y acá queda lo único que
 * pide trabajo POSTERIOR. El tilde vive en esta pantalla y en ninguna otra.
 *
 * UNA TARJETA POR PROCEDIMIENTO, con una banda de encabezado que ES el control del tilde: se toca
 * toda la banda y no un cuadrito de 20px (área de 44, que es lo que pide el dedo). Debajo, un bloque
 * por reporte con su estado, su plataforma y su plazo.
 *
 * El panel NO se dibuja cuando la visita no define reportes — un cuadro vacío se lee como un error —,
 * pero SÍ se dibuja cuando la consulta falla: esconderlo ahí diría «esta visita no tiene reportes» y
 * haría desaparecer trabajo en silencio. Esa decisión vive en `estadoPanelReportes`, con test.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function ReportesPendientes({
  estado, error, procedimientos, porCargar, accent, readOnly, enVuelo, movingReport, actionError, onToggle, onStage,
}: {
  estado: 'cargando' | 'error' | 'oculto' | 'lista'
  error: string | null
  procedimientos: readonly ProcedimientoConReportes[]
  porCargar: number
  accent: string
  readOnly: boolean
  /** Procedimientos con el tilde en vuelo: su reporte no puede avanzar todavía. */
  enVuelo: ReadonlySet<string>
  /** Reporte con un cambio de etapa en curso. */
  movingReport: string | null
  actionError: string | null
  onToggle: (p: ProcedimientoConReportes) => void
  onStage: (r: ReportStatusRow, stage: ReportStage) => void
}) {
  if (estado === 'oculto') return null

  const badge = badgePorCargar(porCargar)

  return (
    <Panel
      title="Reportes pendientes"
      icon="fileText"
      accent={accent}
      aside={estado === 'lista' ? <Badge texto={badge.texto} pendiente={badge.pendiente} /> : undefined}
    >
      {estado === 'cargando' && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '2px 0' }}>Cargando reportes…</div>
      )}
      {estado === 'error' && (
        <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '2px 0' }}>
          No se pudieron cargar los reportes de la visita{error ? `: ${error}` : '.'}
        </div>
      )}

      {actionError && (
        <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{actionError}</div>
      )}

      {estado === 'lista' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {procedimientos.map((p) => {
            /* Espejo del guard de la base (0090): si algún reporte ya salió de pendiente, destildar
               borraría su historial. Se calcula acá para poder DECIRLO, no para reemplazarlo. */
            const guard = canUntickProcedure(p.reportes)
            const bloqueado = p.completed && !guard.puede
            const motivo = bloqueado
              ? 'Tiene reportes ya avanzados: retrocedé el reporte antes de desmarcarlo.'
              : undefined

            return (
              <div key={p.procedure_id} style={tarjeta}>
                {/* La banda entera es la casilla. `role="checkbox"` y no un botón: el lector de
                    pantalla anuncia «marcada / sin marcar», que es exactamente el estado.
                    Bloqueada va con `aria-disabled` y NO con `disabled`: deshabilitar el elemento
                    enfocado tira el foco al body. Y el clic igual deja el aviso en línea — un
                    `title` no llega ni al teclado ni al toque. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={p.completed}
                  aria-disabled={readOnly || bloqueado || undefined}
                  title={motivo}
                  className="spira-no-press"
                  onClick={() => { if (!readOnly) onToggle(p) }}
                  style={{ ...banda, cursor: readOnly || bloqueado ? 'default' : 'pointer' }}
                >
                  <span style={casilla(p.completed, accent)}>
                    <Icon
                      name="check" size={13} stroke={2.2} color="var(--spira-on-accent)"
                      style={{ opacity: p.completed ? 1 : 0, transform: p.completed ? 'none' : 'scale(0.6)' }}
                    />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    {/* Tachado al tildar, como Tareas: lo hecho se tacha y lo que falta sigue
                        contado en la sublínea de abajo. */}
                    <span style={{
                      display: 'block', fontSize: 12.5, fontWeight: 600,
                      color: p.completed ? 'var(--spira-ink-soft)' : 'var(--spira-ink)',
                      textDecoration: p.completed ? 'line-through' : undefined,
                      textDecorationColor: 'var(--spira-muted)', textDecorationThickness: 1,
                    }}>
                      {p.name}
                    </span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>
                      {sublineaProcedimiento(p.completed, p.reportes)}
                    </span>
                  </span>
                  {p.draws_blood === true && (
                    <span role="img" aria-label="Lleva extracción de sangre" style={{ display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                      <Icon name="droplet" size={13} color="var(--spira-danger)" fill="var(--spira-danger)" />
                    </span>
                  )}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', padding: '0 14px 11px' }}>
                  {p.reportes.map((r, i) => (
                    <ReportCard
                      key={r.report_definition_id}
                      row={r}
                      variante="visita"
                      primero={i === 0}
                      canOperate={!readOnly && !enVuelo.has(p.procedure_id)}
                      busy={movingReport === r.report_definition_id}
                      onStage={(s) => onStage(r, s)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** «N por cargar» (ámbar) o «Al día» (neutro). El color acá es significado: queda trabajo. */
function Badge({ texto, pendiente }: { texto: string; pendiente: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px',
        borderRadius: 'var(--spira-radius-pill)', borderWidth: 1, borderStyle: 'solid',
        borderColor: pendiente ? 'color-mix(in srgb, #B0823F 30%, var(--spira-white))' : 'var(--spira-line)',
        background: pendiente ? 'color-mix(in srgb, #B0823F 12%, var(--spira-white))' : 'transparent',
        color: pendiente ? 'var(--spira-acc-deep-warn)' : 'var(--spira-ink-soft)',
        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  )
}

const tarjeta: CSSProperties = {
  border: '1px solid var(--spira-line)', borderRadius: 12, overflow: 'hidden',
  background: 'var(--spira-white)',
}

const banda: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
  padding: '9px 14px', textAlign: 'left',
  background: 'var(--spira-surface)',
  borderWidth: '0 0 1px 0', borderStyle: 'solid', borderColor: 'var(--spira-line)',
  fontFamily: 'var(--spira-font-text)',
}

/**
 * Cuadrito del tilde. Vacío: borde `muted` (el `line-2` de los inputs queda en 1,9:1 sobre blanco,
 * por debajo del 3:1 que WCAG pide para el contorno de un control). Relleno: acento del módulo.
 */
function casilla(marcado: boolean, accent: string): CSSProperties {
  return {
    flex: '0 0 auto', width: 20, height: 20, borderRadius: 6,
    display: 'grid', placeItems: 'center',
    borderWidth: 1.5, borderStyle: 'solid', borderColor: marcado ? accent : 'var(--spira-muted)',
    background: marcado ? accent : 'transparent',
  }
}
