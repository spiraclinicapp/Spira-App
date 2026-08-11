import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { formatDateAR } from '../../lib/dates'
import {
  usePatientMedications,
  useVisitDispensations,
  createDispensationRequest,
  addDispensationItems,
  cancelDispensationRequest,
  columnOf,
  constanciaVigente,
  uploadIpDocument,
} from '../../data/pharma'
import type { DispensationRequestRow, IpDocumentRow } from '../../data/pharma'
import { badgeOf } from './dispensaciones/estados'
import { Panel } from '../track/Panel'
import { ConstanciaDropzone, ConstanciaVista } from './ConstanciaIp'

// Tintes con rgba() literal (no se puede concatenar alfa a un var(--x)). --spira-danger #A6483B,
// --spira-good #5C8A5A, --spira-warn #B0823F.
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
// Dos alfas del mismo ámbar: .14 para el aviso "Falta la constancia" (texto en tinta, ver `warnBox`),
// .20 para la píldora "Incompleta" del pie (más saturada porque ahí el color SÍ es la etiqueta).
const WARN_TINT = 'rgba(176, 130, 63, 0.14)'
const WARN_TINT_PILL = 'rgba(176, 130, 63, 0.20)'

// STATUS_META y badgeOf viven en dispensaciones/estados.ts (única fuente para Track y Pharma).
// badgeOf distingue "lista para retirar" de "entregada": para RequestStatus ambas son `atendida`,
// pero para la coordinadora son cosas distintas (una la puede ir a buscar el paciente).

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-danger)', background: DANGER_TINT, borderRadius: 8, padding: '8px 11px', marginBottom: 10,
}
const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }

/** Rótulo de subsección: `ink-soft`, no el `faint` del `.spira-eyebrow` — ese da 2,1:1 sobre
 *  `surface` y acá es la división PRIMARIA de la tarjeta (concomitante vs. IP), no una nota al pie. */
const subLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)',
}

/** Una subsección de la tarjeta partida. El filete separa; no hay cajas anidadas (mock v6, §2). */
function Sub({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div style={first ? undefined : { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)' }}>
      <div style={{ ...subLabel, marginBottom: 9 }}>{label}</div>
      {children}
    </div>
  )
}

/** Renglón de medicación del pedido ABIERTO: fila plana con su propio borde (mock `.item`), sin la
 *  card completa que sí usan las cerradas (`renderCard`) — esas cards traen fecha/estado/cancelar
 *  propios, que acá duplicarían el pie común de abajo. */
const itemRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 12px',
  border: '1px solid var(--spira-line)', borderRadius: 11, background: 'var(--spira-white)',
}

/** Aviso "Falta la constancia": texto en TINTA, el ámbar queda solo en el ícono y el fondo
 *  (`--spira-warn` a 12,5px bold sobre este tinte da 3,2:1; AA pide 4,5:1 — medido en el mock). */
const warnBox: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 10,
  background: WARN_TINT, fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600, marginBottom: 9,
}

const footStyle: CSSProperties = {
  marginTop: 14, paddingTop: 11, borderTop: '1px solid var(--spira-line)',
  display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
}
const pillBase: CSSProperties = {
  flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)',
}
const linkBtn: CSSProperties = {
  marginLeft: 'auto', background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-muted)',
}
const dashedBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 44,
  borderRadius: 12, border: '1px dashed var(--spira-line-2)', background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)',
}

interface PendingItem { medication_id: string; name: string; quantity: number }

