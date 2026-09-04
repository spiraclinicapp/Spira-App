import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { formatDateAR } from '../../lib/dates'
import {
  usePatientMedications,
  useVisitDispensations,
  useUltimaDispensacion,
  createDispensationRequest,
  addDispensationItems,
  cancelDispensationRequest,
  activeDispensation,
  columnOf,
  constanciaVigente,
  uploadIpDocument,
  formatBytes,
  IP_MAX_BYTES,
  IP_MIME_TYPES,
} from '../../data/pharma'
import type { DispensationRequestRow, IpDocumentRow, UltimaDispensacionRow } from '../../data/pharma'
import { badgeOf } from './dispensaciones/estados'
import { Panel } from '../track/Panel'
import { ConstanciaDropzone, ConstanciaPendiente, ConstanciaVista } from './ConstanciaIp'

// Tintes con rgba() literal (no se puede concatenar alfa a un var(--x)). --spira-danger #A6483B,
// --spira-good #5C8A5A, --spira-warn #B0823F.
const DANGER_TINT = 'rgba(166, 72, 59, 0.10)'
// Tres alfas del mismo ámbar, una por caja, tal como las midió el mock (cada una contra el peso y
// el tamaño de SU texto): .14 para el aviso "Falta la constancia" (texto en tinta, ver `warnBox`),
// .15 para el aviso de dispensación reciente en tono de alerta (`AvisoReciente`), y .20 para la píldora
// "Incompleta" del pie (más saturada porque ahí el color SÍ es la etiqueta — por eso la tinta de
// esa píldora es el ámbar PROFUNDO de tokens y no `--spira-warn`, ver el pie).
const WARN_TINT = 'rgba(176, 130, 63, 0.14)'
const WARN_TINT_AVISO = 'rgba(176, 130, 63, 0.15)'
const WARN_TINT_PILL = 'rgba(176, 130, 63, 0.20)'

// STATUS_META y badgeOf viven en dispensaciones/estados.ts (única fuente para Track y Pharma).
// badgeOf distingue "lista para retirar" de "entregada": para RequestStatus ambas son `atendida`,
// pero para la coordinadora son cosas distintas (una la puede ir a buscar el paciente).

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: DANGER_TINT, borderRadius: 8, padding: '8px 11px', marginBottom: 10,
}
const muted: CSSProperties = { fontSize: 12.5, color: 'var(--spira-muted)' }

/** Rótulo de subsección: `ink-soft`, no el `faint` del `.spira-eyebrow` — ese da 2,1:1 sobre
 *  `surface` y acá es la división PRIMARIA de la tarjeta (concomitante vs. IP), no una nota al pie. */
const subLabel: CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase',
  color: 'var(--spira-ink-soft)',
}

/**
 * El MISMO rótulo, en ámbar, para la subsección de excepción. La excepción se integra por
 * ESTRUCTURA —es una subsección más, con el mismo ritmo de rótulo, contenido y filete—, no por una
 * caja aparte: la primera versión colgaba un formulario encima de la tarjeta y el Director la
 * rechazó por eso (mock §4). Lo único que la distingue es el color del rótulo.
 *
 * El ámbar va por `--spira-acc-deep-warn` y no por `--spira-warn`: como todo color "profundo" de
 * tokens, se INVIERTE en oscuro (en claro oscurece para leerse sobre papel; en oscuro aclara). El
 * ámbar oscuro sobre card oscura da 2,39:1, así que el token es también la decisión de contraste.
 */
const subLabelExc: CSSProperties = {
  ...subLabel, color: 'var(--spira-acc-deep-warn)', display: 'inline-flex',
  alignItems: 'center', gap: 6,
}

/**
 * Una subsección de la tarjeta partida. El filete separa; no hay cajas anidadas (mock v6, §2).
 * `excepcion` no cambia el ritmo —ese es justamente el punto—, solo tiñe el rótulo y le antepone
 * el ícono.
 */
function Sub({ label, first, excepcion, children }: {
  label: string
  first?: boolean
  excepcion?: boolean
  children: ReactNode
}) {
  return (
    <div style={first ? undefined : { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--spira-line)' }}>
      <div style={{ ...(excepcion ? subLabelExc : subLabel), marginBottom: 9 }}>
        {/* `info` (círculo) y no `alert` (triángulo): el rótulo señala una EXCEPCIÓN, no un error.
            El triángulo queda reservado para el aviso que sí puede estar marcando un problema. */}
        {excepcion && <Icon name="info" size={12} stroke={2.4} />}
        {label}
      </div>
      {children}
    </div>
  )
}

/**
 * Motivos de una dispensación fuera de cronograma. Desplegable y no texto libre: el Director
 * prefiere valores preestablecidos para no depender de cómo lo escriba cada operador, y este texto
 * no se queda en la pantalla donde se decidió — viaja a la card del tablero de Farmacia, al cajón y
 * al COMPROBANTE IMPRESO que lee un monitor. Por eso lo que se manda al servidor es la etiqueta
 * legible y no la clave (ver `motivoLabel`).
 *
 * PENDIENTE: lista propuesta, a confirmar por el Director (2026-08-09). Si la corrige, se corrige
 * acá y en ningún otro lado.
 */
const MOTIVOS_FUERA_CRONOGRAMA: readonly SelectOption[] = [
  { value: 'reposicion', label: 'Reposición por pérdida o rotura' },
  { value: 'vnp', label: 'Visita no programada (VNP)' },
  { value: 'ajuste_dosis', label: 'Ajuste de dosis indicado por el investigador' },
  { value: 'viaje', label: 'Adelanto por viaje del paciente' },
  { value: 'otro', label: 'Otro' },
]

/** Mismo texto por los dos caminos que crean el pedido (renglones y constancia): la falta es la
 *  misma y el coordinador tiene que leer siempre lo mismo. Sereno, en castellano, sin culpar. */
const FALTA_MOTIVO_MSG =
  'Elegí el motivo de la dispensación fuera de cronograma antes de solicitarla.'

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
/** El cierre de la solicitud. Mismo filete que el pie común: los dos cierran la tarjeta, y separarlos
 *  con otra cosa los haría leer como dos zonas distintas cuando son el mismo final. */
const enviarStyle: CSSProperties = {
  marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--spira-line)',
  display: 'flex', flexDirection: 'column', gap: 9,
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
/**
 * Borde SÓLIDO y del mismo tono que el resto de las cajas de la tarjeta (`--spira-line`, el mismo de
 * la card de Comentarios y de los renglones de medicación). Antes iba punteado, que en el sistema no
 * quiere decir nada: acá el punteado se usa para un valor PENDIENTE de declarar (el campo de kits de
 * Farmacia), y gastarlo también en "sumá algo" lo vaciaba de significado y dejaba la tarjeta con
 * cuatro cajas de tres bordes distintos. Decisión del Director, 2026-08-11.
 */
const addBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%', height: 44,
  borderRadius: 12, border: '1px solid var(--spira-line)', background: 'var(--spira-white)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13.5, color: 'var(--spira-ink)',
}
/**
 * La MISMA forma de "Elegir medicación", un escalón más callada, para la salida "Dispensar fuera
 * de cronograma": la tarjeta ya tiene un idioma para "acá se suma algo" y reusarlo la integra por
 * estructura en vez de dejarla como un enlace suelto. Lo secundario lo dice el TONO —chapa más
 * baja, tinta atenuada y el ícono sin acento—, no una forma distinta (mock, estado 5).
 */
