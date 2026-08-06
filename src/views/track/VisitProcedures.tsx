import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { reportEtaLabel } from '../../lib/checklist'
import {
  useVisitProcedureStatus, toggleVisitProcedure, toggleVisitProcedureReport,
} from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'

/** ¿El reporte de un procedimiento realizado ya venció su ETA y sigue sin marcarse listo? */
function reportOverdue(p: VisitProcedureStatus): boolean {
  if (!p.has_report || p.report_ready || !p.completed || !p.completed_at || p.report_eta_hours == null) return false
  return Date.now() > new Date(p.completed_at).getTime() + p.report_eta_hours * 3600_000
}

/**
 * Suelta las marcas optimistas que el dato fresco ya confirma. Devuelve el MISMO objeto si no hay
 * nada que soltar, así React descarta el set y no re-renderiza de más.
 */
function settled(
  opt: Record<string, boolean>,
  rows: VisitProcedureStatus[],
  serverValue: (p: VisitProcedureStatus) => boolean,
): Record<string, boolean> {
  const done = rows.filter((p) => p.procedure_id in opt && opt[p.procedure_id] === serverValue(p))
  if (done.length === 0) return opt
  const next = { ...opt }
  for (const p of done) delete next[p.procedure_id]
  return next
}

/**
 * Checklist de procedimientos de la visita (0064): lo que el cronograma le asigna a esta visita,
 * tildable ("realizado"). Los que generan reporte muestran, una vez realizados, el control
 * "reporte listo" + estado pendiente/vencido. Siempre visible (no espera Atendida). readOnly = ficha.
 *
 * El estado "realizado" se dice con el tilde + el tinte de la fila, NO tachando el nombre: en esta
 * app el tachado ya significa "esto se borra" (la confirmación de baja de TemplatesView), y un
 * procedimiento hecho no es un procedimiento anulado — en un entorno regulado esa lectura es peor
 * que fea. Toda la fila es el control (como el checklist clínico), así el área de toque llega a los
 * 44px y no hay que apuntarle a un cuadrito de 20.
 */