/**
 * Panel "Dispensación" del detalle de visita (Track), partido en dos subsecciones que alimentan
 * UN solo pedido (handoff `design_handoff_dispensacion_ip/`, migración 0071):
 *
 *   · Medicación concomitante — el coordinador arma renglones eligiendo SOLO de la medicación
 *     habilitada ACTIVA del paciente (`patient_medications`, 0050), nunca texto libre.
 *   · Producto en investigación (IP) — si el cronograma dice que la visita entrega IP
 *     (`dispenses_ip`), se adjunta la constancia del IRT (`dispensation_ip_documents`).
 *
 * El PRIMERO que actúa crea el pedido (`create_dispensation_request`); el segundo se suma al mismo,
 * en CUALQUIERA de los dos órdenes: `cargarConstancia` y `solicit` reusan los dos el mismo
 * `openReqs[0]`, la constancia vía `attach_ip_document` y la medicación vía `addDispensationItems`
 * (0072). Un pedido de solo IP nace sin renglones — es el caso típico de una visita de protocolo que
 * no entrega concomitante.
 *
 * Monta su PROPIO `Panel` (como `VisitProcedures`): el realce (carta teñida) depende de si hay algo
 * que dispensar —concomitante O IP—, y eso solo lo sabe este componente. Se apaga si no hay nada
 * (una tarjeta sin trabajo no debería llamar la atención). `deepAccent` es obligatorio junto con
 * `highlight`: sin él el título queda en el acento a secas, que sobre el tinte no llega al 4,5:1
 * que AA pide a 14px bold.
 *
 * El PIE COMÚN (fecha del pedido + estado + "Cancelar solicitud") va una sola vez, abajo de las dos
 * subsecciones: es lo que hace visible que arriba hay UN pedido y no dos. Por eso los renglones de
 * medicación del pedido abierto NO se muestran con la card completa de `renderCard` —esa card trae
 * su propia fecha/estado/cancelar y los duplicaría—, sino como filas planas (`itemRow`); la card
 * completa se reserva para el HISTORIAL (pedidos cerrados: entregados/cancelados/rechazados), que sí
 * son pedidos aparte con su propio desenlace.
 *
 * Solicitar / cancelar / cargar constancia viven solo en la vista del día (`!readOnly`); en la ficha
 * del paciente el panel es de solo lectura (la constancia se puede VER, no reemplazar).
 */