const addBtnQuiet: CSSProperties = {
  ...addBtn, height: 40, fontSize: 13, color: 'var(--spira-ink-soft)',
}

/**
 * Aviso de dispensación reciente. Cambia de TONO, no de existencia: dentro de cronograma la entrega
 * estaba prevista y el dato simplemente se ofrece; fuera de cronograma una entrega repetida sí puede
 * ser un error y va en ámbar.
 *
 * El porqué de la distinción, que es lo que más fácil se arruina: en un protocolo con visitas cada
 * 28 días una alarma ámbar saltaría TODAS las veces, y una alarma que siempre suena deja de
 * escucharse justo cuando importa. NUNCA bloquea — avisa.
 *
 * Sobre PAPEL BLANCO en el tono informativo, como todo lo que vive adentro de la tarjeta (los
 * renglones, la zona de adjunto, el archivo): un recuadro teñido adentro de una card teñida es tinte
 * sobre tinte y se ve sucio. La única que se tiñe es la alerta, porque ahí el color es SIGNIFICADO.
 *
 * Recibe el `QueryResult` de `useUltimaDispensacion` COMPLETO —no ya el dato resuelto— porque tiene
 * que cubrir loading y error, no solo el caso feliz: antes solo miraba `ultima`, así que mientras la
 * consulta estaba en vuelo o si fallaba, esta función devolvía `null` igual que "no hubo dispensación
 * reciente" — un falso negativo en el aviso que existe justamente para prevenir una entrega repetida.
 * Mismo criterio que ya usa `reqQ.loading` más abajo (rama de concomitante y de IP) para no afirmar
 * "Sin dispensación solicitada." / "Sin constancia cargada." antes de que la consulta termine — acá el
 * costo de equivocarse es mayor, así que el error además se hace VISIBLE (no un silencio más).
 */
