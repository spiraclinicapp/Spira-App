import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { btnOutline } from '../../components/buttons'
import { formatAR } from '../../lib/dates'
import type { DestinoDeDiferidos } from './continuacion'

/**
 * El pie del panel «Resumen de la visita» cuando la visita se desdobló (v0144):
 *  · en la visita de origen, un bloque por cada continuación — qué pasó, a qué día, y cómo abrirla
 *    o deshacerla;
 *  · en la continuación, de dónde viene;
 *  · y los dos botones de acción: pasar pendientes a otro día, y editar lo que lleva una suelta.
 *
 * Cada destino tiene su BOTÓN con nombre para abrirlo: el bloque no es un link, porque la tarjeta
 * de una visita lleva a esa visita y no a otra (regla del Director).
 */
export function DesdoblamientoVisita({
  destinos, origenVisitId, puedePasar, puedeEditar, readOnly, onPasar, onEditar, onAbrirVisita, onDeshacer,
}: {
  destinos: readonly DestinoDeDiferidos[]
  /** Si esta visita es una continuación, la visita de la que viene. */
  origenVisitId: string | null
  puedePasar: boolean
  puedeEditar: boolean
  readOnly: boolean
  onPasar: () => void
  onEditar: () => void
  onAbrirVisita?: (visitId: string) => void
  onDeshacer: (destino: DestinoDeDiferidos) => void
}) {
  const hayAcciones = !readOnly && (puedePasar || puedeEditar)
  if (!origenVisitId && destinos.length === 0 && !hayAcciones) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {origenVisitId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--spira-ink-2)' }}>Sigue con lo que quedó pendiente de otra visita.</span>
          {onAbrirVisita && (
            <button type="button" style={btnChico} onClick={() => onAbrirVisita(origenVisitId)}>
              Abrir la visita de origen
            </button>
          )}
        </div>
      )}

      {destinos.map((d) => (
        <div key={d.visit_id} style={caja}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Icon name="arrowRight" size={15} color="var(--spira-muted)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spira-ink)' }}>
              Pasaron a otra visita · {d.procedimientos.length} {d.procedimientos.length === 1 ? 'procedimiento' : 'procedimientos'}
              {d.fecha ? ` · ${formatAR(d.fecha)}` : ''}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 4, lineHeight: 1.45 }}>
            {d.procedimientos.join(' · ')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {onAbrirVisita && (
              <button type="button" style={btnChico} onClick={() => onAbrirVisita(d.visit_id)}>
                {/* La fecha ya está en el renglón de arriba (decisión del Director sobre el mock, 2026-09-25). */}
                Abrir la visita
              </button>
            )}
            {!readOnly && (
              <button type="button" style={btnChico} onClick={() => onDeshacer(d)}>Deshacer</button>
            )}
          </div>
        </div>
      ))}

      {hayAcciones && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puedePasar && <button type="button" style={btnChico} onClick={onPasar}>Pasar pendientes a otro día</button>}
          {puedeEditar && <button type="button" style={btnChico} onClick={onEditar}>Editar procedimientos</button>}
        </div>
      )}
    </div>
  )
}

const btnChico: CSSProperties = { ...btnOutline, height: 32, padding: '0 12px', fontSize: 13 }
/** Superficie por elevación, sin borde de color (regla del realce). */
const caja: CSSProperties = {
  padding: '10px 12px', borderRadius: 10, background: 'var(--spira-paper)', boxShadow: 'var(--spira-shadow-sm)',
}
