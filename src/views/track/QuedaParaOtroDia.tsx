import type { CSSProperties } from 'react'
import { Panel } from './Panel'
import type { MarcadoRow } from '../../data/pendientes'
import { formatAR, isoDayAR } from '../../lib/dates'
import { Badge, banda, casilla, tarjeta } from './ReportesPendientes'

/**
 * ┌─ «Queda para otro día» en la visita de origen (v0145) ──────────────────────────────────────┐
 *
 * Lo que esta visita dejó para otro día, sin fecha todavía. Va en su PROPIO panel, debajo del
 * Resumen, porque ya no está en ningún otro lado de la visita: la lista efectiva lo resta, así que
 * tampoco aparece en «Reportes pendientes».
 *
 * MISMO LENGUAJE que «Reportes pendientes» (Director sobre el mock, 2026-09-27: «un poco más alerta
 * o llamativo, pero sin irse al carajo»): el badge de la cuenta en ámbar, una tarjeta por
 * procedimiento con su banda-casilla. Sin teñir la tarjeta ni ponerle borde de color: el color va
 * en el badge, que es significado (queda trabajo).
 *
 * LA CASILLA NO TILDA. Tocarla abre «¿Qué se hizo hoy?» (`QueSeHizoHoyModal`): tildar acá hace dos
 * cosas —saca la marca y arranca el reporte— y dos cosas juntas se confirman, no se hacen de un
 * toque optimista. Por eso la casilla está siempre vacía: nunca muestra un estado que no es.
 *
 * Si la lectura falla, el panel se dibuja con el error en vez de desaparecer: esconderlo diría «no
 * quedó nada para otro día» y haría desaparecer trabajo en silencio (mismo criterio que
 * `estadoPanelReportes`).
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function QuedaParaOtroDia({ marcados, error, accent, readOnly, onTildar }: {
  marcados: readonly MarcadoRow[]
  error: string | null
  accent: string
  readOnly: boolean
  /** Se tocó la casilla de ese procedimiento: abrir «¿Qué se hizo hoy?» con él tildado. */
  onTildar: (procedureId: string) => void
}) {
  if (!error && marcados.length === 0) return null

  return (
    <Panel
      title="Queda para otro día"
      icon="clock"
      accent="var(--spira-acc-deep-warn)"
      aside={error ? undefined : <Badge texto={`${marcados.length} para otro día`} pendiente />}
    >
      {error ? (
        <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '2px 0' }}>
          No se pudo cargar lo que quedó para otro día: {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {marcados.map((m) => (
            <div key={m.procedure_id} style={tarjeta}>
              {/* `role="checkbox"` siempre sin marcar, como la banda de «Reportes pendientes»: el
                  lector de pantalla anuncia «sin marcar», que es lo que es. Sin borde inferior: acá
                  la banda es lo único de la tarjeta (en «Reportes» la separa de sus reportes). */}
              <button
                type="button"
                role="checkbox"
                aria-checked={false}
                aria-disabled={readOnly || undefined}
                className="spira-no-press"
                onClick={() => { if (!readOnly) onTildar(m.procedure_id) }}
                style={{ ...banda, borderWidth: 0, cursor: readOnly ? 'default' : 'pointer' }}
              >
                <span style={casilla(false, accent)} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={nombre}>{m.procedure_name}</span>
                  <span style={sublinea}>Para otro día · desde el {formatAR(isoDayAR(m.marked_at))}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

const nombre: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)' }
const sublinea: CSSProperties = { display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-ink-soft)' }
