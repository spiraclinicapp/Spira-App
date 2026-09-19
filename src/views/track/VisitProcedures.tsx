import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { Panel } from './Panel'
import { useVisitProcedureStatus, toggleVisitProcedure } from '../../data/procedures'
import type { VisitProcedureStatus } from '../../data/procedures'
import { useVisitReportStatus, setReportStage } from '../../data/reportStatus'
import type { ReportStatusRow } from '../../data/reportStatus'
import { canUntickProcedure, pildoraDeReportes } from './reportes/estados'
import type { ReportStage } from './reportes/estados'
import { ReportCard } from './reportes/ReportCard'
import { useVisitIpStatus } from '../../data/visitIp'
import { IpDeliveryRow } from './IpDeliveryRow'
import { cuentaIp } from './ipEstado'

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
 * tildable ("realizado"). Los que definen reportes en el estudio (0089) muestran la píldora
 * "N reportes", que despliega el desglose con su etapa. Siempre visible (no espera Atendida).
 * readOnly = ficha.
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
export function VisitProcedures({ visitId, visitDefId, accent, readOnly, terminada }: {
  visitId: string
  visitDefId: string | null
  accent: string
  readOnly: boolean
  /** Fin de atención puesto (`ready_at`): la fila del IP dice lo pendiente como pendiente (spec 2026-09-19). */
  terminada: boolean
}) {
  const { data, loading, error, refetch } = useVisitProcedureStatus(visitId, visitDefId)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [optDone, setOptDone] = useState<Record<string, boolean>>({})

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
  }, [data])

  /* La entrega del producto en investigación (0119, D1): va PRIMERA y en los cuatro estados del
     panel. No sale de `useVisitProcedureStatus` a propósito — ese hook corta en seco cuando la visita
     no tiene procedimientos del cronograma (procedures.ts:171 y :184), y una V con IP y sin otros
     procedimientos se quedaría sin su fila. `null` = la visita no lleva IP. */
  const ipQ = useVisitIpStatus(visitId)
  const ip = ipQ.data
  const ipRow = ip
    ? <IpDeliveryRow row={ip} accent={accent} readOnly={readOnly} terminada={terminada} />
    : null
  const ipCuenta = ip ? cuentaIp(ip.estado) : { total: 0, hecho: 0 }

  /* AL VOLVER A LA PESTAÑA, se releen procedimientos, reportes y el estado del IP.
     Los procedimientos de una visita NO son una copia: salen de `protocol_activities` por
     `visit_def_id`, o sea del cuadro del estudio, que se edita en otra pantalla. Abrir el modal ya
     los trae frescos, pero con la visita YA abierta —y el cuadro editado en otra ventana o en otra
     sesión— la pantalla se quedaba mostrando la lista vieja sin ninguna señal (Director, 2026-09-15).
     Volver a la pestaña es el momento exacto en que alguien espera ver lo que acaba de cambiar.
     El refetch es estable (`useCallback` en `useSupabaseQuery`), así que el efecto se engancha una
     sola vez; y mientras llega el dato, las filas viejas siguen visibles (no parpadea a "Cargando…"). */
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState !== 'visible') return
      refetch()
      reportes.refetch()
      ipQ.refetch()
    }
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [refetch, reportes.refetch, ipQ.refetch])

  const items = data ?? []
  // Sin procedimientos asignados → se DICE, no se calla. Antes devolvía null: como en la ficha el
  // componente va dentro de un `Panel` que el padre ya pintó, el "no mostrar nada" dejaba un cuadro
  // "Procedimientos" vacío que se lee como bug (reporte del Director, 2026-08-06). Mismo criterio
  // que Dispensación ("Esta visita no entrega medicación"): el vacío explicado.
  if (!loading && !error && items.length === 0) {
    return (
      <ProceduresPanel
        accent={accent}
        aside={ipCuenta.total > 0 ? <Contador done={ipCuenta.hecho} total={ipCuenta.total} /> : undefined}
      >
        {ipRow && <div style={{ marginBottom: 10 }}>{ipRow}</div>}
        <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', padding: '4px 0' }}>
          {visitDefId
            ? `Esta visita no tiene ${ipRow ? 'otros ' : ''}procedimientos asignados. Se asignan por visita en el cronograma del protocolo.`
            : `Las visitas sueltas no tienen ${ipRow ? 'otros ' : ''}procedimientos del cuadro.`}
        </div>
      </ProceduresPanel>
    )
  }

  const doneOf = (p: VisitProcedureStatus) => optDone[p.procedure_id] ?? p.completed

  async function run(procedureId: string, next: boolean, call: () => Promise<{ error: string | null }>) {
    if (pending.has(procedureId)) return
    setActionError(null)
    setPending((s) => new Set(s).add(procedureId))
    setOptDone((o) => ({ ...o, [procedureId]: next }))
    const { error: err } = await call()
    setPending((s) => { const c = new Set(s); c.delete(procedureId); return c })
    if (err) {
      setOptDone((o) => { const c = { ...o }; delete c[procedureId]; return c })
      setActionError(err)
      return
    }
    refetch() // el optimismo lo suelta el efecto de arriba, cuando llega el dato fresco
    /* Y los REPORTES, que son otra consulta (`report_status`, 0090) y dependen de esta marca: su
       plazo arranca cuando el procedimiento se da por realizado. Sin esto, el desglose seguía
       diciendo «Se habilita al marcar el procedimiento como realizado» debajo de un tilde recién
       puesto (Director, 2026-09-15) — y al revés: desmarcar dejaba el plazo corriendo en pantalla.
       El tilde se veía al instante porque es optimista; el bloque de abajo se quedaba en el pasado. */
    reportes.refetch()
  }

  if (loading) {
    return (
      <ProceduresPanel accent={accent}>
        {ipRow && <div style={{ marginBottom: 10 }}>{ipRow}</div>}
        <div style={{ padding: '2px 0', fontSize: 13, color: 'var(--spira-muted)' }}>Cargando procedimientos…</div>
      </ProceduresPanel>
    )
  }
  if (error) {
    return (
      <ProceduresPanel accent={accent}>
        {ipRow && <div style={{ marginBottom: 10 }}>{ipRow}</div>}
        <div style={{ padding: '2px 0', fontSize: 13, color: 'var(--spira-acc-deep-danger)' }}>No se pudieron cargar los procedimientos: {error}</div>
      </ProceduresPanel>
    )
  }

  const done = items.filter((p) => doneOf(p)).length + ipCuenta.hecho

  return (
    <ProceduresPanel
      accent={accent}
      aside={<Contador done={done} total={items.length + ipCuenta.total} />}
    >
      {actionError && <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>{actionError}</div>}
      {ipQ.error && <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--spira-acc-deep-danger)' }}>No se pudo cargar la entrega del producto en investigación: {ipQ.error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ipRow}
        {items.map((p) => {
          const isDone = doneOf(p)
          /** Los reportes definidos para este procedimiento en este estudio (0089). */
          const misReportes = porProcedimiento.get(p.procedure_id) ?? []
          const abierto = abiertos.has(p.procedure_id)
          /** Texto y tono de la píldora (`pildoraDeReportes`). Null = el procedimiento no define reportes. */
          const pildora = misReportes.length > 0 ? pildoraDeReportes(misReportes) : null
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
            run(p.procedure_id, !isDone, () => toggleVisitProcedure(visitId, p.procedure_id, !isDone))
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
              {pildora && (
                <button
                  type="button"
                  onClick={() => setAbiertos((s) => {
                    const c = new Set(s)
                    if (c.has(p.procedure_id)) c.delete(p.procedure_id); else c.add(p.procedure_id)
                    return c
                  })}
                  aria-expanded={abierto}
                  aria-label={`${pildora.texto}${pildora.tono === 'vencido' ? ', alguno vencido,' : ''} de ${p.name}`}
                  title={pildora.tono === 'vencido' ? 'Hay reportes con el plazo vencido' : undefined}
                  className="spira-no-press"
                  style={{ ...pillReportes(abierto, pildora.tono), marginRight: 13, flex: '0 0 auto' }}
                >
                  <Icon name="fileText" size={12} color={pildora.tono === 'neutro' ? accent : TONO_PILDORA[pildora.tono].texto} />
                  {pildora.texto}
                  <Icon name="chevronDown" size={12} color={pildora.tono === 'neutro' ? 'var(--spira-muted)' : TONO_PILDORA[pildora.tono].texto} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s var(--spira-ease-out)' }} />
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

/** "n/total realizados". La entrega del IP suma como un procedimiento más (ver `cuentaIp`). */
function Contador({ done, total }: { done: number; total: number }) {
  return (
    <span style={{ fontSize: 12.5, color: 'var(--spira-muted)', fontVariantNumeric: 'tabular-nums' }}>
      {done}/{total} realizados
    </span>
  )
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

/**
 * Píldora "N reportes": el disparador del desglose.
 *
 * Abierta = ELEVADA (sombra), cerrada = al ras. Antes abierta se teñía con el acento y tomaba borde
 * verde; el Director lo cambió (2026-08-24) por el mismo criterio con el que se fue el recuadro de
 * la fila. El borde es el mismo en los dos estados: lo que cambia es la altura.
 *
 * NEUTRA (nada por hacer): cerrada va con fondo transparente y no blanco, para que herede el de su
 * fila —papel si está realizada, blanco si no— y el salto al abrirse se lea como que la píldora se
 * despega, en vez de como un cambio de color.
 *
 * CON PENDIENTES es una etiqueta tinte, abierta o cerrada (Director, 2026-09-16): el color acá es
 * SIGNIFICADO —hay trabajo por hacer, o se pasó el plazo—, que es para lo que la casa lo reserva. El
 * abrirse lo sigue diciendo la sombra, no el color. Ver `TONO_PILDORA` para por qué el tinte es opaco.
 */
function pillReportes(abierto: boolean, tono: 'neutro' | 'pendiente' | 'vencido'): CSSProperties {
  const tinte = tono === 'neutro' ? null : TONO_PILDORA[tono]
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
    borderRadius: 'var(--spira-radius-pill)',
    borderWidth: 1, borderStyle: 'solid', borderColor: tinte ? tinte.borde : 'var(--spira-line-2)',
    background: tinte ? tinte.fondo : abierto ? 'var(--spira-white)' : 'transparent',
    boxShadow: abierto ? 'var(--spira-shadow-sm)' : 'none',
    color: tinte ? tinte.texto : 'var(--spira-ink)',
    fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'box-shadow .14s var(--spira-ease-out), background-color .14s var(--spira-ease-out)',
  }
}

/**
 * Los dos tonos de la píldora con pendientes. El texto sale de `--spira-acc-deep-*` (los únicos
 * acentos con versión para el tema oscuro, ver `MotivoChip`) y el tinte, del hex crudo.
 *
 * EL TINTE ES OPACO —mezclado contra `--spira-white`— y no un hex con alfa, MEDIDO: una píldora con
 * pendientes vive casi siempre sobre una fila REALIZADA, que es papel, y el rojo al 10 % transparente
 * sobre papel da 4,50:1 justo en el borde del AA (12px/600 es texto normal) y al 16 % cae a 4,13. Contra
 * blanco no depende de la fila: al 12 % da ~4,9:1 el rojo y ~6,1:1 el ámbar en claro, y más de 7:1 los
 * dos en oscuro. Y de paso la etiqueta se despega del papel, que es lo que la hace leerse como tal.
 */
const TONO_PILDORA: Record<'pendiente' | 'vencido', { texto: string; fondo: string; borde: string }> = {
  pendiente: {
    texto: 'var(--spira-acc-deep-warn)',
    fondo: 'color-mix(in srgb, #B0823F 12%, var(--spira-white))',
    borde: 'color-mix(in srgb, #B0823F 30%, var(--spira-white))',
  },
  vencido: {
    texto: 'var(--spira-acc-deep-danger)',
    fondo: 'color-mix(in srgb, #A6483B 12%, var(--spira-white))',
    borde: 'color-mix(in srgb, #A6483B 30%, var(--spira-white))',
  },
}

/** Aviso de que el desglose todavía no opera. Se muestra al desplegar ANTES de tildar. */
const avisoHabilita: CSSProperties = {
  fontSize: 11.5, color: 'var(--spira-muted)', background: 'var(--spira-surface)',
  borderRadius: 9, padding: '8px 11px', lineHeight: 1.45,
}