function AvisoReciente({ query, alerta, accent }: {
  query: { data: UltimaDispensacionRow[] | null; loading: boolean; error: string | null }
  alerta: boolean
  accent: string
}) {
  const marginBottom = alerta ? 9 : 12 // ver el porqué de los dos valores más abajo, en el caso feliz.

  if (query.loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
        fontSize: 12.5, background: 'var(--spira-white)', border: '1px solid var(--spira-line)', marginBottom,
      }}>
        <Icon name="clock" size={15} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
        <span style={{ color: 'var(--spira-muted)' }}>Comprobando dispensaciones recientes…</span>
      </div>
    )
  }

  if (query.error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 11,
        fontSize: 12.5, background: WARN_TINT_AVISO, border: '1px solid transparent', marginBottom,
      }}>
        <Icon name="alert" size={15} color="var(--spira-warn)" style={{ flex: '0 0 auto', marginTop: 1 }} />
        <span>
          <span style={{ display: 'block', fontWeight: 600, color: 'var(--spira-ink)' }}>
            No se pudo comprobar si hubo una dispensación reciente
          </span>
          <span style={{ display: 'block', color: 'var(--spira-ink-soft)', marginTop: 2 }}>
            Revisá el historial de la izquierda antes de dispensar, por las dudas.
          </span>
        </span>
      </div>
    )
  }

  const ultima = (query.data ?? [])[0]
  if (!ultima) return null

  // `entregada_el` es un TIMESTAMPTZ (`dispensations.delivered_at`). Ojo con la tentación de
  // `formatAR(entregada_el.slice(0, 10))`: el recorte devuelve la fecha en UTC y todo lo entregado
  // después de las 21:00 hora argentina se mostraría un día adelante — el bug que ya apareció en el
  // pie de esta misma tarjeta (2026-08-10). `formatDateAR` localiza; ver `lib/dates.ts`.
  const entregada = new Date(ultima.entregada_el)
  // La capa de datos rellena con '' si faltara `delivered_at`. Antes que decir "hace NaN días" en una
  // app auditable, no decir nada.
  if (Number.isNaN(entregada.getTime())) return null

  const dias = Math.max(0, Math.floor((Date.now() - entregada.getTime()) / 86_400_000))
  // "hace 0 días" no lo dice nadie, y el singular tampoco es "1 días".
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`
  /**
   * QUÉ se entregó, por su nombre. Antes decía "2 renglones de medicación", que es contabilidad
   * interna y no le sirve a nadie: el que lee este aviso está por decidir si vuelve a entregar, y
   * para eso necesita saber si lo que sale de vuelta es lo mismo que ya salió.
   *
   * Se nombran hasta dos y el resto se cuenta: el aviso vive en dos renglones dentro de una tarjeta
   * angosta, y una lista de seis medicamentos deja de leerse. Si la lista viene vacía —el pedido era
   * de IP solo, o la RLS no deja leer los nombres (Track recién desde la 0074)— se cae al conteo,
   * que es impreciso pero cierto. Nunca "Medicamento, Medicamento".
   */
  const meds = ultima.medicamentos
  const queSeEntrego = meds.length === 0
    ? (ultima.items ? `${ultima.items} medicamento${ultima.items > 1 ? 's' : ''}` : null)
    : meds.length <= 2
      ? meds.join(' y ')
      : `${meds.slice(0, 2).join(', ')} y ${meds.length - 2} más`

  const detalle = [
    formatDateAR(ultima.entregada_el),
    ultima.ip_kits ? `${ultima.ip_kits} kit${ultima.ip_kits > 1 ? 's' : ''} de IP` : null,
    queSeEntrego,
    ultima.visita ? `en la visita ${ultima.visita}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 11,
      fontSize: 12.5,
      // El borde transparente en la alerta (en vez de sacarlo) mantiene la caja del MISMO tamaño en
      // los dos tonos: es la misma caja en el mismo lugar, solo cambia el color.
      background: alerta ? WARN_TINT_AVISO : 'var(--spira-white)',
      border: alerta ? '1px solid transparent' : '1px solid var(--spira-line)',
      // Alerta = va adentro de la subsección de excepción, pegada al desplegable de motivo (9);
      // informativo = va suelta arriba de la primera subsección, que respira un poco más (12).
      marginBottom,
    }}>
      <Icon
        name={alerta ? 'alert' : 'info'} size={15}
        color={alerta ? 'var(--spira-warn)' : accent}
        style={{ flex: '0 0 auto', marginTop: 1 }}
      />
      <span>
        <span style={{ display: 'block', fontWeight: 600, color: 'var(--spira-ink)' }}>
          {alerta ? `Ya se dispensó ${cuando}` : `Última dispensación ${cuando}`}
        </span>
        <span style={{ display: 'block', color: 'var(--spira-ink-soft)', marginTop: 2 }}>
          {detalle}{alerta ? '. Revisá que no sea una entrega repetida.' : '.'}
        </span>
      </span>
    </div>
  )
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
 * Monta su PROPIO `Panel` (como `VisitProcedures`), con el realce de banda sólida SIEMPRE puesto:
 * "agregale color a la dispensación" (Director, 2026-08-11). `tint` es obligatorio junto con
 * `highlight` — es un token con un valor por tema, porque el mismo tinte que resalta sobre papel
 * claro apaga sobre fondo oscuro.
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
 *
 * FUERA DE CRONOGRAMA (mock, estados 5 y 8). Cuando la visita no entrega nada, la tarjeta ofrece una
 * salida: dispensar igual, declarando un motivo. Eso agrega una TERCERA subsección —la primera— con
 * el mismo ritmo que las otras dos, porque una excepción integrada por estructura se lee como parte
 * del formulario y no como un parche encima. El motivo es la ÚNICA puerta que tiene la base para
 * saltear la validación del cronograma (`create_dispensation_request`, 0071), y viaja como etiqueta
 * legible porque termina en el comprobante impreso que lee un monitor.
 *
 * Y arriba de todo, el AVISO DE 30 DÍAS (`useUltimaDispensacion`): si al paciente ya se le dispensó
 * hace poco, se dice antes de que el coordinador cargue nada — si el aviso llega después, llega
 * tarde. Cambia de tono según el contexto y nunca bloquea; el porqué está en `AvisoReciente`.
 */