export function VisitDispensationPanel({ visit, accent, readOnly }: {
  visit: { id: string; enrollment_id: string; protocol_id: string; dispenses: boolean; dispenses_ip: boolean }
  accent: string
  readOnly: boolean
}) {
  const reqQ = useVisitDispensations(visit.id)
  const medsQ = usePatientMedications(visit.enrollment_id)
  const [soliciting, setSoliciting] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('')
  const [items, setItems] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Cerradas (entregadas/canceladas/rechazadas): se muestran las 2 más recientes y el resto queda
  // tras "ver más". En un paciente de meses el historial es un chorizo y entierra lo accionable.
  const [showAllClosed, setShowAllClosed] = useState(false)
  // Constancia de IP: `subiendo` deshabilita el dropzone mientras sube; `reemplazando` reabre el
  // dropzone sobre una constancia YA cargada (botón "Reemplazar" de `ConstanciaVista`).
  const [subiendo, setSubiendo] = useState(false)
  const [reemplazando, setReemplazando] = useState(false)

  const requests = reqQ.data ?? []
  // Abiertas = todavía accionables (solicitada / preparando / lista para retirar); van siempre
  // arriba. Cerradas = entregada / cancelada / rechazada; se pliegan a las 2 más recientes.
  // `columnOf` devuelve null para cancelada/rechazada y 'entregada' para las ya retiradas.
  const openReqs = requests.filter((r) => {
    const col = columnOf(r)
    return col === 'solicitada' || col === 'preparando' || col === 'lista'
  })
  const closedReqs = requests.filter((r) => !openReqs.includes(r))
  const visibleClosed = showAllClosed ? closedReqs : closedReqs.slice(0, 2)
  const hiddenClosed = closedReqs.length - visibleClosed.length
  const activeMeds = (medsQ.data ?? []).filter((m) => m.active)
  const pendingIds = new Set(items.map((i) => i.medication_id))
  // Ofrecer solo la medicación habilitada activa que todavía no esté en la lista de esta solicitud.
  const options: SelectOption[] = activeMeds
    .filter((m) => !pendingIds.has(m.medication_id))
    .map((m) => ({ value: m.medication_id, label: m.medication?.name ?? 'Medicamento' }))

  // "El pedido" que sostiene el pie común: el mismo `openReqs[0]` que reusa `cargarConstancia`. En
  // el caso normal hay a lo sumo un abierto; si por algún motivo hubiera dos (nada lo impide a nivel
  // de base), el pie se apoya en el más nuevo — una simplificación consciente, ver el informe de la
  // tarea.
  const openReq = openReqs[0] ?? null
  // Renglones de medicación de TODOS los pedidos abiertos (no solo `openReq`): así ningún renglón
  // queda oculto si llegara a haber más de uno.
  const openMedItems = openReqs.flatMap((r) => r.items)
  // La constancia vigente puede vivir en cualquiera de los abiertos, no necesariamente en el más
  // nuevo. Desde la 0072 los dos caminos se suman al mismo pedido, así que en la práctica hay uno
  // solo; pero los pedidos partidos que quedaron de antes —y los que Pharma dé de alta por su
  // cuenta— siguen existiendo, y la constancia no tiene por qué estar en el último.
  const constancia: IpDocumentRow | null = openReqs.reduce<IpDocumentRow | null>(
    (found, r) => found ?? constanciaVigente(r), null,
  )
  const constanciaIncompleta = visit.dispenses_ip && openReqs.length > 0 && !constancia

  function addItem() {
    const n = parseInt(qty, 10)
    if (!pick || !Number.isFinite(n) || n <= 0) return
    const med = activeMeds.find((m) => m.medication_id === pick)
    setItems((xs) => [...xs, { medication_id: pick, name: med?.medication?.name ?? 'Medicamento', quantity: n }])
    setPick(''); setQty('')
  }

  /**
   * El primero que actúa crea el pedido; el segundo se suma al mismo — igual que `cargarConstancia`,
   * y por el mismo `openReqs[0]`. Hasta la 0072 esta función SIEMPRE creaba un pedido nuevo, así que
   * cargar la constancia primero y agregar medicación después dejaba la visita con dos pedidos: dos
   * tarjetas en el tablero de Farmacia y dos comprobantes para el mismo hecho.
   *
   * Si Farmacia ya tomó el pedido abierto, `addDispensationItems` NO crea uno nuevo por su cuenta:
   * devuelve el mensaje sereno de la base ("cancelá la preparación para sumarla"). Es a propósito —
   * crear un segundo pedido ahí es exactamente lo que esta tarea vino a evitar, y la decisión de
   * partir el pedido tiene que ser de una persona, no un efecto lateral de un botón.
   */
  async function solicit() {
    if (!items.length) return
    setBusy(true); setErr(null)
    const payload = items.map((i) => ({ medication_id: i.medication_id, quantity: i.quantity }))
    const abierto = openReqs[0] ?? null
    const res = abierto
      ? await addDispensationItems(abierto.id, payload)
      : await createDispensationRequest(visit.id, payload, null)
    setBusy(false)
    if (res.error) { setErr(res.error); return }
    setItems([]); setSoliciting(false); reqQ.refetch()
  }

  async function cancel(requestId: string) {
    setErr(null)
    const res = await cancelDispensationRequest(requestId)
    if (res.error) { setErr(res.error); return }
    reqQ.refetch()
  }

  /**
   * El primero que actúa crea el pedido; el segundo se suma al mismo. Si no hay pedido abierto,
   * cargar la constancia lo crea (sin renglones, que es el caso típico del IP solo).
   */
  async function cargarConstancia(f: File) {
    setSubiendo(true); setErr(null)
    let requestId = openReqs[0]?.id ?? null
    if (!requestId) {
      const res = await createDispensationRequest(visit.id, [], null, 'track')
      if (res.error) { setErr(res.error); setSubiendo(false); return }
      requestId = res.id!
    }
    const up = await uploadIpDocument(requestId, visit.protocol_id, f)
    setSubiendo(false)
    if (up.error) { setErr(up.error); return }
    setReemplazando(false)
    reqQ.refetch()
  }

  function renderCard(r: DispensationRequestRow) {
    const meta = badgeOf(r)
    const disp = r.dispensations?.[0] ?? null
    return (
      <div key={r.id} style={{ border: '1px solid var(--spira-line)', borderRadius: 11, background: 'var(--spira-white)', padding: '11px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-muted)' }}>{formatDateAR(r.created_at)}</span>
          <span style={{ marginLeft: 'auto', flex: '0 0 auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--spira-radius-pill)', color: meta.color, background: meta.tint }}>
            {meta.label}
          </span>
        </div>
        {r.items.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '2px 0' }}>
            <span style={{ color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.medication?.name ?? 'Medicamento'}</span>
            <span className="spira-mono" style={{ color: 'var(--spira-muted)', flex: '0 0 auto' }}>x{it.quantity}</span>
          </div>
        ))}
        {r.status === 'rechazada' && r.rejection_reason && (
          <div style={{ ...muted, marginTop: 6 }}>Motivo: {r.rejection_reason}</div>
        )}
        {disp && (
          <div style={{ ...muted, marginTop: 6 }}>Comprobante N° <span className="spira-mono">{disp.correlative_number}</span></div>
        )}
        {r.status === 'solicitada' && !readOnly && (
          <button
            type="button" onClick={() => cancel(r.id)}
            style={{ marginTop: 10, height: 32, padding: '0 12px', borderRadius: 9, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-muted)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5 }}
          >
            Cancelar solicitud
          </button>
        )}
      </div>
    )
  }

  const nada = !visit.dispenses && !visit.dispenses_ip

  return (
    <Panel
      title="Dispensación" icon="pill" accent={accent}
      highlight={visit.dispenses || visit.dispenses_ip}
      deepAccent="var(--spira-acc-deep-track)"
    >
      {nada ? (
        // Tarea 9 suma acá la salida "Dispensar fuera de cronograma" (mock, estado 5).
        <div style={{ fontSize: 12.5, color: 'var(--spira-faint)', padding: '4px 0' }}>Esta visita no entrega medicación.</div>
      ) : (
        <>
          {err && <div style={errBox}>{err}</div>}

          {visit.dispenses && (
            <Sub label="Medicación concomitante" first>
              {openMedItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                  {openMedItems.map((it) => (
                    <div key={it.id} style={itemRow}>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {it.medication?.name ?? 'Medicamento'}
                      </span>
                      <span className="spira-mono" style={{ color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>x{it.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* historial (pedidos cerrados): sin cambios de comportamiento, misma card de siempre —
                  esos sí son pedidos aparte, con su propio desenlace, y merecen su fecha/estado propios. */}
              {closedReqs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {openMedItems.length > 0 && (
                    <div className="spira-eyebrow" style={{ marginTop: 2 }}>Historial</div>
                  )}
                  {visibleClosed.map(renderCard)}
                  {(hiddenClosed > 0 || showAllClosed) && closedReqs.length > 2 && (
                    <button
                      type="button" onClick={() => setShowAllClosed((v) => !v)}
                      style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5, color: 'var(--spira-muted)' }}
                    >
                      {showAllClosed ? 'Ver menos' : `Ver ${hiddenClosed} más`}
                    </button>
                  )}
                </div>
              )}

              {readOnly && requests.length === 0 && !reqQ.loading && (
                <div style={{ ...muted, padding: '2px 0' }}>Sin dispensación solicitada.</div>
              )}

              {/* agregar (solo vista del día): ya no solicita por su cuenta, suma renglones al pedido */}
              {!readOnly && !soliciting && (
                <button
                  type="button" onClick={() => { setSoliciting(true); setErr(null) }}
                  style={dashedBtn}
                >
                  <Icon name="plus" size={16} color={accent} /> Agregar medicación
                </button>
              )}

              {!readOnly && soliciting && (
                <div style={{ border: '1px solid var(--spira-line-2)', borderRadius: 12, background: 'var(--spira-white)', padding: 13 }}>
                  {activeMeds.length === 0 ? (
                    <div style={muted}>
                      Este paciente no tiene medicación habilitada. La farmacéutica tiene que asignarla primero (en la ficha del paciente).
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SearchableSelect
                            value={pick}
                            onChange={setPick}
                            options={options}
                            placeholder={options.length ? 'Medicamento…' : 'No queda medicación para agregar'}
                            searchPlaceholder="Buscar…"
                            disabled={options.length === 0}
                          />
                        </div>
                        <input
                          type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant."
                          style={{ width: 74, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', padding: '0 12px', fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)' }}
                        />
                        <button
                          type="button" onClick={addItem} disabled={!pick || !qty}
                          style={{ height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: !pick || !qty ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, opacity: !pick || !qty ? 0.6 : 1 }}
                        >
                          Agregar
                        </button>
                      </div>

                      {items.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                          {items.map((it, i) => (
                            <div key={it.medication_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: 'var(--spira-surface)', borderRadius: 9, padding: '7px 11px' }}>
                              <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                              <span className="spira-mono" style={{ color: 'var(--spira-muted)' }}>x{it.quantity}</span>
                              <button
                                type="button" aria-label="Quitar" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                                style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
                              >
                                <Icon name="x" size={15} color="var(--spira-faint)" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                    <button
                      type="button" onClick={() => { setSoliciting(false); setItems([]); setPick(''); setQty(''); setErr(null) }}
                      style={{ height: 40, padding: '0 16px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5 }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button" onClick={solicit} disabled={!items.length || busy}
                      style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: items.length ? accent : 'var(--spira-line)', color: items.length ? 'var(--spira-on-accent)' : 'var(--spira-faint)', cursor: items.length && !busy ? 'pointer' : 'default', fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 13.5, opacity: busy ? 0.6 : 1 }}
                    >
                      {busy ? 'Solicitando…' : 'Solicitar dispensación'}
                    </button>
                  </div>
                </div>
              )}
            </Sub>
          )}

          {visit.dispenses_ip && (
            <Sub label="Producto en investigación" first={!visit.dispenses}>
              {constanciaIncompleta && (
                <div style={warnBox}>
                  <Icon name="alert" size={15} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
                  <div>
                    Falta la constancia
                    <span style={{ display: 'block', color: 'var(--spira-ink-soft)', fontWeight: 400, marginTop: 2 }}>
                      Farmacia no puede emitir el comprobante hasta que esté cargada.
                    </span>
                  </div>
                </div>
              )}

              {readOnly ? (
                constancia ? (
                  <ConstanciaVista doc={constancia} size="chica" accent={accent} />
                ) : (
                  <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
                )
              ) : constancia && !reemplazando ? (
                <ConstanciaVista doc={constancia} size="chica" accent={accent} onReemplazar={() => setReemplazando(true)} />
              ) : (
                <ConstanciaDropzone accent={accent} busy={subiendo} onFile={cargarConstancia} />
              )}
            </Sub>
          )}

          {/* pie común: fecha + estado + cancelar, UNA sola vez — es lo que dice que arriba hay un
              pedido y no dos (ver el comentario de cabecera). */}
          {openReq && (
            <div style={footStyle}>
              <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>Pedido del {formatDateAR(openReq.created_at)}</span>
              {constanciaIncompleta ? (
                // "Incompleta" pisa el badge normal: falta la constancia importa más que si la
                // solicitud sigue 'solicitada' o ya pasó a 'preparando'. Color en `--spira-warn` a
                // secas (no el ámbar profundo del mock): mismo criterio que ya usa STATUS_META para
                // el badge "Solicitada" en esta misma app — no se inventa un tono nuevo por tarjeta.
                <span style={{ ...pillBase, color: 'var(--spira-warn)', background: WARN_TINT_PILL }}>Incompleta</span>
              ) : (
                <span style={{ ...pillBase, color: badgeOf(openReq).color, background: badgeOf(openReq).tint }}>{badgeOf(openReq).label}</span>
              )}
              {!readOnly && openReq.status === 'solicitada' && (
                <button type="button" onClick={() => cancel(openReq.id)} style={linkBtn}>Cancelar solicitud</button>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