export function VisitProcedures({ visitId, visitDefId, accent, readOnly }: {
  visitId: string
  visitDefId: string | null
  accent: string
  readOnly: boolean
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, visitDefId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})
  const [optReport, setOptReport] = useState<Record<string, boolean>>({})

  // Reconciliación del optimismo: la marca local se suelta cuando el dato fresco YA dice lo mismo,
  // no apenas responde el RPC. `refetch()` solo bumpea un nonce (la consulta llega uno o dos renders
  // después, y `useSupabaseQuery` mantiene las filas viejas mientras tanto), así que limpiarla en el
  // acto hacía que el tilde recién puesto se apagara y se volviera a encender.
  useEffect(() => {
    if (!data) return
    setOptDone((o) => settled(o, data, (p) => p.completed))
    setOptReport((o) => settled(o, data, (p) => p.report_ready))
  }, [data])

  const items = data ?? []
  // Sin procedimientos asignados → se DICE, no se calla. Antes devolvía null: como en la ficha el
  // componente va dentro de un `Panel` que el padre ya pintó, el "no mostrar nada" dejaba un cuadro
  // "Procedimientos" vacío que se lee como bug (reporte del Director, 2026-08-06). Mismo criterio
  // que Dispensación ("Esta visita no entrega medicación"): el vacío explicado.
  if (!loading && !error && items.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', padding: '4px 0' }}>
        {visitDefId
          ? 'Esta visita no tiene procedimientos asignados. Se asignan por visita en el cronograma del protocolo.'
          : 'Las visitas sueltas no tienen procedimientos del cuadro.'}
      </div>
    )
  }

  const doneOf = (p: VisitProcedureStatus) => optDone[p.procedure_id] ?? p.completed
  const reportOf = (p: VisitProcedureStatus) => optReport[p.procedure_id] ?? p.report_ready

  async function run(procedureId: string, opt: 'done' | 'report', next: boolean, call: () => Promise<{ error: string | null }>) {
    const key = procedureId + ':' + opt
    if (pending.has(key)) return
    setActionError(null)
    setPending((s) => new Set(s).add(key))
    const setter = opt === 'done' ? setOptDone : setOptReport
    setter((o) => ({ ...o, [procedureId]: next }))
    const { error: err } = await call()
    setPending((s) => { const c = new Set(s); c.delete(key); return c })
    if (err) {
      setter((o) => { const c = { ...o }; delete c[procedureId]; return c })
      setActionError(err)
      return
    }
    refetch() // el optimismo lo suelta el efecto de arriba, cuando llega el dato fresco
  }

  if (loading) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
  }
  if (error) {
    return <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--spira-danger)' }}>No se pudieron cargar los procedimientos: {error}</div>
  }

  const done = items.filter((p) => doneOf(p)).length

  return (
    <div>
      {/* Solo el contador: el rótulo lo pone el `Panel` que envuelve a este bloque ("Procedimientos"),
          repetirlo abajo en mayúsculas era decir dos veces lo mismo en dos tipografías. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {done}/{items.length} realizados
      </div>

      {actionError && <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--spira-danger)' }}>{actionError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => {
          const isDone = doneOf(p)
          const isReady = reportOf(p)
          const overdue = !isReady && reportOverdue({ ...p, completed: isDone, report_ready: isReady })
          const reportPending = pending.has(p.procedure_id + ':report')

          /* Contenido de la fila. Idéntico se toque o no: en la ficha (readOnly) va en un div, no en
             un botón deshabilitado, para no dejar una parada de tabulación que no hace nada. */
          const row = (
            <>
              <span className="spira-tick" style={tickBox(isDone, accent)}>
                <Icon
                  name="check" size={13} stroke={2.2} color="var(--spira-on-accent)"
                  style={{ opacity: isDone ? 1 : 0, transform: isDone ? 'none' : 'scale(0.6)' }}
                />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13.5, color: 'var(--spira-ink)' }}>{p.name}</span>
                {p.category && <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-muted)' }}>{p.category}</span>}
              </span>
              {p.has_report && (
                <span style={reportPill(isReady, overdue)}>
                  {isReady ? 'Reporte listo' : overdue ? 'Reporte vencido' : 'Reporte pendiente'}
                </span>
              )}
            </>
          )

          return (
            <div key={p.procedure_id} style={{ borderRadius: 12, border: `1px solid ${isDone ? accent + '59' : 'var(--spira-line)'}`, background: isDone ? accent + '10' : 'var(--spira-white)' }}>
              {readOnly ? (
                <div style={rowBase}>{row}</div>
              ) : (
                <button
                  /* Casilla, no botón: el lector de pantalla anuncia "marcada / sin marcar", que es
                     exactamente el estado. Sin `aria-label` a propósito — el nombre accesible sale
                     del contenido (procedimiento + categoría + estado del reporte). Y sin
                     `disabled` mientras vuelve el RPC: deshabilitar el elemento enfocado tira el
                     foco al body; el reingreso lo corta el guard de `pending` dentro de `run`. */
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  className="spira-no-press"
                  onClick={() => run(p.procedure_id, 'done', !isDone, () => toggleVisitProcedure(visitId, p.procedure_id, !isDone))}
                  style={{ ...rowBase, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}
                >
                  {row}
                </button>
              )}

              {/* Circuito de reporte: solo si genera reporte y ya está realizado. Sangrado hasta la
                  columna del texto (13 de padding + 20 del tilde + 12 del gap), no bajo el tilde. */}
              {p.has_report && isDone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px 11px 45px' }}>
                  <button
                    type="button" disabled={readOnly || reportPending}
                    onClick={() => run(p.procedure_id, 'report', !isReady, () => toggleVisitProcedureReport(visitId, p.procedure_id, !isReady))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 11px', borderRadius: 8, cursor: readOnly ? 'default' : 'pointer', border: `1px solid ${isReady ? 'var(--spira-good)' : 'var(--spira-line-2)'}`, background: isReady ? '#5C8A5A14' : 'var(--spira-white)', color: isReady ? 'var(--spira-good)' : 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5 }}
                  >
                    <Icon name={isReady ? 'check' : 'printer'} size={14} color={isReady ? 'var(--spira-good)' : accent} />
                    {isReady ? 'Reporte descargado' : 'Marcar reporte descargado'}
                  </button>
                  {/* ETA en `muted`, no en `faint`: es información (cuándo se espera el reporte), y
                      sobre el tinte de la fila el terciario se desvanecía. */}
                  <span style={{ fontSize: 11.5, color: 'var(--spira-muted)' }}>
                    {p.report_eta_hours != null ? `ETA ${reportEtaLabel(p.report_eta_hours)}` : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Fila: el tilde alineado con la PRIMERA línea del nombre (no centrado en el bloque de dos líneas). */
const rowBase: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 13px',
}

/**
 * Cuadrito del tilde. Vacío: borde `muted` (el `line-2` de los inputs queda en 1.9:1 sobre blanco —
 * por debajo del 3:1 que WCAG pide para el contorno de un control, y hacía que el salto al relleno
 * pareciera aparecer de la nada). Relleno: acento del módulo, con el tilde en papel (4.3:1).
 */
function tickBox(isDone: boolean, accent: string): CSSProperties {
  return {
    flex: '0 0 auto', width: 20, height: 20, marginTop: -2, borderRadius: 6,
    display: 'grid', placeItems: 'center',
    border: `1.5px solid ${isDone ? accent : 'var(--spira-muted)'}`,
    background: isDone ? accent : 'transparent',
  }
}

/** Rótulo de estado del reporte (mismo vocabulario de píldora que el resto de Track). */
function reportPill(isReady: boolean, overdue: boolean): CSSProperties {
  return {
    flex: '0 0 auto', marginTop: 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 'var(--spira-radius-pill)',
    color: isReady ? 'var(--spira-good)' : overdue ? 'var(--spira-danger)' : 'var(--spira-warn)',
    background: (isReady ? '#5C8A5A' : overdue ? '#A6483B' : '#B0823F') + '1E',
  }
}