export function VisitDispensationPanel({ visit, accent, readOnly }: {
  visit: { id: string; enrollment_id: string; protocol_id: string; dispenses: boolean; dispenses_ip: boolean }
  accent: string
  readOnly: boolean
}) {
  const reqQ = useVisitDispensations(visit.id)
  const medsQ = usePatientMedications(visit.enrollment_id)
  /**
   * Última dispensación entregada del enrolamiento dentro de los últimos 30 días, para el aviso.
   *
   * Solo en la vista del día (`readOnly ? null` no dispara la consulta). Dos motivos: el aviso
   * existe para frenar la mano ANTES de dispensar, y donde no se puede dispensar es puro ruido; y
   * en la ficha del paciente, abriendo una visita de hace dos meses, "última dispensación hace 3
   * días" habla de OTRA visita — un dato cierto puesto donde se lee como falso.
   *
   * OJO si alguna vez se reusa desde Farmacia: la consulta cruza `patient_visits`, que Pharma no
   * puede leer por RLS (Track se aísla por protocolo, Pharma es central). Está escrito en el hook.
   *
   * `visit.id` viaja como segundo argumento para EXCLUIR la visita actual del resultado (ver el
   * porqué en el hook): sin eso, apenas se dispensa fuera de cronograma, la solicitud recién creada
   * de ESTA visita gana el "más reciente" y el aviso termina hablando de sí mismo.
   */
  const ultimaQ = useUltimaDispensacion(readOnly ? null : visit.enrollment_id, visit.id)
  const [soliciting, setSoliciting] = useState(false)
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('')
  const [items, setItems] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Cerradas (entregadas/canceladas/rechazadas): se muestran las 2 más recientes y el resto queda
  // tras "ver más". En un paciente de meses el historial es un chorizo y entierra lo accionable.
  const [showAllClosed, setShowAllClosed] = useState(false)
  // `reemplazando` reabre el dropzone sobre una constancia YA cargada (botón "Reemplazar" de
  // `ConstanciaVista`). La subida en sí ya no vive acá: la hace `enviar()` al cerrar la solicitud.
  const [reemplazando, setReemplazando] = useState(false)
  /**
   * La constancia ELEGIDA y todavía no enviada. Vive en el navegador hasta que se cierra la
   * solicitud, y esa es la razón de que exista: la ruta en Storage se arma con el `request_id`
   * (`{protocol_id}/{request_id}/…`, 0071) y el pedido nace recién al solicitar, así que no hay dón
   * subirla antes. Es también lo que hace que la solicitud sea UN acto y no tres.
   *
   * Contrapartida asumida: si la coordinadora cierra la visita sin solicitar, el archivo se pierde
   * (sigue en su disco). Guardarlo antes pediría un estado borrador en la base.
   */
  const [archivo, setArchivo] = useState<File | null>(null)
  /**
   * Excepción fuera de cronograma ABIERTA POR EL COORDINADOR y todavía sin pedido. Es pegajosa a
   * propósito: no se apaga al crear el pedido. Apagarla ahí dejaría a la tarjeta, durante los
   * cientos de milisegundos del refetch, sin ninguna de las dos señales —ni el flag local ni la fila
   * con `off_schedule`— y volvería un instante a "Esta visita no entrega medicación", que es
   * exactamente lo contrario de lo que acaba de pasar. Desde que el pedido existe manda el flag
   * SELLADO en la fila (`reqExcepcion`), así que el flag local ya no decide nada; se limpia solo al
   * cerrar la visita, que es cuando el componente se desmonta.
   */
  const [fueraCronograma, setFueraCronograma] = useState(false)
  const [motivo, setMotivo] = useState('')

  const requests = reqQ.data ?? []
  // Abiertas = todavía accionables (solicitada / preparando / lista para retirar); van siempre
  // arriba. Cerradas = entregada / cancelada / rechazada.
  // `columnOf` devuelve null para cancelada/rechazada y 'entregada' para las ya retiradas.
  const openReqs = requests.filter((r) => {
    const col = columnOf(r)
    return col === 'solicitada' || col === 'preparando' || col === 'lista'
  })
  const closedReqs = requests.filter((r) => !openReqs.includes(r))
  const activeMeds = (medsQ.data ?? []).filter((m) => m.active)
  const pendingIds = new Set(items.map((i) => i.medication_id))

  // "El pedido" que sostiene el pie común: el mismo `openReqs[0]` que reusa `cargarConstancia`. En
  // el caso normal hay a lo sumo un abierto; si por algún motivo hubiera dos (nada lo impide a nivel
  // de base), el pie se apoya en el más nuevo — una simplificación consciente, ver el informe de la
  // tarea.
  /**
   * A dónde va lo que se solicite: el pedido abierto que TODAVÍA acepta cambios.
   *
   * `add_dispensation_items` (0072) y `attach_ip_document` (0071) solo aceptan el pedido en
   * `solicitada`; desde `preparando` el cajón ya está armado y en `lista` el comprobante ya salió
   * impreso, así que un renglón nuevo quedaría fuera del papel. Si no hay destino, la solicitud nace
   * como un pedido NUEVO — decisión del Director (2026-08-11): mientras Farmacia no lo haya tomado
   * todo se suma al mismo (un comprobante por visita); una vez tomado, lo que quede pendiente se pide
   * aparte en vez de trabar al coordinador hasta que alguien cancele la preparación.
   */
  const destino = openReqs.find((r) => r.status === 'solicitada') ?? null

  /**
   * El pedido del que HABLA la tarjeta: el pie, el N° de comprobante y la constancia.
   *
   * Es `destino` primero y el más nuevo después, no al revés. En el caso normal hay un solo pedido
   * abierto y los dos son el mismo; con dos —nada lo impide a nivel de base— la tarjeta describía el
   * más nuevo mientras mandaba al que acepta cambios, así que se solicitaba contra un pedido y se
   * veía el otro: se adjuntó una constancia, entró bien, y la tarjeta siguió mostrando la anterior
   * como si no hubiera pasado nada. Actuar sobre uno y describir otro es la manera más silenciosa de
   * mentir.
   */
  const openReq = destino ?? openReqs[0] ?? null
  // Renglones de medicación de TODOS los pedidos abiertos (no solo `openReq`): así ningún renglón
  // queda oculto si llegara a haber más de uno.
  const openMedItems = openReqs.flatMap((r) => r.items)

  // —— Fuera de cronograma ——
  /**
   * El pedido de la excepción, si existe. Manda el flag SELLADO en la fila y no el cronograma vivo,
   * que es la regla de toda esta tarjeta: `off_schedule` recuerda lo que era cierto cuando se pidió.
   *
   * Se busca primero entre los abiertos y después entre los ENTREGADOS, por la misma razón por la
   * que existe `reqEntregado`: entregado el pedido sale de `openReqs`, y sin este segundo tramo la
   * tarjeta se olvidaría de que esta visita se dispensó por excepción justo cuando el dato pasa a
   * ser histórico —y volvería a decir "Esta visita no entrega medicación" arriba de una entrega que
   * ocurrió—. Cancelados y rechazados quedan AFUERA a propósito, igual que en `reqEntregado`: la
   * excepción de un pedido que no ocurrió no es una excepción, y dejarla en pantalla congelaría la
   * tarjeta en un estado que ya no es cierto, sin volver a ofrecer la salida punteada.
   */
  const reqExcepcion =
    openReqs.find((r) => r.off_schedule)
    ?? requests.find((r) => r.off_schedule && r.status === 'atendida')
    ?? null
  /** La excepción está VIVA: o el coordinador la acaba de abrir, o hay un pedido abierto sellado. */
  const excepcionViva = fueraCronograma || openReqs.some((r) => r.off_schedule)
  /** Se muestra la subsección: viva, o ya consumada (el pedido de excepción entregado). */
  const mostrarExcepcion = excepcionViva || reqExcepcion !== null
  /**
   * La concomitante se ofrece cuando la visita la entrega O mientras la excepción está viva: fuera
   * de cronograma se dispensa justamente lo que el cronograma no previó, así que las dos vías tienen
   * que estar disponibles (mock, estado 8). Con la excepción ya consumada no se reabre: ahí el
   * pedido está entregado y sus renglones viven en el historial.
   */
  const mostrarConcomitante = visit.dispenses || excepcionViva
  /**
   * Motivo elegido, como ETIQUETA LEGIBLE. Lo que viaja al servidor es el label y no la clave: ese
   * texto sale impreso en el comprobante que lee un monitor, y `ajuste_dosis` ahí no dice nada.
   */
  const motivoLabel = MOTIVOS_FUERA_CRONOGRAMA.find((m) => m.value === motivo)?.label ?? null
  /**
   * El motivo solo viaja cuando el pedido NACE: es el argumento que saltea la validación del
   * cronograma en `create_dispensation_request`. Con un pedido ya abierto la marca está sellada en
   * la fila y sumarle renglones no la vuelve a declarar.
   */
  /**
   * Hace falta declarar un motivo: vamos a CREAR un pedido (no hay ninguno al que sumarse) y el
   * cronograma no autoriza esta visita.
   *
   * Se calcula así y no mirando el flag local `fueraCronograma` porque el motivo hace falta CADA VEZ
   * que nace un pedido, no solo la primera. En una visita que solo dispensa por excepción y ya tiene
   * un pedido tomado por Farmacia, el segundo también nace fuera de cronograma — y la tarjeta
   * mostraba el motivo SELLADO del anterior en vez de pedir uno nuevo, así que la solicitud se iba
   * sin motivo y la base la rechazaba con "Esta visita no entrega medicación": un error del servidor
   * por algo que la pantalla ya sabía.
   */
  const necesitaMotivo = !readOnly && !destino && !visit.dispenses && !visit.dispenses_ip
  const razonExcepcion = necesitaMotivo ? motivoLabel : null
  /**
   * Sin motivo no hay excepción: es la ÚNICA puerta que tiene la base para saltear el cronograma
   * (0071). No se deshabilita nada: el desplegable está primero, arriba de todo, y un botón
   * deshabilitado que no explica por qué es peor que un mensaje sereno al intentar.
   */
  const faltaMotivo = necesitaMotivo && !motivoLabel

  // Ofrecer solo la medicación habilitada activa que todavía no esté ni en la lista de esta
  // solicitud ni en el pedido ABIERTO. Lo segundo faltaba: la base no impide repetir el mismo
  // medicamento en un pedido, así que se podía cargar dos veces y quedaban dos renglones idénticos
  // —y la farmacéutica escaneando el mismo código de barras dos veces en el mostrador—.
  const yaEnPedido = new Set(openMedItems.map((it) => it.medication_id))
  const options: SelectOption[] = activeMeds
    .filter((m) => !pendingIds.has(m.medication_id) && !yaEnPedido.has(m.medication_id))
    .map((m) => ({ value: m.medication_id, label: m.medication?.name ?? 'Medicamento' }))

  /**
   * Que lo que se solicite va a abrir un pedido APARTE, escrito antes de mandar y no después.
   *
   * Antes esto deshabilitaba el botón de agregar; ahora se puede pedir igual, así que deja de ser un
   * bloqueo y pasa a ser una advertencia: son dos comprobantes para la misma visita, y eso lo tiene
   * que decidir una persona sabiendo lo que hace, no descubrirlo cuando le llega el segundo papel.
   * Null = la solicitud se suma al pedido que ya existe.
   */
  const avisoPedidoNuevo: string | null =
    openReq && !destino
      ? 'Farmacia ya tomó el pedido anterior: esto abre uno nuevo, con su propio comprobante.'
      : null

  /** Qué se va a mandar, contado. Nombrar el contenido es lo que convierte al botón en una promesa
   *  verificable en vez de un salto de fe. */
  const resumenPendiente = [
    items.length ? `${items.length} medicamento${items.length > 1 ? 's' : ''}` : null,
    archivo ? 'la constancia' : null,
  ].filter(Boolean).join(' y ')

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
  // Algún pedido abierto lleva IP SELLADO por el servidor (0071, índice de `supabase/README.md`).
  // El porqué de mirar el sello y no solo el cronograma está entero en `mostrarIp`, más abajo.
  const ipSellado = openReqs.some((r) => r.includes_ip)

  // La constancia del pedido ABIERTO. Puede vivir en cualquiera de los abiertos, no necesariamente
  // en el más nuevo: desde la 0072 los dos caminos se suman al mismo pedido, pero los pedidos
  // partidos que quedaron de antes —y los que Pharma dé de alta por su cuenta— siguen existiendo.
  // La del pedido del que habla la tarjeta primero; si ese no tiene, la de cualquier otro abierto.
  // El orden importa por lo mismo que en `openReq`: lo que se ve tiene que ser lo que se tocó.
  const constanciaAbierta: IpDocumentRow | null =
    (openReq ? constanciaVigente(openReq) : null)
    ?? openReqs.reduce<IpDocumentRow | null>((found, r) => found ?? constanciaVigente(r), null)
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

  /**
   * Lo que va al historial. **Excluye el pedido entregado que la sección de IP ya muestra como
   * desenlace**: es el mismo pedido, con el mismo número de comprobante, dos veces en la misma
   * tarjeta y a diez píxeles de distancia — que es justo lo que hacía ver el historial como algo
   * metido con calzador.
   *
   * Solo la ÚLTIMA a la vista, el resto plegado. `requests` viene ordenado por `created_at`
   * descendente, así que la primera es la más nueva — la única que alguien mira ("¿ya se le entregó
   * algo?"). El resto queda a un clic: no se pierde nada, deja de estorbar.
   */
  const histReqs = closedReqs.filter((r) => r !== reqEntregado)
  const visibleClosed = showAllClosed ? histReqs : histReqs.slice(0, 1)
  const hiddenClosed = histReqs.length - visibleClosed.length

  /**
   * Si se muestra la subsección de IP. Se declara acá abajo —y no junto a `ipSellado`— porque
   * necesita `reqEntregado`, que se calcula recién ahora. Cuatro razones, cualquiera alcanza:
   *
   *   · el CRONOGRAMA lo dice (`dispenses_ip`), que es el caso normal;
   *   · un pedido abierto lo tiene SELLADO (`ipSellado`): el servidor sella `includes_ip` al crear
   *     el pedido justamente porque el cronograma puede cambiar después (0071). Mirando solo el
   *     cronograma, destildar `dispenses_ip` con un pedido abierto que ya lleva IP hacía desaparecer
   *     la sección: sin lugar donde cargar la constancia, y Farmacia trabada porque su RPC la exige;
   *   · la excepción está VIVA: fuera de cronograma el pedido nace con `includes_ip` en false (la
   *     excepción no implica IP, 0071 §create) y recién lo prende al adjuntar la constancia — o sea
   *     que sin este término no habría dónde adjuntarla y el sello nunca llegaría a prenderse;
   *   · hay un pedido ENTREGADO con constancia: es nota fuente de un hecho consumado y la tarjeta no
   *     puede olvidarse de él, ni siquiera si después alguien destildó el cronograma.
   */
  const mostrarIp = visit.dispenses_ip || ipSellado || excepcionViva || reqEntregado !== null

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
  const ipAceptaAdjunto = destino ? destino.includes_ip || destino.off_schedule : visit.dispenses_ip

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
   *
   * Fuera de cronograma el motivo viaja como quinto argumento, y solo al CREAR: es lo que saltea la
   * validación del cronograma server-side. Sumar renglones a un pedido ya sellado no lo re-declara.
   */
  /**
   * Cierra la solicitud: manda los renglones y la constancia JUNTOS, en un solo acto.
   *
   * Es el corazón de la reestructura (Director, 2026-08-11): antes cada cosa salía por su cuenta —la
   * constancia se subía al soltarla y creaba el pedido sola, los renglones iban por otro botón—, así
   * que la farmacéutica veía aparecer un pedido a medio armar y después cambiar. Ahora la tarjeta se
   * completa como un formulario y hay UN momento en que la solicitud existe, que es el que Farmacia
   * ve.
   *
   * El orden importa y no es simétrico: si no hay pedido, el que lo CREA es el de los renglones (y
   * es el único que puede llevar el motivo de la excepción); la constancia necesita sí o sí un
   * `request_id`, así que va después. Con la constancia sola y sin renglones, la creación cae en el
   * `createDispensationRequest` con lista vacía — el caso típico del IP solo, que la 0071 admite.
   *
   * Si el adjunto falla DESPUÉS de que el pedido se creó, el pedido queda igual y se avisa el error:
   * es un estado legítimo (pedido sin constancia, que Farmacia ve como incompleto) y reintentar
   * adjunta contra ese mismo pedido. No se finge éxito ni se borra lo que sí entró.
   */
  async function enviar() {
    if (!items.length && !archivo) return
    if (faltaMotivo) { setErr(FALTA_MOTIVO_MSG); return }
    setBusy(true); setErr(null)

    let requestId = destino?.id ?? null
    if (!requestId) {
      const payload = items.map((i) => ({ medication_id: i.medication_id, quantity: i.quantity }))
      const res = await createDispensationRequest(visit.id, payload, null, 'track', razonExcepcion)
      if (res.error) { setBusy(false); setErr(res.error); return }
      requestId = res.id!
    } else if (items.length) {
      const res = await addDispensationItems(requestId, items.map((i) => ({ medication_id: i.medication_id, quantity: i.quantity })))
      if (res.error) { setBusy(false); setErr(res.error); return }
    }
    // Los renglones ya entraron: se limpian ANTES de subir para que un fallo del adjunto no los deje
    // en pantalla como si faltara mandarlos (y un segundo intento los duplicaría).
    setItems([]); setSoliciting(false)

    if (archivo) {
      const up = await uploadIpDocument(requestId, visit.protocol_id, archivo)
      if (up.error) { setBusy(false); setErr(up.error); reqQ.refetch(); return }
      setArchivo(null); setReemplazando(false)
    }

    setBusy(false)
    reqQ.refetch()
  }

  async function cancel(requestId: string) {
    setErr(null)
    const res = await cancelDispensationRequest(requestId)
    if (res.error) { setErr(res.error); return }
    reqQ.refetch()
  }

  /**
   * Elegir la constancia ya NO la sube: la deja en `archivo` hasta que se cierra la solicitud. Lo
   * único que se valida acá es lo que se puede validar sin red —tamaño y formato—, para no dejar que
   * el coordinador arme toda la solicitud y se entere del rechazo recién al mandar. Son las mismas
   * dos reglas que aplica `uploadIpDocument` antes de tocar Storage.
   */
  function elegirConstancia(f: File) {
    if (f.size > IP_MAX_BYTES) {
      setErr(`El archivo pesa ${formatBytes(f.size)} y el máximo es 10 MB.`)
      return
    }
    if (!IP_MIME_TYPES.includes(f.type)) {
      setErr('Formato no admitido. Se aceptan PDF, JPG, PNG y WEBP.')
      return
    }
    setErr(null)
    setArchivo(f)
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
   * Va SIEMPRE como subsección propia y al final de la tarjeta (el `Sub` de afuera lo rotula), con
   * la última a la vista y el resto plegado. Antes se dibujaba adentro de la subsección de
   * concomitante, partiendo al medio lo que se está haciendo ahora; y como colgaba de esa rama, en
   * una visita solo-IP no se renderizaba NUNCA — entregado el pedido, no quedaba ningún rastro de la
   * dispensación en la tarjeta.
   */
  function renderHistorial() {
    if (histReqs.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleClosed.map(renderCard)}
        {histReqs.length > 1 && (
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

  // Los `mostrar*` y no los flags del cronograma: si el cronograma se destildó con un pedido de IP
  // abierto —o si esta dispensación existe por EXCEPCIÓN, donde el cronograma dice que no—, la
  // tarjeta seguiría diciendo "esta visita no entrega medicación" arriba de un pedido vivo.
  const nada = !mostrarConcomitante && !mostrarIp && !mostrarExcepcion

  return (
    <Panel
      title="Dispensación" icon="pill" accent={accent}
      // SIEMPRE teñida, también sin nada que dispensar. **Revierte la D8** ("el realce se apaga si no
      // hay nada", mock §4) por pedido explícito del Director el 2026-08-11: "agregale color a la
      // dispensación". Lo miró en pantalla y el apagado le dejaba la tarjeta en blanco justo donde
      // está la salida de "Dispensar fuera de cronograma", que es una acción real y no un hueco.
      // El razonamiento viejo —una sección sin trabajo no llama la atención— sigue siendo cierto en
      // general; acá pesa más que la dispensación se encuentre de un vistazo en una ficha con seis
      // tarjetas iguales.
      highlight
      tint={{ band: 'var(--spira-band-track)', body: 'var(--spira-tint-track)' }}
    >
      {nada ? (
        <>
          {/* `ink-soft` y no el `faint` de antes: sobre el tinte del cuerpo el faint da 1,66:1 y esta
              frase es la que explica por qué la sección está vacía, o sea justo la que hay que poder
              leer. `ink-soft` da 4,58:1, apenas arriba del 4,5 de AA y sin subir al ink pleno, que
              la pondría a gritar en una tarjeta que no tiene nada para hacer. */}
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)', padding: '4px 0' }}>Esta visita no entrega medicación.</div>
          {/* La salida (mock, estado 5). Solo en la vista del día: en la ficha del paciente no se
              dispensa. El 4 de padding de arriba + este margen dan los 11px de aire del mock. */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => { setFueraCronograma(true); setErr(null) }}
              style={{ ...addBtnQuiet, marginTop: 7 }}
            >
              <Icon name="plus" size={15} color="var(--spira-muted)" /> Dispensar fuera de cronograma
            </button>
          )}
        </>
      ) : (
        <>
          {err && <div style={errBox}>{err}</div>}

          {/* El aviso de dispensación reciente va ARRIBA DE TODO: si llega después de que el
              coordinador ya cargó la medicación, llega tarde. Con la excepción en pantalla se muda
              adentro de esa subsección —que también es lo primero— y ahí cambia al tono de alerta,
              porque es el único contexto en el que una entrega repetida es un riesgo real.
              Sin guarda de `ultima`: `AvisoReciente` recibe el `QueryResult` entero y decide sola si
              hay algo que mostrar (loading / error / dato / nada) — ver el porqué en su comentario. */}
          {!mostrarExcepcion && <AvisoReciente query={ultimaQ} alerta={false} accent={accent} />}

          {mostrarExcepcion && (
            <Sub label="Fuera de cronograma" first excepcion>
              <AvisoReciente query={ultimaQ} alerta accent={accent} />
              {reqExcepcion && !necesitaMotivo ? (
                // Con el pedido ya creado manda el motivo SELLADO en la fila, no el desplegable: es
                // el texto que Farmacia ve en el cajón y que sale impreso en el comprobante, y
                // dejarlo editable acá lo haría diferir del papel. Sobre papel blanco, como todo lo
                // que vive adentro de la tarjeta.
                <div style={{ ...itemRow, color: 'var(--spira-ink)' }}>
                  {reqExcepcion.off_schedule_reason ?? 'Sin motivo registrado'}
                </div>
              ) : (
                // Sin `reqExcepcion` la excepción todavía no se pidió, y eso solo puede pasar por
                // `fueraCronograma`, que únicamente se prende en la vista del día: acá nunca se
                // llega en modo lectura.
                //
                // `searchable="never"`: son cinco motivos cortos, entran todos en el menú. Con el
                // 'auto' por default el umbral (5) se cumple justo y aparecería un buscador para
                // filtrar una lista que ya se lee entera de un vistazo.
                <SearchableSelect
                  value={motivo}
                  // Limpia el error de "falta el motivo" (`FALTA_MOTIVO_MSG`) apenas el coordinador
                  // elige uno: sin esto el recuadro rojo quedaba pegado en pantalla —ya con el motivo
                  // elegido y todo listo para reintentar— hasta el próximo intento de solicitar.
                  onChange={(v) => { setMotivo(v); setErr(null) }}
                  options={MOTIVOS_FUERA_CRONOGRAMA}
                  placeholder="Motivo de la excepción…"
                  searchable="never"
                />
              )}
            </Sub>
          )}

          {mostrarConcomitante && (
            <Sub label="Medicación concomitante" first={!mostrarExcepcion}>
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

              {readOnly && requests.length === 0 && !reqQ.loading && (
                <div style={{ ...muted, padding: '2px 0' }}>Sin dispensación solicitada.</div>
              )}

              {/* Los renglones ELEGIDOS y todavía no enviados, afuera del selector y con la misma
                  forma que los ya pedidos: son parte de la solicitud que se está armando, no del
                  formulario que los carga. La píldora dice en qué estado están, que es la única
                  diferencia real con los de arriba. */}
              {items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                  {items.map((it, i) => (
                    <div key={it.medication_id} style={itemRow}>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      <span className="spira-mono" style={{ color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>x{it.quantity}</span>
                      <span style={{ ...pillBase, color: 'var(--spira-acc-deep-warn)', background: WARN_TINT_PILL }}>Sin solicitar</span>
                      <button
                        type="button" aria-label={`Quitar ${it.name}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                        style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
                      >
                        <Icon name="x" size={15} color="var(--spira-muted)" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* "Elegir" y no "Agregar": en el resto de Spira "Agregar" quiere decir DAR DE ALTA
                  —"Agregar medicamento" es el alta en el catálogo global de Farmacia, "Agregar al
                  catálogo" la cierra, y el "Agregar" de la ficha le ASIGNA medicación al paciente—.
                  Acá no se da de alta nada: se elige entre la medicación que el paciente YA tiene
                  asignada, para pedirle a Farmacia que la dispense. Encima, con el rótulo viejo este
                  botón y el que suma el renglón (30px más abajo, adentro del recuadro que este mismo
                  abre) decían los dos "Agregar" para dos cosas distintas. Ahora la cadena es
                  Elegir → Agregar → Listo → Solicitar: un verbo por paso. Lo reportó el Director,
                  que no lo entendió al usarlo — 2026-09-04. */}
              {!readOnly && !soliciting && (
                <button type="button" onClick={() => { setSoliciting(true); setErr(null) }} style={addBtn}>
                  <Icon name="plus" size={16} color={accent} /> Elegir medicación
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

                    </>
                  )}

                  {/* El selector ya no solicita nada: solo suma renglones a la lista de arriba. Queda
                      abierto después de agregar —cargar dos o tres medicamentos seguidos es lo
                      normal— y se cierra con "Listo". El envío es uno solo y vive al pie de la
                      tarjeta, junto con la constancia. */}
                  <button
                    type="button" onClick={() => { setSoliciting(false); setPick(''); setQty(''); setErr(null) }}
                    style={{ marginTop: 12, height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13 }}
                  >
                    Listo
                  </button>
                </div>
              )}
            </Sub>
          )}

          {mostrarIp && (
            <Sub label="Producto en investigación" first={!mostrarExcepcion && !mostrarConcomitante}>
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

              {archivo ? (
                // Elegida y todavía sin enviar. Manda sobre cualquier otra rama —incluso sobre una
                // constancia ya cargada, cuando se está reemplazando—: es lo que va a quedar cuando
                // se cierre la solicitud, y mostrar la vieja ahí sería mostrar lo que ya no va.
                <ConstanciaPendiente
                  file={archivo} accent={accent}
                  onQuitar={() => { setArchivo(null); setReemplazando(false); setErr(null) }}
                />
              ) : ipEnCurso ? (
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
                    <ConstanciaDropzone accent={accent} busy={busy} onFile={elegirConstancia} />
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
                <ConstanciaDropzone accent={accent} busy={busy} onFile={elegirConstancia} />
              )}
            </Sub>
          )}

          {/* El historial va SIEMPRE al final y como subsección propia. Antes vivía adentro de
              "Medicación concomitante", entre los renglones del pedido abierto y el botón de
              agregar: partía al medio lo único que se está haciendo ahora con dos o tres pedidos
              muertos, y la sección de IP quedaba empujada abajo de una pila de canceladas. Lo que
              pasó es pasado; lo que hay que hacer va primero. */}
          {histReqs.length > 0 && (
            <Sub label="Historial" first={!mostrarExcepcion && !mostrarConcomitante && !mostrarIp}>
              {renderHistorial()}
            </Sub>
          )}

          {/* EL CIERRE DE LA SOLICITUD. Un solo botón para todo lo que se armó arriba —renglones y
              constancia—, al pie y no adentro de una subsección: la solicitud es una, y el lugar
              donde se cierra tiene que decirlo. Aparece solo cuando hay algo sin mandar, así que en
              una tarjeta ya resuelta no queda un botón esperando.

              Arriba del botón va lo que hace falta saber ANTES de apretarlo: qué se va a mandar y,
              si corresponde, que va a abrir un pedido aparte. Enterarse después es enterarse tarde. */}
          {!readOnly && (items.length > 0 || archivo) && (
            <div style={enviarStyle}>
              {avisoPedidoNuevo && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 10, background: WARN_TINT, fontSize: 12.5, color: 'var(--spira-ink)' }}>
                  <Icon name="info" size={15} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
                  <span>{avisoPedidoNuevo}</span>
                </div>
              )}
              <button
                type="button" onClick={enviar} disabled={busy}
                style={{
                  width: '100%', height: 44, borderRadius: 12, border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  background: accent, color: 'var(--spira-on-accent)',
                  fontFamily: 'var(--spira-font-text)', fontWeight: 700, fontSize: 14,
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? 'Solicitando…' : destino ? 'Sumar a la solicitud' : 'Solicitar dispensación'}
              </button>
              <div style={{ fontSize: 11.5, color: 'var(--spira-ink-soft)', textAlign: 'center', lineHeight: 1.45 }}>
                {resumenPendiente} · Farmacia lo ve recién al solicitar.
              </div>
            </div>
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
                <span style={{ ...pillBase, color: 'var(--spira-acc-deep-warn)', background: WARN_TINT_PILL }}>Incompleta</span>
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
