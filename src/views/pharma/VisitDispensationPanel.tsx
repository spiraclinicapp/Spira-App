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
  activeDispensation,
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
// .20 para la píldora "Incompleta" del pie (más saturada porque ahí el color SÍ es la etiqueta —
// por eso la tinta de esa píldora es el ámbar PROFUNDO de tokens y no `--spira-warn`, ver el pie).
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
/** Desenlace de un pedido YA cerrado, dentro de la subsección de IP: el mismo renglón del pie común
 *  (fecha · estado · comprobante) pero sin el filete, porque no cierra la tarjeta sino la sección. */
const desenlaceStyle: CSSProperties = {
  marginTop: 9, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
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
 *   · Producto en investigación (IP) — si la visita entrega IP, se adjunta la constancia del IRT
 *     (`dispensation_ip_documents`). "Entrega IP" es el cronograma (`dispenses_ip`) O el pedido
 *     abierto con `includes_ip` sellado por el servidor: el cronograma puede cambiar después de
 *     creado el pedido, y el pedido recuerda lo que era cierto cuando se pidió (0071).
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
 *
 * Con el pedido YA CERRADO —entregado— la subsección de IP también pasa a lectura aunque estemos en
 * la vista del día: la constancia es nota fuente de un hecho consumado, y en su lugar va el
 * desenlace (fecha · estado · comprobante). Ofrecer ahí el dropzone crearía un segundo pedido para
 * una visita ya dispensada, que es exactamente lo que la 0072 vino a evitar del otro lado.
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

  // "El pedido" que sostiene el pie común: el mismo `openReqs[0]` que reusa `cargarConstancia`. En
  // el caso normal hay a lo sumo un abierto; si por algún motivo hubiera dos (nada lo impide a nivel
  // de base), el pie se apoya en el más nuevo — una simplificación consciente, ver el informe de la
  // tarea.
  const openReq = openReqs[0] ?? null
  // Renglones de medicación de TODOS los pedidos abiertos (no solo `openReq`): así ningún renglón
  // queda oculto si llegara a haber más de uno.
  const openMedItems = openReqs.flatMap((r) => r.items)

  // Ofrecer solo la medicación habilitada activa que todavía no esté ni en la lista de esta
  // solicitud ni en el pedido ABIERTO. Lo segundo faltaba: la base no impide repetir el mismo
  // medicamento en un pedido, así que se podía cargar dos veces y quedaban dos renglones idénticos
  // —y la farmacéutica escaneando el mismo código de barras dos veces en el mostrador—.
  const yaEnPedido = new Set(openMedItems.map((it) => it.medication_id))
  const options: SelectOption[] = activeMeds
    .filter((m) => !pendingIds.has(m.medication_id) && !yaEnPedido.has(m.medication_id))
    .map((m) => ({ value: m.medication_id, label: m.medication?.name ?? 'Medicamento' }))

  /**
   * Por qué no se puede sumar medicación al pedido abierto, ESCRITO. `add_dispensation_items` (0072)
   * solo acepta el pedido en `solicitada`: desde `preparando` el cajón ya está armado y en `lista`
   * el comprobante ya salió impreso, así que un renglón nuevo quedaría fuera del papel. Ese candado
   * server-side está bien y se queda como está; lo que faltaba era avisar ANTES — hasta acá el
   * coordinador elegía medicamento y cantidad, mandaba, y recién ahí se enteraba de que no se podía.
   * Null = el botón va habilitado (mismo contrato que `readyBlockedReason` en `estados.ts`).
   */
  const agregarBloqueado: string | null =
    openReq && openReq.status !== 'solicitada'
      ? 'Farmacia ya tomó el pedido. Para sumar medicación, pedile que cancele la preparación.'
      : null

  // El N° de comprobante del pedido ABIERTO. La dispensación recién existe cuando se emite el
  // comprobante (`mark_dispensation_ready` la inserta y la deja en 'lista', 0054), así que si la
  // fila está, el número es real. Se mostraba antes —los pedidos abiertos se dibujaban con la card
  // completa del historial— y se perdió al pasarlos a filas planas: la coordinadora lo tenía a mano
  // para cantarlo cuando el paciente pasa a retirar, y dejó de tenerlo hasta después de la entrega.
  //
  // OJO con `en_preparacion`: `cancel_dispensation_preparation` (0054+0057) devuelve la solicitud a
  // 'solicitada' pero NO borra la fila de `dispensations` —la deja en 'en_preparacion', libera el
  // `dispensation_code` legible pero el `correlative_number` queda A PROPÓSITO reservado (comentario
  // de la RPC: "rehacerla no deja huecos en la numeración")—. Si acá se mostrara el correlativo
  // apenas la fila existe, el pie diría "Comprobante N° 12" junto a la píldora "Solicitada" para un
  // papel que nunca se imprimió (el stock ya se devolvió y los renglones se borraron): un número que
  // ya no vale nada, en una app auditable donde ese número es NOTA FUENTE. Por eso el filtro extra:
  // solo cuenta el comprobante cuando la dispensación salió de 'en_preparacion' de verdad ('lista' o
  // 'entregada'), que es cuando `mark_dispensation_ready` lo emitió y quedó firme.
  const dispensacionAbierta = openReq ? activeDispensation(openReq) : null
  const comprobanteAbierto =
    dispensacionAbierta && dispensacionAbierta.status !== 'en_preparacion'
      ? dispensacionAbierta.correlative_number
      : null

  // —— Producto en investigación ——
  // La sección se muestra si lo dice el CRONOGRAMA o si el pedido abierto lo tiene SELLADO. El
  // servidor sella `includes_ip` al crear el pedido justamente porque el cronograma puede cambiar
  // después (0071, índice de `supabase/README.md`). Mirando solo el cronograma, destildar
  // `dispenses_ip` con un pedido abierto que ya lleva IP hacía desaparecer la sección: sin lugar
  // donde cargar la constancia, y Farmacia trabada porque su RPC la exige para emitir el comprobante.
  const ipSellado = openReqs.some((r) => r.includes_ip)
  const mostrarIp = visit.dispenses_ip || ipSellado

  // La constancia del pedido ABIERTO. Puede vivir en cualquiera de los abiertos, no necesariamente
  // en el más nuevo: desde la 0072 los dos caminos se suman al mismo pedido, pero los pedidos
  // partidos que quedaron de antes —y los que Pharma dé de alta por su cuenta— siguen existiendo.
  const constanciaAbierta: IpDocumentRow | null = openReqs.reduce<IpDocumentRow | null>(
    (found, r) => found ?? constanciaVigente(r), null,
  )
  /**
   * La constancia del pedido ya ENTREGADO más reciente que la tenga.
   *
   * Antes la constancia se buscaba solo entre los pedidos abiertos, y la tarjeta se olvidaba de la
   * dispensación apenas Farmacia entregaba: el pedido sale de los abiertos y en una visita solo-IP
   * —el caso típico de protocolo— quedaba el dropzone VACÍO, como si nunca se hubiera cargado nada,
   * sin fecha ni estado; soltar un archivo ahí creaba un SEGUNDO pedido para una visita ya
   * dispensada; y en la ficha del paciente se imprimía "Sin constancia cargada." para una visita que
   * sí la tiene, que en una app auditable es mostrar un dato falso.
   *
   * `requests` viene del más nuevo al más viejo, así que el primero que aparece es el último
   * entregado. Los cancelados/rechazados quedan afuera A PROPÓSITO: su constancia es la de un pedido
   * que no ocurrió, y darla por vigente dejaría al coordinador sin forma de cargar una nueva.
   */
  const reqEntregado = requests.find((r) => r.status === 'atendida' && constanciaVigente(r)) ?? null
  const constanciaEntregada = reqEntregado ? constanciaVigente(reqEntregado) : null
  const badgeEntregado = reqEntregado ? badgeOf(reqEntregado) : null
  const comprobanteEntregado = reqEntregado ? activeDispensation(reqEntregado)?.correlative_number ?? null : null

  // Con un pedido abierto la sección está EN CURSO: se carga o se reemplaza la constancia contra él.
  // Sin ninguno abierto no hay a qué adjuntarla — o se muestra en lectura la del pedido entregado,
  // o, si no hay nada todavía, el dropzone, que es el que crea el pedido (estado 2 del mock).
  const ipEnCurso = openReq !== null

  /**
   * Si el pedido ABIERTO en curso realmente acepta que se le adjunte constancia. OJO: esto NO es
   * `mostrarIp` (que también se prende con el cronograma vivo) — es a propósito el mismo sello con
   * el que el servidor decide, para las dos ramas de abajo (aviso + dropzone):
   *
   *   · `includes_ip`: lo que `attach_ip_document` y `mark_dispensation_ready` (0071 §7/§8.1) leen
   *     de la FILA, sellado cuando el pedido se creó. El cronograma puede cambiar después —alguien
   *     puede tildar/destildar `dispenses_ip` en la definición de la visita mientras hay un pedido
   *     abierto que se selló al revés, y ESO estaba pasando de verdad mientras se corregían
   *     cronogramas— y el pedido no se entera solo.
   *   · `off_schedule`: la excepción fuera de cronograma también acepta el adjunto aunque
   *     `includes_ip` todavía esté en false — ahí la constancia es justo lo que se lo declara al
   *     servidor (attach_ip_document §7, "la excepción no implica IP" es la letra chica: el pedido
   *     nace sin sellar y recién prende `includes_ip` cuando se adjunta algo).
   *
   * Sin pedido abierto no hay nada sellado todavía: recién ahí cae al cronograma, que es lo que un
   * pedido NUEVO va a heredar al crearse (0071 §8) — y es el único caso legítimo de mirarlo.
   */
  const ipAceptaAdjunto = openReq ? openReq.includes_ip || openReq.off_schedule : visit.dispenses_ip

  /**
   * "Falta la constancia" (el aviso + la píldora "Incompleta" del pie) solo es CIERTO cuando el
   * pedido ya la exige para que Farmacia emita el comprobante — y esa exigencia es el `includes_ip`
   * sellado a secas (0071 §8.1: `mark_dispensation_ready` solo la pide si `includes_ip`), no
   * `mostrarIp` ni `off_schedule` (que la deja OPCIONAL hasta que se adjunta algo). Antes esto
   * miraba `mostrarIp`, que también se prende con el cronograma vivo: destildar/tildar
   * `dispenses_ip` con un pedido abierto de signo contrario dejaba la tarjeta afirmando "Farmacia no
   * puede emitir el comprobante hasta que esté cargada" sobre un pedido que la RPC ya daba por
   * completo. No lo "simplifiques" de vuelta a `mostrarIp`: son dos preguntas distintas — "¿se
   * muestra la sección?" (cronograma O sello, cualquiera alcanza) vs. "¿ESTE pedido, tal como está
   * sellado, la necesita?" (solo el sello, nunca el cronograma).
   */
  const constanciaIncompleta = openReq !== null && openReq.includes_ip && !constanciaAbierta

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

  /**
   * Historial de pedidos CERRADOS (entregados / cancelados / rechazados). Van con la card completa
   * de `renderCard` —y no como filas planas— porque son pedidos aparte, con su propio desenlace.
   *
   * Vive en una función y no inline porque tiene que poder aparecer en DOS lugares: dentro de la
   * subsección de concomitante cuando la visita la entrega (donde ya estaba; ese circuito está en
   * producción y no se mueve de sitio) y como subsección propia cuando la visita SOLO entrega IP.
   * Antes colgaba de la rama de la concomitante, así que en una visita solo-IP no se renderizaba
   * NUNCA: entregado el pedido, no quedaba ningún rastro de la dispensación en la tarjeta.
   *
   * `conRotulo` es el "Historial" chiquito que separa las cards de los renglones del pedido abierto;
   * cuando el historial va como subsección propia sobra, porque ya lo rotula el `Sub`.
   */
  function renderHistorial(conRotulo: boolean) {
    if (closedReqs.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {conRotulo && <div className="spira-eyebrow" style={{ marginTop: 2 }}>Historial</div>}
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
    )
  }

  // `mostrarIp` y no `visit.dispenses_ip`: si el cronograma se destildó con un pedido de IP abierto,
  // la tarjeta seguiría diciendo "esta visita no entrega medicación" arriba de un pedido vivo.
  const nada = !visit.dispenses && !mostrarIp

  return (
    <Panel
      title="Dispensación" icon="pill" accent={accent}
      highlight={visit.dispenses || mostrarIp}
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
              {renderHistorial(openMedItems.length > 0)}

              {readOnly && requests.length === 0 && !reqQ.loading && (
                <div style={{ ...muted, padding: '2px 0' }}>Sin dispensación solicitada.</div>
              )}

              {/* agregar (solo vista del día): ya no solicita por su cuenta, suma renglones al pedido.
                  Si Farmacia ya lo tomó, el acceso va deshabilitado CON el motivo escrito debajo: la
                  base lo va a rechazar igual, y enterarse recién al enviar es haber elegido
                  medicamento y cantidad al pedo (ningún botón deshabilitado queda mudo). */}
              {!readOnly && !soliciting && (
                <>
                  <button
                    type="button" disabled={agregarBloqueado !== null}
                    onClick={() => { setSoliciting(true); setErr(null) }}
                    style={{
                      ...dashedBtn,
                      cursor: agregarBloqueado ? 'default' : 'pointer',
                      opacity: agregarBloqueado ? 0.6 : 1,
                    }}
                  >
                    <Icon name="plus" size={16} color={agregarBloqueado ? 'var(--spira-faint)' : accent} /> Agregar medicación
                  </button>
                  {agregarBloqueado && (
                    <div style={{ ...muted, marginTop: 7 }}>{agregarBloqueado}</div>
                  )}
                </>
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

          {mostrarIp && (
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

              {ipEnCurso ? (
                !ipAceptaAdjunto ? (
                  // El pedido abierto, TAL COMO ESTÁ SELLADO, no lleva IP (ni es una excepción fuera
                  // de cronograma): ofrecer el dropzone acá terminaría en el error de la RPC ("esta
                  // solicitud no lleva producto en investigación", 0071 §7) sin más salida que
                  // cancelar el pedido y rehacerlo. Se muestra el mismo texto neutro que el resto de
                  // "no hay nada cargado" — no hay nada que adjuntar contra ESTE pedido.
                  <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
                ) : (
                  // Hay un pedido abierto que SÍ acepta la constancia: se carga o se reemplaza CONTRA ÉL.
                  readOnly ? (
                    constanciaAbierta ? (
                      <ConstanciaVista doc={constanciaAbierta} size="chica" accent={accent} />
                    ) : (
                      <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
                    )
                  ) : constanciaAbierta && !reemplazando ? (
                    <ConstanciaVista doc={constanciaAbierta} size="chica" accent={accent} onReemplazar={() => setReemplazando(true)} />
                  ) : (
                    <ConstanciaDropzone accent={accent} busy={subiendo} onFile={cargarConstancia} />
                  )
                )
              ) : constanciaEntregada && reqEntregado && badgeEntregado ? (
                // Pedido ya cerrado: la constancia es la nota fuente de una entrega que ya ocurrió.
                // Va en LECTURA (sin "Reemplazar": no se toca lo que ya se entregó) y en lugar del
                // dropzone —que acá crearía un segundo pedido para una visita ya dispensada— va el
                // desenlace, que es lo único que dice que esta visita se dispensó y con qué papel.
                <>
                  <ConstanciaVista doc={constanciaEntregada} size="chica" accent={accent} />
                  <div style={desenlaceStyle}>
                    <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                      Pedido del {formatDateAR(reqEntregado.created_at)}
                    </span>
                    <span style={{ ...pillBase, color: badgeEntregado.color, background: badgeEntregado.tint }}>
                      {badgeEntregado.label}
                    </span>
                    {comprobanteEntregado !== null && (
                      <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                        Comprobante N° <span className="spira-mono">{comprobanteEntregado}</span>
                      </span>
                    )}
                  </div>
                </>
              ) : reqQ.loading ? (
                // Carga inicial: `requests` todavía viene vacío porque la consulta está en vuelo, NO
                // porque no haya pedidos — mismo patrón que la rama de concomitante de acá abajo
                // (`readOnly && requests.length === 0 && !reqQ.loading`). Sin este freno, durante esos
                // cientos de milisegundos la tarjeta afirma "Sin constancia cargada." de una visita que
                // sí la tiene (dato falso en la ficha del paciente) y, en la vista del día, ofrece un
                // dropzone que crearía un pedido NUEVO si alguien soltara un archivo justo ahí. Los
                // refetch posteriores conservan las filas viejas (`useSupabaseQuery`), así que esto es
                // solo el primer montaje.
                null
              ) : readOnly ? (
                <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
              ) : (
                <ConstanciaDropzone accent={accent} busy={subiendo} onFile={cargarConstancia} />
              )}
            </Sub>
          )}

          {/* El historial como subsección propia cuando la visita NO entrega concomitante: ahí no
              existe la rama de la que colgaba, y sin esto una visita solo-IP ya dispensada no
              mostraba ni un pedido. Con concomitante sigue donde estaba, adentro de esa subsección. */}
          {!visit.dispenses && closedReqs.length > 0 && (
            <Sub label="Historial">{renderHistorial(false)}</Sub>
          )}

          {/* pie común: fecha + estado + cancelar, UNA sola vez — es lo que dice que arriba hay un
              pedido y no dos (ver el comentario de cabecera). */}
          {openReq && (
            <div style={footStyle}>
              <span style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
                Pedido del {formatDateAR(openReq.created_at)}
                {/* El correlativo apenas el comprobante existe, sin esperar a la entrega: es el
                    número que la coordinadora canta cuando el paciente pasa a retirar. */}
                {comprobanteAbierto !== null && (
                  <> · Comprobante N° <span className="spira-mono">{comprobanteAbierto}</span></>
                )}
              </span>
              {constanciaIncompleta ? (
                // "Incompleta" pisa el badge normal: falta la constancia importa más que si la
                // solicitud sigue 'solicitada' o ya pasó a 'preparando'.
                //
                // Va en el ámbar PROFUNDO, que es lo que el mock pide para esta píldora y lo que ya
                // existe en tokens como acento profundo de Pharma (invertido en oscuro, como todo
                // color que se oscurece para leerse sobre un tinte claro). Con `--spira-warn` a
                // secas daba ~2,4:1 sobre este tinte y a 11px/600 AA pide 4,5:1 — y, peor, era el
                // MISMO color que el badge "Solicitada" que sale de `estados.ts`: los dos estados se
                // veían iguales y "falta algo" quedaba apoyado solo en la palabra. Se toca SOLO esta
                // píldora: `estados.ts` alimenta también el tablero de Farmacia y el historial.
                <span style={{ ...pillBase, color: 'var(--spira-acc-deep-pharma)', background: WARN_TINT_PILL }}>Incompleta</span>
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
