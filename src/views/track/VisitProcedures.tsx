import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Panel } from './Panel'
import { reportEtaLabel } from '../../lib/checklist'
import {
  useVisitProcedureStatus, toggleVisitProcedure, toggleVisitProcedureReport,
} from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'
import { useVisitReportStatus, setReportStage } from '../../data/reportStatus'
import type { ReportStatusRow } from '../../data/reportStatus'
import { canUntickProcedure } from './reportes/estados'
import type { ReportStage } from './reportes/estados'
import { ReportCard } from './reportes/ReportCard'

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
 * El componente monta su PROPIO `Panel` (como `DoctorRequest`) en vez de que lo envuelva el padre:
 * el contador "n/total realizados" solo lo sabe acá, y tiene que ir en la línea del rótulo. Devuelto
 * como cuerpo, abría una línea aparte y empujaba el primer procedimiento hacia abajo.
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

  /* Los reportes del modelo nuevo (0089/0090). El desglose se abre con SU píldora y no con el
     tilde: antes el tilde lo auto-expandía y el Director pidió lo contrario — tildar activa el
     plazo, desplegar es una decisión aparte. */
  const reportes = useVisitReportStatus(visitId)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [movingReport, setMovingReport] = useState<string | null>(null)

  /** Reportes agrupados por procedimiento. Vacío = ese procedimiento no define ninguno. */
  const porProcedimiento = useMemo(() => {
    const m = new Map<string, ReportStatusRow[]>()
    for (const r of reportes.data ?? []) {
      const lista = m.get(r.procedure_id) ?? []
      lista.push(r)
      m.set(r.procedure_id, lista)
    }
    return m
  }, [reportes.data])

  const moverReporte = async (r: ReportStatusRow, stage: ReportStage) => {
    const key = r.report_definition_id
    if (movingReport) return
    setMovingReport(key)
    setActionError(null)
    const res = await setReportStage(r.visit_id, r.report_definition_id, stage)
    setMovingReport(null)
    if (res.error) { setActionError(res.error); return }
    reportes.refetch()
  }

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
      <ProceduresPanel accent={accent}>
        <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', padding: '4px 0' }}>
          {visitDefId
            ? 'Esta visita no tiene procedimientos asignados. Se asignan por visita en el cronograma del protocolo.'
            : 'Las visitas sueltas no tienen procedimientos del cuadro.'}
        </div>
      </ProceduresPanel>
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
    return (
      <ProceduresPanel accent={accent}>
        <div style={{ padding: '2px 0', fontSize: 13, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
      </ProceduresPanel>
    )
  }
  if (error) {
    return (
      <ProceduresPanel accent={accent}>
        <div style={{ padding: '2px 0', fontSize: 13, color: 'var(--spira-danger)' }}>No se pudieron cargar los procedimientos: {error}</div>
      </ProceduresPanel>
    )
  }

  const done = items.filter((p) => doneOf(p)).length

  return (
    <ProceduresPanel
      accent={accent}
      aside={
        <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {done}/{items.length} realizados
        </span>
      }
    >
      {actionError && <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--spira-danger)' }}>{actionError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => {
          const isDone = doneOf(p)
          const isReady = reportOf(p)
          const overdue = !isReady && reportOverdue({ ...p, completed: isDone, report_ready: isReady })
          const reportPending = pending.has(p.procedure_id + ':report')
          /** Los reportes definidos para este procedimiento en este estudio (0089). */
          const misReportes = porProcedimiento.get(p.procedure_id) ?? []
          const abierto = abiertos.has(p.procedure_id)
          /* Espejo del guard de la base: si algún reporte ya salió de pendiente, destildar borraría
             su historial. Se calcula acá para poder DECIRLO en vez de dejar que choque contra el
             error crudo de la RPC. */
          const guard = canUntickProcedure(misReportes)

          /** Tildar activa el plazo; destildar puede estar bloqueado. Nunca abre el desglose. */
          const alTildar = () => {
            if (isDone && !guard.puede) {
              setActionError(
                `«${p.name}» tiene ${guard.avanzados} ${guard.avanzados === 1 ? 'reporte ya avanzado' : 'reportes ya avanzados'}. ` +
                'Retrocedelos a pendiente antes de desmarcarlo.',
              )
              return
            }
            run(p.procedure_id, 'done', !isDone, () => toggleVisitProcedure(visitId, p.procedure_id, !isDone))
          }

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
                {/* `ink-soft` y no `muted`: medido sobre el papel de la fila realizada, `muted` da
                    3.12:1 y esto es texto normal (11.5px), o sea que necesita 4.5:1. Es el punto
                    flaco conocido de la paleta serena —el secundario sobre papel cálido— y el
                    remedio que el sistema ya tiene escrito es tinta atenuada, no gris. */}
                {p.category && <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--spira-ink-soft)' }}>{p.category}</span>}
              </span>
              {/* La píldora del modelo VIEJO sólo se dibuja para los procedimientos que todavía no
                  tienen reportes definidos (0089). Donde ya los hay manda el desglose, y mostrar
                  las dos cosas sería decir dos veces lo mismo con vocabularios distintos. */}
              {p.has_report && misReportes.length === 0 && (
                <span style={reportPill(isReady, overdue)}>
                  {isReady ? 'Reporte listo' : overdue ? 'Reporte vencido' : 'Reporte pendiente'}
                </span>
              )}
            </>
          )

          return (
            /* Realizado vs pendiente se dice por ELEVACIÓN, no por color: el pendiente es papel
               blanco apoyado sobre la superficie del panel, y el realizado se asienta en ella —
               deja de flotar, como algo que ya se resolvió. El borde es el mismo `line` en los dos.
               Antes el realizado llevaba el acento al 35% en el borde y al 6% en el fondo; el
               Director lo rechazó (2026-08-24) y además chocaba con la regla de la casa: el verde
               se reserva para significado, y acá el significado ya lo dice el tilde. */
            <div key={p.procedure_id} style={{ borderRadius: 12, border: '1px solid var(--spira-line)', background: isDone ? 'var(--spira-paper)' : 'var(--spira-white)' }}>
              {/* Fila: el control del tilde a la izquierda y la píldora de reportes al final del
                  MISMO renglón. La píldora va afuera del botón —no adentro— porque un botón no
                  puede anidar a otro; por eso son hermanos en un flex y no padre/hijo. Antes la
                  píldora caía a un renglón propio debajo, que es el salto que se veía. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {readOnly ? (
                <div style={{ ...rowBase, flex: 1, minWidth: 0 }}>{row}</div>
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
                  onClick={alTildar}
                  style={{ ...rowBase, flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--spira-font-text)' }}
                >
                  {row}
                </button>
              )}

              {/* La píldora comparte renglón con el nombre y se centra con él y con el tilde: el
                  `alignItems: center` del flex lo resuelve solo, sin ningún desplazamiento a mano.
                  Los `marginTop` calculados que había acá se fueron con el cambio a centrado — un
                  offset fijo y un centrado automático se pelean, y gana el que no se ve. */}
              {misReportes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAbiertos((s) => {
                    const c = new Set(s)
                    if (c.has(p.procedure_id)) c.delete(p.procedure_id); else c.add(p.procedure_id)
                    return c
                  })}
                  aria-expanded={abierto}
                  aria-label={`${misReportes.length === 1 ? 'Un reporte' : misReportes.length + ' reportes'} de ${p.name}`}
                  className="spira-no-press"
                  style={{ ...pillReportes(abierto, accent), marginRight: 13, flex: '0 0 auto' }}
                >
                  <Icon name="fileText" size={12} color={accent} />
                  {misReportes.length} {misReportes.length === 1 ? 'reporte' : 'reportes'}
                  <Icon name="chevronDown" size={12} color="var(--spira-muted)" style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s var(--spira-ease-out)' }} />
                </button>
              )}
              </div>

              {/* Desglose. Se despliega con alto animado (`.spira-disclosure`) y se renderiza
                  SIEMPRE: si sólo existiera al abrirlo, no habría desde dónde animar y aparecería
                  de golpe. Sangrado hasta la columna del texto (13 de padding + 20 del tilde + 12
                  del gap), no bajo el tilde. */}
              {misReportes.length > 0 && (
                <div className="spira-disclosure" data-abierto={abierto}>
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 13px 11px 45px' }}>
                      {!isDone && (
                        <div style={avisoHabilita}>Se habilita al marcar el procedimiento como realizado.</div>
                      )}
                      {misReportes.map((r, i) => (
                        <ReportCard
                          key={r.report_definition_id}
                          row={r}
                          variante="visita"
                          primero={i === 0}
                          canOperate={!readOnly && r.completed}
                          busy={movingReport === r.report_definition_id}
                          onStage={(s) => void moverReporte(r, s)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Circuito de reporte LEGACY (0064): el tilde único "reporte descargado". Sobrevive
                  sólo para los procedimientos que todavía no tienen reportes definidos en el
                  estudio — mientras se migran, las dos formas conviven sin pisarse. Se va entero
                  con la 0091, junto con la columna `has_report` que lo alimenta. */}
              {p.has_report && misReportes.length === 0 && isDone && (
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
    </ProceduresPanel>
  )
}

/** La card de la sección. Existe para no repetir rótulo, ícono y acento en los cuatro estados
 *  (cargando / error / sin procedimientos / lista). */
function ProceduresPanel({ accent, aside, children }: { accent: string; aside?: ReactNode; children: ReactNode }) {
  return <Panel title="Procedimientos" icon="clipboardCheck" accent={accent} aside={aside}>{children}</Panel>
}

/**
 * Fila: tilde, bloque de texto y píldora CENTRADOS entre sí en altura.
 *
 * Antes el tilde y la píldora se anclaban a la primera línea del nombre. Se revirtió por pedido
 * del Director (2026-08-24): con el bloque de dos renglones —nombre + categoría, que se leen como
 * una sola unidad— el anclaje arriba dejaba los tres elementos a alturas distintas y la fila se
 * veía desprolija. Centrado, los tres comparten eje.
 *
 * El costo, asumido: si el nombre envolviera a tres o más renglones en una pantalla muy angosta,
 * el tilde y la píldora quedan a la mitad del párrafo en vez de arriba. Con dos renglones —que es
 * el caso real— centrar se ve mejor.
 */
const rowBase: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
}

/**
 * Cuadrito del tilde. Vacío: borde `muted` (el `line-2` de los inputs queda en 1.9:1 sobre blanco —
 * por debajo del 3:1 que WCAG pide para el contorno de un control, y hacía que el salto al relleno
 * pareciera aparecer de la nada). Relleno: acento del módulo, con el tilde en papel (4.3:1).
 */
function tickBox(isDone: boolean, accent: string): CSSProperties {
  return {
    flex: '0 0 auto', width: 20, height: 20, borderRadius: 6,
    display: 'grid', placeItems: 'center',
    border: `1.5px solid ${isDone ? accent : 'var(--spira-muted)'}`,
    background: isDone ? accent : 'transparent',
  }
}

/** Píldora "N reportes": el disparador del desglose. Abierta = tinte del acento, como toda
 *  selección en esta app; cerrada = contorno sobrio para no competir con el tilde de la fila. */
function pillReportes(abierto: boolean, accent: string): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
    borderRadius: 'var(--spira-radius-pill)',
    borderWidth: 1, borderStyle: 'solid', borderColor: abierto ? accent : 'var(--spira-line-2)',
    background: abierto ? accent + '14' : 'var(--spira-white)',
    color: 'var(--spira-ink)', fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  }
}

/** Aviso de que el desglose todavía no opera. Se muestra al desplegar ANTES de tildar. */
const avisoHabilita: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  borderRadius: 9, padding: '8px 11px', lineHeight: 1.45,
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
