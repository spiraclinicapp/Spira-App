import type { CSSProperties } from 'react'
import { btnOutline } from '../../components/buttons'
import { formatAR, todayISO } from '../../lib/dates'
import { visitTitle } from '../../lib/visits'
import { Panel } from './Panel'
import { Badge, tarjeta } from './ReportesPendientes'
import { diasEsperando } from './retomar'
import type { VisitaPorRetomar } from './retomar'

/**
 * «Queda para otro día» en la ficha del paciente (v0145; spec §3, decisión del Director 2026-09-27):
 * lo que ESTE paciente tiene esperando en esta inscripción. Una fila por VISITA —no por
 * procedimiento—, con la misma información que la fila de Pendientes, mirada desde la ficha: acá el
 * paciente ya está a la vista, así que alcanza con la visita.
 *
 * Mismo lenguaje que el panel de la visita (`QuedaParaOtroDia`): el badge ámbar de la cuenta y
 * tarjetas por elevación, sin borde de color. La fila no es un link ni tiene casilla: lo que hace es
 * su botón con nombre, «Agendar», que abre el modal ya en «Continuar pendientes» sobre esa visita.
 *
 * Sin nada esperando no se dibuja: no hay un «Sin pendientes» que decir (la ficha ya dice «Sin
 * alertas activas» para lo urgente). Si la lectura falla, sí: esconderlo diría que no hay nada.
 */
export function PorRetomarDelPaciente({ grupos, error, puedeAgendar, onAgendar }: {
  grupos: readonly VisitaPorRetomar[]
  error: string | null
  puedeAgendar: boolean
  onAgendar: (origenId: string) => void
}) {
  if (!error && grupos.length === 0) return null
  const hoy = todayISO()

  return (
    <Panel
      title="Queda para otro día"
      icon="clock"
      accent="var(--spira-acc-deep-warn)"
      aside={error ? undefined : <Badge texto={`${grupos.length} ${grupos.length === 1 ? 'visita' : 'visitas'}`} pendiente />}
    >
      {error ? (
        <div style={{ fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', padding: '2px 0' }}>
          No se pudo cargar lo que quedó para otro día: {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grupos.map((g) => {
            const v = g.visita
            const fecha = v.real_date ?? v.estimated_date
            const dias = diasEsperando(g.desde, hoy)
            return (
              <div key={v.id} style={tarjeta}>
                <div style={fila}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={nombre}>
                      {visitTitle(v)}{fecha ? ` · ${formatAR(fecha)}` : ''} · {g.procedimientos.map((p) => p.name).join(', ')}
                    </span>
                    <span style={sublinea}>{dias > 0 ? `Espera hace ${dias} d` : 'Desde hoy'}</span>
                  </span>
                  {puedeAgendar && (
                    <button type="button" style={btnChico} onClick={() => onAgendar(v.id)}>Agendar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/** La banda de `ReportesPendientes` sin el control del tilde, que acá no aplica. */
const fila: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '9px 14px', background: 'var(--spira-surface)',
}
const nombre: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--spira-ink)' }
const sublinea: CSSProperties = { display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-ink-soft)' }
const btnChico: CSSProperties = { ...btnOutline, height: 32, padding: '0 12px', fontSize: 13, flex: '0 0 auto' }
