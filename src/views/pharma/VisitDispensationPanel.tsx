import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { SearchableSelect } from '../../components/SearchableSelect'
import type { SelectOption } from '../../components/SearchableSelect'
import { formatDateTimeAR } from '../../lib/dates'
import {
  usePatientMedications,
  useVisitDispensations,
  useContextoDispensacion,
  useCandidatosOtro,
  solicitarHabilitacion,
  quitarHabilitacion,
  uploadReceta,
  openIpDocument,
  motivoNoHabilitado,
  cantidadConPartes,
  partesDeRenglon,
  createDispensationRequest,
  addDispensationItems,
  cancelDispensationRequest,
  updateDispensationItemQuantity,
  removeDispensationItem,
  useStockDeLaVisita,
  activeDispensation,
  columnOf,
  constanciaVigente,
  uploadIpDocument,
  formatBytes,
  IP_MAX_BYTES,
  IP_MIME_TYPES,
} from '../../data/pharma'
import type { DispensationRequestRow, HabilitacionRow, IpDocumentRow } from '../../data/pharma'
import { bumpIpEstado, useMarcaIp, useVisitIpStatus } from '../../data/visitIp'
import { avisoStock, descripcionStock } from './stockVisita'
import { edicionDelPedido } from './edicionPedido'
import { badgeOf } from './dispensaciones/estados'
import {
  MOTIVOS_FUERA_CRONOGRAMA,
  FALTA_MOTIVO_MSG,
  necesitaMotivoFueraCronograma,
} from './motivosFueraCronograma'
import { Panel } from '../track/Panel'
import { desenlaceIp } from '../track/ipEstado'
import { IpSalidas } from '../track/IpSalidas'
import { DANGER_TINT, WARN_TINT, WARN_TINT_PILL, Sub, btnChico, itemRow, muted, pillBase } from './panelDispensacion'
import { FormularioOtro } from './FormularioOtro'
import { SeccionIp } from './SeccionIp'
import { contenidoSeccionIp, esVisitaHistorica, mostrarAvisoIp, ofrecerRegistrarIp } from './seccionIpModel'
import { HistorialEntregas } from './HistorialEntregas'
import { ComprobanteTicket, ConstanciaEnTicket, nombreTicket, renglonTicket } from './ComprobanteTicket'
import { comprobanteDe, fraseSinEntrega, mostrarSeccionIp, pedidosConComprobante, rechazoParaAvisar } from './comprobanteModel'
import { vistaVisitaCerrada } from './visitaCerradaModel'
import { EntregarEnPartes, partesInvalidas } from './EntregarEnPartes'
import { AvisoIpReciente, AvisosDeEntrega } from './AvisosDeEntrega'
import { avisoIp, avisoRojo } from './avisoReciente'
import type { Elegido } from './avisoReciente'
import { renglonDeSaldo, saldosDeLaVisita } from './saldoModel'
import type { SaldoCaja } from './saldoModel'

// STATUS_META y badgeOf viven en dispensaciones/estados.ts (única fuente para Track y Pharma).
// badgeOf distingue "lista para retirar" de "entregada": para RequestStatus ambas son `atendida`,
// pero para la coordinadora son cosas distintas (una la puede ir a buscar el paciente).

const errBox: CSSProperties = {
  fontSize: 12.5, color: 'var(--spira-acc-deep-danger)', background: DANGER_TINT, borderRadius: 8, padding: '8px 11px', marginBottom: 10,
}

/* Los motivos de la excepción y la regla de cuándo hace falta uno viven en
   `./motivosFueraCronograma` (ver el import de arriba): los comparte con el alta manual del
   mostrador de Farmacia, que declara exactamente el mismo hecho clínico y lo imprime en el
   mismo comprobante. Estaban acá como consts privadas con un comentario que prometía fuente
   única; cuando el mostrador necesitó la lista, la promesa pasó a ser cierta por construcción. */

/** Editar la cantidad de un renglón ya pedido (0121): el input entra en el alto del renglón. */
const qtyInline: CSSProperties = {
  width: 64, height: 30, borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  background: 'var(--spira-white)', padding: '0 8px', fontFamily: 'var(--spira-font-text)', fontSize: 13,
  color: 'var(--spira-ink)', flex: '0 0 auto',
}
/** Lápiz y cruz de un renglón ya pedido: el mismo botón mudo que quita un renglón sin enviar. */
const iconBtn: CSSProperties = {
  flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer',
  display: 'grid', placeItems: 'center', padding: 2,
}
/** El aviso de stock (0121): una línea en tinta atenuada, sin caja — informa, no bloquea. */
const avisoStockStyle: CSSProperties = {
  fontSize: 12, color: 'var(--spira-acc-deep-warn)', padding: '4px 12px 0', lineHeight: 1.4,
}

/** El rechazo que nadie volvió a pedir: tinte de peligro, texto en tinta (el rojo va en el ícono). */
const rechazoStyle: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', borderRadius: 10, marginBottom: 10,
  background: DANGER_TINT, fontSize: 12.5, color: 'var(--spira-ink)', lineHeight: 1.45,
}
/** «Falta la constancia» adentro del ticket: texto en TINTA, el ámbar sólo en el ícono y el fondo
 *  (`--spira-warn` a 12,5px bold sobre este tinte da 3,2:1; AA pide 4,5:1 — medido en el mock). */
const faltaStyle: CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 10,
  background: WARN_TINT, fontSize: 12.5, color: 'var(--spira-ink)', fontWeight: 600,
}
/** «Registrar entrega» en una visita cerrada sin entrega: la acción primaria de ese estado (mock). */
const btnPrimario = (accent: string): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 38,
  borderRadius: 9, border: 'none', background: accent, color: 'var(--spira-on-accent)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
})
/**
 * «Nueva dispensación», afuera y abajo del ticket (spec D11): borde del acento al 35% y texto
 * petróleo. El texto va en `--spira-acc-deep-teal` y no en el acento a secas: `--spira-track` no cambia
 * en oscuro y sobre la card oscura da 3,1:1; el profundo es el mismo petróleo en claro (5,7:1) y se
 * aclara en oscuro (6,0:1). El borde en longhands (trampa de la abreviada + longhand).
 */
const btnNueva: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 38, marginTop: 12,
  borderRadius: 9, borderWidth: 1, borderStyle: 'solid',
  borderColor: 'color-mix(in srgb, var(--spira-acc-deep-teal) 35%, var(--spira-white))',
  background: 'var(--spira-white)', color: 'var(--spira-acc-deep-teal)', cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 12.5,
}
/** El cierre de la solicitud: el filete lo separa de lo que se está armando arriba. */
const enviarStyle: CSSProperties = {
  marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--spira-line)',
  display: 'flex', flexDirection: 'column', gap: 9,
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
 * Un renglón elegido y todavía sin mandar. `quantity_indicated` si va «en partes» (D8);
 * `saldo_de_item_id` si lo sumó «Pedir el saldo» (R2).
 */
interface PendingItem {
  medication_id: string
  name: string
  quantity: number
  quantity_indicated?: number | null
  saldo_de_item_id?: string | null
  /** «Otro medicamento» (0124): la receta elegida, que se sube recién al solicitar. */
  receta?: File | null
  /** Saldo de un «Otro» (0124, R6): la habilitación original cuya receta se reusa. */
  origen_habilitacion_id?: string | null
}

/** Un renglón elegido que viaja como pedido de habilitación y no como renglón (0124). */
const esOtro = (i: PendingItem) => !!i.receta || !!i.origen_habilitacion_id

/** La línea chica debajo de un renglón: con qué receta va, o por qué no se habilitó. */
const lineaBajoRenglon: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12, color: 'var(--spira-ink-soft)',
  padding: '5px 12px 0', lineHeight: 1.4,
}
const verRecetaBtn = (accent: string): CSSProperties => ({
  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--spira-font-text)',
  fontWeight: 600, fontSize: 12, color: accent, textDecoration: 'underline', textUnderlineOffset: 2,
})

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
 * LO PEDIDO SE LEE COMO COMPROBANTE (handoff `design_handoff_dispensacion_estado`, spec del
 * 2026-09-21). Cada pedido vivo o entregado de la visita es un ticket (`ComprobanteTicket`): sello de
 * estado, N° de comprobante, fecha y quién, y adentro las dos partes de la entrega —concomitante e
 * IP—, porque es UNA entrega con un número y un estado. Reemplaza al pie común («Pedido del … ·
 * píldora · Cancelar solicitud») y al historial plegado: el estado vivía en una píldora chica al pie y
 * lo entregado se veía igual que un pedido en curso. Las entregas de las OTRAS visitas están en el
 * chip «Historial» de la banda (`HistorialEntregas`).
 *
 * EL ORDEN DE LA TARJETA ES FIJO: tickets · avisos · (sin entrega) · Medicación concomitante ·
 * Producto en investigación · Solicitar · «Nueva dispensación». El estado primero (handoff, punto 1);
 * lo que frena la mano, antes de cargar nada; volver a dispensar, afuera y abajo del ticket, para que
 * nunca compita con «Corregir esta entrega».
 *
 * Solicitar / cancelar / cargar constancia viven solo en la vista del día (`!readOnly`); en la ficha
 * del paciente el panel es de solo lectura (la constancia se puede VER, no reemplazar).
 *
 * Con el pedido YA CERRADO —entregado— la subsección de IP también pasa a lectura aunque estemos en
 * la vista del día: la constancia es nota fuente de un hecho consumado, y en su lugar va el
 * desenlace (fecha · estado · comprobante). Ofrecer ahí el dropzone crearía un segundo pedido para
 * una visita ya dispensada, que es exactamente lo que la 0072 vino a evitar del otro lado.
 *
 * FUERA DE CRONOGRAMA. La sección del producto en investigación existe siempre (plan D18): si el
 * cronograma no lo prevé, su estado vacío ofrece «Pedir fuera de cronograma», y al tocarlo el rótulo
 * pasa a ámbar y adentro de ESA sección van el motivo y la constancia (`SeccionIp`). Antes era una
 * subsección aparte arriba de todo, a la que se llegaba por un botón suelto al pie. El motivo es la
 * ÚNICA puerta que tiene la base para saltear la validación del cronograma
 * (`create_dispensation_request`, 0071), y viaja como etiqueta legible porque termina en el
 * comprobante impreso que lee un monitor.
 *
 * Y arriba de todo, los AVISOS (plan D14, D24, D25, Tanda 3b; `AvisosDeEntrega`): si lo que se elige
 * es una droga que el paciente recibió en los últimos 30 días —en este protocolo o en otro— o tiene
 * pedida sin retirar, va una caja roja ANTES de cargar nada; si llega después, llega tarde. Nunca
 * bloquea. Abajo del rojo, los SALDOS de lo entregado en partes, con «Pedir el saldo». Con la
 * excepción fuera de cronograma abierta, lo que se muda a la sección del IP es el aviso de la última
 * entrega de IP, en ámbar (`AvisoIpReciente`).
 */
export function VisitDispensationPanel({ visit, accent, readOnly }: {
  /** `ready_at` = fin de atención. Con la visita cerrada la tarjeta muestra qué pasó en vez de
   *  invitar a dispensar (spec del 2026-09-15). NO se usa `real_date`: esa se pone al EMPEZAR a
   *  atender, y ahí todavía falta dispensar. */
  visit: { id: string; enrollment_id: string; protocol_id: string; dispenses: boolean; dispenses_ip: boolean; ready_at: string | null }
  accent: string
  readOnly: boolean
}) {
  const reqQ = useVisitDispensations(visit.id)
  const medsQ = usePatientMedications(visit.enrollment_id)
  /**
   * Lo entregado, lo pedido y los saldos del paciente, para los avisos (0123, R7). Una consulta por
   * panel y sólo en la vista del día, por los mismos dos motivos que tenía el aviso viejo: existe para
   * frenar la mano ANTES de pedir, y en la ficha, abriendo una visita de hace dos meses, «recibió
   * omeprazol hace 3 días» habla de OTRA visita — un dato cierto puesto donde se lee como falso.
   */
  const ctxQ = useContextoDispensacion(visit.id, !readOnly)
  const [soliciting, setSoliciting] = useState(false)
  const [pick, setPick] = useState('')
  // Arranca en 1: es lo que se pide casi siempre, y un campo vacío obligaba a tipear (Director, 2026-09-14).
  const [qty, setQty] = useState('1')
  /** «En partes» (D8): la casilla y lo indicado. Se limpian con el renglón, como `pick` y `qty`. */
  const [enPartes, setEnPartes] = useState(false)
  const [indicado, setIndicado] = useState('')
  /** El selector muestra el formulario de «Otro medicamento» (0124) en lugar de la lista. */
  const [modoOtro, setModoOtro] = useState(false)
  /** «Pedir de nuevo» (D23): lo que el formulario de «Otro» abre ya cargado. */
  const [inicialOtro, setInicialOtro] = useState<{ medicationId: string; quantity: number; quantityIndicated: number | null } | null>(null)
  const [items, setItems] = useState<PendingItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /**
   * El estado del IP de la visita, el MISMO que lee la fila de Procedimientos (`v_visit_ip_status`,
   * 0119; plan R11). Con el cierre —«No corresponde» o «Entregado en otra visita»— la sección lo dice y
   * no ofrece nada; en los demás estados arma el desenlace (spec 2026-09-19), decide si se ofrece
   * «Registrar la entrega» (E3, `ofrecerRegistrarIp`) y si va el aviso de entrega repetida (E4,
   * `mostrarAvisoIp`). Se refresca solo con `bumpIpEstado`, que ya dispara esta tarjeta al pedir o
   * cancelar.
   */
  const ipQ = useVisitIpStatus(visit.id)
  /** La marca de la 0119, para decir «Visita anterior al registro del IP» sólo cuando es cierto (spec del
   *  2026-09-19, E2). Aparte porque `v_track_visits` no la trae. */
  const marcaQ = useMarcaIp(visit.id)
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
  /** El renglón del pedido cuya cantidad se está cambiando (0121, D5), y el valor que se tipea. */
  const [editando, setEditando] = useState<{ itemId: string; qty: string } | null>(null)
  /**
   * Stock de la medicación habilitada, del protocolo de la visita (0121, D6). Una consulta por panel y
   * sólo donde se puede pedir: en la ficha (lectura) no hay nada que decidir con ese número.
   */
  const stockQ = useStockDeLaVisita(visit.id, !readOnly)
  /**
   * Los candidatos de «Otro» (0124). Sólo con el selector abierto: casi nunca se usa, y la consulta
   * también dice si esta persona puede pedirlo (R5: Farmacia o quien coordina la visita).
   */
  const candidatosQ = useCandidatosOtro(visit.id, !readOnly && soliciting)
  const ofrecerOtro = !readOnly && !candidatosQ.sinPermiso
  const stockDe = (medicationId: string) => (stockQ.data ?? []).find((s) => s.medication_id === medicationId)

  const requests = reqQ.data ?? []
  /* La visita terminada muestra qué pasó y no invita a cargar. `cerrada` NO reemplaza a `readOnly`,
     que sigue significando permisos: se combinan. `readOnly` sale del ROL (`visitPermissions.ts`),
     no de la pantalla — un operador de Coordinación ve "Corregir entrega" también desde la ficha,
     y es a propósito: coherente con "leer, con una salida explícita" (Director, 2026-09-15). */
  const vista = vistaVisitaCerrada({
    readyAt: visit.ready_at,
    pedidos: requests,
    // Tratar el error igual que la carga: sin esto, una consulta que FALLA deja `data` en `null`
    // para siempre y la tarjeta queda fija diciendo "no se entregó medicación" — dato inventado
    // presentado como real. `reqQ.error` no se muestra en ningún lado, así que tiene que degradar acá.
    cargando: reqQ.loading || !!reqQ.error,
  })
  const cerrada = vista.concomitante.tipo !== 'abierta'
  /** Con la visita cerrada, cargar deja de ser lo normal y pasa a ser una corrección explícita. */
  const [corrigiendo, setCorrigiendo] = useState(false)
  const puedeCargar = !readOnly && (!cerrada || corrigiendo)
  /**
   * Cuándo se ofrece corregir una visita terminada, y el gesto que lo abre. Lo usan DOS puertas:
   * «Registrar entrega» / «Corregir entrega» de concomitante y «Registrar la entrega» de la sección
   * del IP (spec 2026-09-19, E3). Una sola condición y un solo gesto, para que las dos no puedan
   * divergir. `!== 'cargando'`: mientras la lectura de pedidos no vuelve, no se sabe si hubo entrega
   * (Hallazgo 1, revisión final 2026-09-15).
   */
  const puedeCorregir = !readOnly && cerrada && !corrigiendo && vista.concomitante.tipo !== 'cargando'
  const abrirCorreccion = () => { setCorrigiendo(true); setSoliciting(true); setErr(null) }
  // Abiertas = todavía accionables (solicitada / preparando / lista para retirar); van siempre
  // arriba. Cerradas = entregada / cancelada / rechazada.
  // `columnOf` devuelve null para cancelada/rechazada y 'entregada' para las ya retiradas.
  const openReqs = requests.filter((r) => {
    const col = columnOf(r)
    return col === 'solicitada' || col === 'preparando' || col === 'lista'
  })
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
  /** La sección del IP va en excepción: viva, o ya consumada (el pedido de excepción entregado). */
  const mostrarExcepcion = excepcionViva || reqExcepcion !== null
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
   *
   * El camino es 'cualquiera' porque ESTA pantalla ofrece los dos: renglones de medicación y
   * constancia de IP. Alcanza con que el cronograma autorice uno para que la visita no sea una
   * excepción — y desde la 0121 los renglones de base no piden cronograma, así que el hueco que
   * deja el otro camino ya no le abre nada a nadie. El mostrador de
   * Farmacia, que siempre manda renglones, usa 'renglones'.
   */
  /*
   * 0121: con la base libre, el motivo es SÓLO del producto en investigación fuera de cronograma. Hace
   * falta cuando lo que nace es un pedido que lleva la constancia y el cronograma no prevé IP — o
   * cuando el pedido abierto al que se sumaría no la acepta (`ipVaAparte`, abajo) y el IP tiene que
   * nacer en uno propio. Un pedido de pura base nunca pide motivo.
   */
  const destinoAceptaIp = destino !== null && (destino.includes_ip || destino.off_schedule)
  const ipVaAparte = archivo !== null && destino !== null && !destinoAceptaIp
  const necesitaMotivo = !readOnly && archivo !== null && (destino === null || ipVaAparte)
    && necesitaMotivoFueraCronograma(visit, 'solo_ip')
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
    .map((m) => ({
      value: m.medication_id,
      label: m.medication?.name ?? 'Medicamento',
      // 0121 (D6): el stock, antes de elegir. Sin dato (cargando o error) no se afirma nada.
      desc: descripcionStock(stockDe(m.medication_id)),
    }))

  // —— «Otro medicamento» (0124, Tanda 3c) ——
  /** Los «Otro» de los pedidos abiertos que se ven como fila: por habilitar o no habilitados. */
  const habilitacionesAbiertas: { r: (typeof openReqs)[number]; h: HabilitacionRow }[] = openReqs.flatMap((r) =>
    (r.habilitaciones ?? []).filter((h) => h.estado !== 'habilitada').map((h) => ({ r, h })))
  const pendientesDeHabilitar = new Set(habilitacionesAbiertas.filter(({ h }) => h.estado === 'pendiente').map(({ h }) => h.medication_id))
  /** Lo que el formulario de «Otro» no ofrece: ya está en lo que se va a mandar o ya se pidió. */
  const excluidosOtro = new Set([...pendingIds, ...yaEnPedido, ...pendientesDeHabilitar])

  // —— Avisos y saldos (0123, Tanda 3b) ——
  /**
   * Los saldos de lo entregado en partes. «Ocupado» = el medicamento ya tiene un renglón normal en lo
   * que se va a mandar o en el pedido al que se sumaría: la base no deja dos renglones del mismo
   * medicamento en un pedido (0123), así que ofrecer «Pedir el saldo» ahí terminaría en un error.
   */
  const ocupados = new Set([
    ...items.filter((i) => !i.saldo_de_item_id).map((i) => i.medication_id),
    ...(destino?.items ?? []).map((i) => i.medication_id),
    ...(destino?.habilitaciones ?? []).filter((h) => h.estado === 'pendiente').map((h) => h.medication_id),
  ])
  const saldos = saldosDeLaVisita(ctxQ.data ?? [], items, ocupados)
  /**
   * Lo elegido que puede disparar el rojo: lo sumado sin mandar y lo que está en el desplegable. Se
   * avisa apenas se elige, antes de «Agregar» (mock 1): después llega tarde.
   */
  const drogaDe = (medicationId: string) => activeMeds.find((m) => m.medication_id === medicationId)?.medication?.drug_id ?? null
  const elegidos: Elegido[] = [
    ...items.map((i) => ({ medication_id: i.medication_id, drug_id: drogaDe(i.medication_id), esSaldo: !!i.saldo_de_item_id })),
    ...(pick && !pendingIds.has(pick) ? [{ medication_id: pick, drug_id: drogaDe(pick), esSaldo: false }] : []),
  ]
  const ahora = new Date()
  const rojo = avisoRojo(ctxQ.data ?? [], elegidos, saldos, ahora)

  /** «Pedir el saldo»: suma el renglón con todo lo que falta. Se manda con el resto, al solicitar. */
  function pedirSaldo(s: SaldoCaja) {
    const r = renglonDeSaldo(s)
    setItems((xs) => [...xs, { ...r, name: s.nombre }])
    setErr(null)
  }

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

  // El N° de comprobante vive ahora en el ticket de cada pedido: la regla (sólo si la dispensación salió
  // de `en_preparacion`; el correlativo de una preparación cancelada queda reservado) está en
  // `comprobanteModel.ts`, con test.

  // —— Producto en investigación ——
  // Algún pedido abierto lleva IP SELLADO por el servidor (0071, índice de `supabase/README.md`).
  // El porqué de mirar el sello y no solo el cronograma está entero en `ipPrevisto`, más abajo.
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
   * Si el IP está PREVISTO en esta visita, que es lo que decide entre ofrecer el dropzone y el estado
   * vacío «El cronograma no lo pide». Tres razones, cualquiera alcanza:
   *
   *   · el CRONOGRAMA lo dice (`dispenses_ip`), que es el caso normal;
   *   · un pedido abierto lo tiene SELLADO (`ipSellado`): el servidor sella `includes_ip` al crear
   *     el pedido justamente porque el cronograma puede cambiar después (0071). Mirando solo el
   *     cronograma, destildar `dispenses_ip` con un pedido abierto que ya lleva IP dejaba la tarjeta
   *     sin lugar donde cargar la constancia, y Farmacia trabada porque su RPC la exige;
   *   · la excepción está VIVA: fuera de cronograma el pedido nace con `includes_ip` en false (la
   *     excepción no implica IP, 0071 §create) y recién lo prende al adjuntar la constancia — o sea
   *     que sin este término no habría dónde adjuntarla y el sello nunca llegaría a prenderse.
   *
   * El pedido ENTREGADO con constancia no entra acá: es su propio contenido de la sección
   * (`contenidoSeccionIp`), en lectura, aunque después alguien haya destildado el cronograma.
   */
  const ipPrevisto = visit.dispenses_ip || ipSellado || excepcionViva

  // Con un pedido abierto la sección está EN CURSO: se carga o se reemplaza la constancia contra él.
  // Sin ninguno abierto no hay a qué adjuntarla — o se muestra en lectura la del pedido entregado,
  // o, si no hay nada todavía, el dropzone, que es el que crea el pedido (estado 2 del mock).
  const ipEnCurso = openReq !== null

  /**
   * Si el pedido ABIERTO en curso realmente acepta que se le adjunte constancia. OJO: esto NO es
   * `ipPrevisto` (que también se prende con el cronograma vivo) — es a propósito el mismo sello con
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
  // 0121: con la excepción abierta, un pedido de pura base abierto ya no bloquea el adjunto — el IP
  // nace en su propio pedido con el motivo (`ipVaAparte` en `enviar`), porque ese pedido de base no
  // tiene `off_schedule` que lo habilite y el servidor lo rechazaría.
  const ipAceptaAdjunto = destino ? destinoAceptaIp || excepcionViva : visit.dispenses_ip || excepcionViva

  /** Lo indicado, si «En partes» está tildado y el número es válido. `null` = entrega completa. */
  const indicadoNum = enPartes ? parseInt(indicado, 10) : NaN
  const qtyNum = parseInt(qty, 10)
  /** «En partes» con lo indicado sin completar, o no mayor a lo de ahora: «Agregar» no lo deja pasar. */
  const partesMal = partesInvalidas(enPartes, indicado, qtyNum)

  function addItem() {
    if (!pick || !Number.isFinite(qtyNum) || qtyNum <= 0 || partesMal) return
    const med = activeMeds.find((m) => m.medication_id === pick)
    setItems((xs) => [...xs, {
      medication_id: pick, name: med?.medication?.name ?? 'Medicamento', quantity: qtyNum,
      quantity_indicated: enPartes ? indicadoNum : null,
    }])
    setPick(''); setQty('1'); setEnPartes(false); setIndicado('')
  }

  /** Lo que viaja al servidor por renglón: lo de siempre, más las partes o el saldo si los hay. */
  const aRenglonDelPedido = (i: PendingItem) => ({
    medication_id: i.medication_id,
    quantity: i.quantity,
    ...(i.quantity_indicated ? { quantity_indicated: i.quantity_indicated } : {}),
    ...(i.saldo_de_item_id ? { saldo_de_item_id: i.saldo_de_item_id } : {}),
  })

  /** Quita un «Otro» todavía por habilitar de un pedido solicitado (0124, la ✕ del mock 4). */
  async function quitarOtro(habilitacionId: string) {
    setBusy(true); setErr(null)
    const res = await quitarHabilitacion(habilitacionId)
    setBusy(false)
    if (res.error) setErr(res.error)
    reqQ.refetch(); stockQ.refetch(); ctxQ.refetch()
  }

  /** Abre la receta en una pestaña: la misma maña de `window.open` que la constancia del IP. */
  async function verReceta(path: string) {
    setErr(null)
    const e = await openIpDocument(path)
    if (e) setErr(e)
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
    // Guarda por las dudas y no solo por el botón: `items`/`archivo` son estado LOCAL sin enviar,
    // así que "hay un pedido abierto ⇒ cerrada = false" no los cubre. Sin este freno, un fin de
    // atención marcado DESPUÉS de elegir medicación deja el pie mostrando "Corregir entrega" arriba
    // y esta función mandando un RPC real por debajo — el mismo hueco que el del botón, un paso más
    // adentro.
    if (!puedeCargar) return
    if (!items.length && !archivo) return
    if (faltaMotivo) { setErr(FALTA_MOTIVO_MSG); return }
    setBusy(true); setErr(null)

    // Ante un rechazo del servidor se RELEE: el caso típico es que Farmacia tomó el pedido mientras la
    // tarjeta estaba abierta, y sin releer `destino` seguía apuntando a un pedido que ya no acepta
    // cambios — cada reintento chocaba contra el mismo guard y nunca aparecía "Lo está preparando".
    const releer = () => { reqQ.refetch(); stockQ.refetch(); ctxQ.refetch() }

    // 0124: los «Otro» no son renglones; viajan como pedidos de habilitación, al final.
    const normales = items.filter((i) => !esOtro(i))
    const otros = items.filter(esOtro)

    let requestId = destino?.id ?? null
    if (!requestId && (normales.length > 0 || archivo)) {
      // Sin renglones comunes ni constancia, no se crea nada acá: la primera habilitación crea el
      // pedido con ella adentro, en la misma transacción (R3). Un pedido vacío no es un pedido.
      const res = await createDispensationRequest(visit.id, normales.map(aRenglonDelPedido), null, 'track', razonExcepcion)
      if (res.error) { setBusy(false); setErr(res.error); releer(); return }
      requestId = res.id!
    } else if (requestId && normales.length) {
      const res = await addDispensationItems(requestId, normales.map(aRenglonDelPedido))
      if (res.error) { setBusy(false); setErr(res.error); releer(); return }
    }
    // Los renglones ya entraron: se limpian ANTES de subir para que un fallo del adjunto no los deje
    // en pantalla como si faltara mandarlos (y un segundo intento los duplicaría). Los «Otro» quedan
    // hasta mandarse.
    setItems(otros)
    if (!otros.length) setSoliciting(false)

    if (archivo) {
      // 0121: el pedido abierto es de pura base y no acepta la constancia (no tiene `off_schedule`
      // que lo habilite). El IP nace en SU pedido, con el motivo — son dos comprobantes, y es el
      // único camino que no le abre el IP a un pedido sin motivo.
      let ipRequestId = requestId
      if (ipVaAparte) {
        const res = await createDispensationRequest(visit.id, [], null, 'track', razonExcepcion)
        if (res.error) { setBusy(false); setErr(res.error); releer(); bumpIpEstado(); return }
        ipRequestId = res.id!
      }
      // Con constancia siempre hay pedido: si no había destino, se creó arriba justamente por ella.
      if (!ipRequestId) { setBusy(false); releer(); return }
      const up = await uploadIpDocument(ipRequestId, visit.protocol_id, archivo)
      if (up.error) { setBusy(false); setErr(up.error); releer(); bumpIpEstado(); return }
      setArchivo(null); setReemplazando(false)
    }

    // 0124 · Los «Otro», de a uno: se sube la receta y se pide la habilitación. Van al pedido que
    // quedó arriba; si no hubo ninguno, el primero lo crea y los demás se suman a ése. Si uno falla,
    // quedan en pantalla los que faltan (los que entraron ya están en la tarjeta) y se relee.
    let destinoOtro = requestId
    const quedan = [...otros]
    while (quedan.length > 0) {
      const o = quedan[0]
      let receta: { path: string; fileName: string; mime: string; size: number } | null = null
      if (o.receta) {
        const up = await uploadReceta(visit.protocol_id, o.receta)
        if (up.error || !up.path) { setBusy(false); setErr(up.error ?? 'No se pudo subir la receta.'); setItems(quedan); releer(); return }
        receta = { path: up.path, fileName: o.receta.name, mime: o.receta.type, size: o.receta.size }
      }
      const res = await solicitarHabilitacion({
        visitId: visit.id,
        requestId: destinoOtro,
        medicationId: o.medication_id,
        quantity: o.quantity,
        quantityIndicated: o.quantity_indicated ?? null,
        receta,
        saldo: o.origen_habilitacion_id && o.saldo_de_item_id
          ? { origenHabilitacionId: o.origen_habilitacion_id, saldoDeItemId: o.saldo_de_item_id }
          : null,
      })
      if (res.error) { setBusy(false); setErr(res.error); setItems(quedan); releer(); bumpIpEstado(); return }
      destinoOtro = res.requestId ?? destinoOtro
      quedan.shift()
    }
    if (otros.length) { setItems([]); setSoliciting(false) }

    setBusy(false)
    releer()
    // La fila del IP del panel de Procedimientos (0119) lee otra consulta: sin este aviso seguía
    // diciendo "Sin pedir" al lado de un pedido recién mandado, hasta reabrir el modal.
    bumpIpEstado()
  }

  async function cancel(requestId: string) {
    setErr(null)
    const res = await cancelDispensationRequest(requestId)
    // Releer también ante el error: si Farmacia ya lo tomó, la tarjeta tiene que dejar de ofrecer
    // "Cancelar solicitud" sobre un pedido que ya no se puede cancelar desde acá.
    if (res.error) { setErr(res.error); reqQ.refetch(); return }
    reqQ.refetch(); stockQ.refetch(); ctxQ.refetch()
    bumpIpEstado()
    // El otro camino que deja el modo corrección sin nada cargado: si el pedido que se acaba de
    // cancelar era el que había abierto la corrección, la visita vuelve a estar cerrada y sin
    // entrega — sin este reset la tarjeta quedaba mostrando "Elegir medicación" en vez del botón
    // sobrio, con la corrección "viva" sobre un pedido que ya no existe.
    if (corrigiendo) setCorrigiendo(false)
    // `fueraCronograma` es pegajosa MIENTRAS EL PEDIDO VIVE (ver el comentario de su declaración):
    // acá el pedido deja de existir, así que ya no hay nada sellado que la reemplace. Sin este
    // reset, cancelar un pedido "fuera de cronograma" dejaba el flag local prendido para siempre y
    // la sección del IP volvía a afirmar la excepción —ámbar, "Sin constancia cargada."— sobre una
    // visita cerrada que nunca llevó IP.
    setFueraCronograma(false)
  }

  /** Guarda la cantidad nueva de un renglón del pedido abierto (0121, D5). */
  async function guardarCantidad(itemId: string, texto: string) {
    const n = parseInt(texto, 10)
    if (!Number.isFinite(n) || n <= 0) { setErr('La cantidad debe ser mayor a cero.'); return }
    setBusy(true); setErr(null)
    const res = await updateDispensationItemQuantity(itemId, n)
    setBusy(false)
    if (res.error) { setErr(res.error); reqQ.refetch(); stockQ.refetch(); ctxQ.refetch(); return }
    setEditando(null)
    reqQ.refetch(); stockQ.refetch(); ctxQ.refetch()
  }

  /** Quita un renglón del pedido abierto (0121, D5). El último de un pedido sin IP no se quita. */
  async function quitarRenglon(itemId: string) {
    setBusy(true); setErr(null)
    const res = await removeDispensationItem(itemId)
    setBusy(false)
    if (res.error) { setErr(res.error); reqQ.refetch(); stockQ.refetch(); ctxQ.refetch(); return }
    if (editando?.itemId === itemId) setEditando(null)
    reqQ.refetch(); stockQ.refetch(); ctxQ.refetch()
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

  /* Qué muestra la sección del producto en investigación: la regla vive en `seccionIpModel.ts`, con test.
     El cierre sale de `v_visit_ip_status` y la carga cuenta las TRES lecturas —pedidos (`reqQ`), estado
     del IP (`ipQ`) y la marca de la 0119 (`marcaQ`)—: sin alguna de ellas la sección ofrecería un
     dropzone, o afirmaría un desenlace equivocado, un instante antes de enterarse de que la visita está
     cerrada o es histórica. */
  const ipCerrada = ipQ.data?.estado === 'no_corresponde' || ipQ.data?.estado === 'entregado_en_otra_visita'
  const estadoIp = ipQ.data?.estado ?? null
  const contenidoIp = contenidoSeccionIp({
    hayArchivo: archivo !== null,
    hayPedidoAbierto: ipEnCurso,
    pedidoAbiertoLaAcepta: ipAceptaAdjunto,
    entregadoConConstancia: constanciaEntregada !== null && reqEntregado !== null,
    // Tratar el error igual que la carga, misma razón que la sección de arriba: una consulta que
    // FALLA deja `data` en `null` para siempre, y sin esto la sección leía ese cero como un hecho
    // y afirmaba "El cronograma no lo pide" o «Sin entrega registrada.» sobre una visita que sí
    // llevó producto en investigación. La marca de la 0119 entra por lo mismo: sin ella, un instante
    // de «Sin entrega registrada.» antes de saber que era «anterior al registro».
    cargando: reqQ.loading || ipQ.loading || marcaQ.loading || !!reqQ.error || !!ipQ.error || !!marcaQ.error,
    cerrada: ipCerrada,
    prevista: ipPrevisto,
    /* Con la visita terminada el IP se lee, no se carga: es el mismo criterio que la sección de
       arriba, y arreglar sólo la mitad dejaría la incoherencia 60px más abajo en la misma tarjeta.
       `contenidoSeccionIp` ya sabe hacerlo: con `readOnly` una visita prevista cae en el desenlace,
       la histórica o «sin registro» (estados de lectura) en vez de «adjuntar». */
    readOnly: readOnly || (cerrada && !corrigiendo),
    estadoIp,
    historica: esVisitaHistorica(marcaQ.data),
  })

  // —— El comprobante (handoff `design_handoff_dispensacion_estado`, spec 2026-09-21) ——
  /** Los pedidos que se leen como ticket: los vivos y los entregados, en ese orden (`comprobanteModel`). */
  const tickets = pedidosConComprobante(requests)
  const hayTickets = tickets.length > 0
  /** El selector de medicación está abierto, o hay renglones elegidos sin mandar. */
  const formularioAbierto = soliciting || items.length > 0
  /** Algo se está cargando: medicación, la constancia, la excepción o un reemplazo. Mientras tanto no
   *  se ofrecen las puertas de «volver a dispensar»: ya se está dispensando. */
  const cargaEnCurso = formularioAbierto || archivo !== null || fueraCronograma || reemplazando
  /**
   * «Corregir esta entrega» (spec D10): con permiso, sin otra carga en curso y con los pedidos ya
   * leídos. También con la visita abierta: corregir mientras se atiende es lo mismo que después, una
   * carga nueva con la nota que lo explica. `puedeCorregir` sigue mandando sobre «Registrar entrega» y
   * la puerta del IP, que sólo existen con la visita cerrada.
   */
  const puedeAbrirCorreccion = !readOnly && !cargaEnCurso && vista.concomitante.tipo !== 'cargando'
  /** El rechazo que nadie volvió a pedir: antes lo mostraba el historial plegado, que se fue al chip. */
  const rechazo = rechazoParaAvisar(requests)
  /** La visita terminó sin ningún pedido vivo ni entregado (spec D12). */
  const sinEntrega = cerrada && !corrigiendo && !hayTickets && vista.concomitante.tipo !== 'cargando'
  const fraseSin = sinEntrega ? fraseSinEntrega(contenidoIp) : null
  /** La sección del IP sólo cuenta lo que el ticket no cuenta (spec D16, regla con test). */
  const mostrarIp = mostrarSeccionIp({
    contenido: contenidoIp,
    hayTickets,
    formularioAbierto: cargaEnCurso,
    constanciaEnTicket: constanciaAbierta !== null && !reemplazando,
    soloLectura: !puedeCargar,
    sinEntrega,
  })
  const hayEntregado = tickets.some((r) => columnOf(r) === 'entregada')

  /** «Nueva dispensación»: con la visita cerrada abre en modo corrección, que es la misma puerta de siempre. */
  function volverADispensar() {
    if (cerrada && !corrigiendo) { abrirCorreccion(); return }
    setSoliciting(true); setErr(null)
  }

  /** «Reemplazar» ↔ «No reemplazar» en el ticket. Desistir también suelta el archivo ya elegido. */
  function alternarReemplazo() {
    if (reemplazando) { setReemplazando(false); setArchivo(null); setErr(null) }
    else { setReemplazando(true); setErr(null) }
  }

  /**
   * Los renglones de medicación de un pedido, para su ticket. En un pedido todavía SOLICITADO se
   * editan acá mismo —cantidad y quitar—, por RPC con el guard de estado (0121, D5); en los demás
   * quedan en lectura. Los «Otro» del pedido (0124) van con su píldora y su línea de receta.
   */
  function renglonesDe(r: DispensationRequestRow): ReactNode | null {
    const otros = (r.habilitaciones ?? []).filter((h) => h.estado !== 'habilitada')
    if (r.items.length === 0 && otros.length === 0) return null
    const vivo = columnOf(r) !== 'entregada'
    const ed = edicionDelPedido(r, readOnly)
    return (
      <>
        {r.items.map((it) => {
          const qtyEdit = editando && editando.itemId === it.id ? editando.qty : null
          const nombre = it.medication?.name ?? 'Medicamento'
          const aviso = qtyEdit !== null ? avisoStock(stockDe(it.medication_id), parseInt(qtyEdit, 10), it.quantity) : null
          return (
            <div key={it.id}>
              <div style={renglonTicket}>
                <span style={nombreTicket} title={nombre}>{nombre}</span>
                {qtyEdit !== null ? (
                  <>
                    <input
                      type="number" min={1} autoFocus value={qtyEdit}
                      aria-label={`Cantidad de ${nombre}`}
                      onChange={(e) => setEditando({ itemId: it.id, qty: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void guardarCantidad(it.id, qtyEdit)
                        if (e.key === 'Escape') setEditando(null)
                      }}
                      style={qtyInline}
                    />
                    <button type="button" disabled={busy} onClick={() => void guardarCantidad(it.id, qtyEdit)} style={linkBtn}>Guardar</button>
                    <button type="button" disabled={busy} onClick={() => setEditando(null)} style={{ ...linkBtn, marginLeft: 0 }}>Cancelar</button>
                  </>
                ) : (
                  <>
                    {/* 0123 (D8): «x1 de 2» si va en partes, «x1 saldo» si completa una. */}
                    <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>
                      {cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto')}
                    </span>
                    {ed.editable && (
                      <button
                        type="button" aria-label={`Cambiar la cantidad de ${nombre}`} title="Cambiar la cantidad"
                        disabled={busy} onClick={() => { setEditando({ itemId: it.id, qty: String(it.quantity) }); setErr(null) }}
                        style={iconBtn}
                      >
                        <Icon name="pencil" size={14} color="var(--spira-muted)" />
                      </button>
                    )}
                    {ed.editable && (
                      <button
                        type="button" aria-label={`Quitar ${nombre} del pedido`}
                        title={ed.porQueNoQuitar ?? 'Quitar del pedido'}
                        disabled={busy || !ed.puedeQuitar}
                        onClick={() => void quitarRenglon(it.id)}
                        style={{ ...iconBtn, opacity: ed.puedeQuitar ? 1 : 0.4, cursor: ed.puedeQuitar ? 'pointer' : 'default' }}
                      >
                        <Icon name="x" size={15} color="var(--spira-muted)" />
                      </button>
                    )}
                  </>
                )}
              </div>
              {aviso && <div style={{ ...avisoStockStyle, padding: '2px 0 0' }}>{aviso}</div>}
            </div>
          )
        })}

        {/* 0124: «Por habilitar» mientras Farmacia no lo resuelve (mock 4); «No habilitado» con el
            motivo, quién y cuándo, y «Pedir de nuevo» sólo en un pedido vivo (mock 4b, D23). */}
        {otros.map((h) => {
          const nombre = h.medication?.name ?? 'Medicamento'
          const cant = cantidadConPartes(h.quantity, { indicado: h.quantity_indicated, esSaldo: h.saldo_de_item_id != null }, 'corto')
          return (
            <div key={h.id}>
              <div style={renglonTicket}>
                <span style={nombreTicket} title={nombre}>{nombre}</span>
                <span className="spira-mono" style={{ fontSize: 12, color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>{cant}</span>
                {h.estado === 'pendiente' ? (
                  <span style={{ ...pillBase, color: 'var(--spira-acc-deep-warn)', background: WARN_TINT_PILL }}>Por habilitar</span>
                ) : (
                  <span style={{ ...pillBase, color: 'var(--spira-acc-deep-danger)', background: DANGER_TINT }}>No habilitado</span>
                )}
                {h.estado === 'pendiente' && ed.editable && (
                  <button
                    type="button" aria-label={`Quitar ${nombre} del pedido`} title="Quitar del pedido"
                    disabled={busy} onClick={() => void quitarOtro(h.id)} style={iconBtn}
                  >
                    <Icon name="x" size={15} color="var(--spira-muted)" />
                  </button>
                )}
              </div>
              {h.estado === 'pendiente' ? (
                <div style={{ ...lineaBajoRenglon, padding: '3px 0 0' }}>
                  <Icon name="fileText" size={13} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
                  <span>Con receta · Farmacia lo habilita al tomar el pedido ·</span>
                  <button type="button" onClick={() => void verReceta(h.receta_path)} style={verRecetaBtn(accent)}>Ver la receta</button>
                </div>
              ) : (
                <div style={{ ...lineaBajoRenglon, padding: '3px 0 0' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {[motivoNoHabilitado(h), h.decided_by_name, h.decided_at ? formatDateTimeAR(h.decided_at) : null].filter(Boolean).join(' · ')}
                  </span>
                  {vivo && ofrecerOtro && !h.origen_habilitacion_id && (
                    <button
                      type="button" style={btnChico}
                      onClick={() => {
                        setInicialOtro({ medicationId: h.medication_id, quantity: h.quantity, quantityIndicated: h.quantity_indicated })
                        setModoOtro(true); setSoliciting(true); setErr(null)
                      }}
                    >
                      Pedir de nuevo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }

  /**
   * La parte del producto en investigación de un pedido, para su ticket: la constancia (el IP es la
   * constancia adjunta, no un kit ni un lote), el motivo si fue fuera de cronograma, o el aviso de que
   * falta. `null` = el pedido no lleva IP.
   */
  function ipDe(r: DispensationRequestRow): ReactNode | null {
    const doc = constanciaVigente(r)
    if (!r.includes_ip && !r.off_schedule && !doc) return null
    const entregada = columnOf(r) === 'entregada'
    const kits = entregada ? activeDispensation(r)?.ip_kits ?? null : null
    // «Reemplazar» sólo sobre el pedido al que iría la constancia nueva: el mismo `openReq` que usa la
    // sección, todavía solicitado y aceptando el adjunto. Sobre otro, reemplazar no tendría adónde ir.
    const reemplazable = puedeCargar && r.id === openReq?.id && edicionDelPedido(r, readOnly).editable && ipAceptaAdjunto
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {r.off_schedule && (
          // El motivo SELLADO en la fila: es el que Farmacia ve en el cajón y sale impreso en el papel.
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--spira-acc-deep-warn)' }}>
            <Icon name="info" size={12} stroke={2.4} style={{ flex: '0 0 auto' }} />
            <span style={{ minWidth: 0 }}>Fuera de cronograma · {r.off_schedule_reason ?? 'Sin motivo registrado'}</span>
          </div>
        )}
        {doc ? (
          <ConstanciaEnTicket doc={doc} kits={kits} reemplazo={reemplazable ? { activo: reemplazando, onToggle: alternarReemplazo } : null} />
        ) : r.includes_ip && !entregada ? (
          /* «Falta la constancia» sólo es CIERTO cuando el pedido la exige para que Farmacia emita el
             comprobante, y esa exigencia es el `includes_ip` SELLADO a secas (0071 §8.1:
             `mark_dispensation_ready` sólo la pide con `includes_ip`), nunca el cronograma vivo ni
             `off_schedule` (que la deja opcional hasta que se adjunta algo). Mirando el cronograma,
             destildar `dispenses_ip` con un pedido abierto de signo contrario dejaba la tarjeta
             afirmando esto sobre un pedido que la RPC ya daba por completo. No lo «simplifiques» a
             `ipPrevisto`: son dos preguntas distintas. */
          <div style={faltaStyle}>
            <Icon name="alert" size={15} color="var(--spira-warn)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
            <div>
              Falta la constancia
              <span style={{ display: 'block', color: 'var(--spira-ink-soft)', fontWeight: 400, marginTop: 2 }}>
                Farmacia no puede emitir el comprobante hasta que esté cargada.
              </span>
            </div>
          </div>
        ) : r.includes_ip ? (
          // Entregas anteriores a la 0071: el IP salió sin constancia en Spira. Se dice lo que hay.
          <div style={{ fontSize: 12.5, color: 'var(--spira-ink-soft)' }}>
            Entregado{kits ? ` · ${kits} ${kits === 1 ? 'kit' : 'kits'}` : ''}
          </div>
        ) : (
          <div style={{ ...muted, padding: '2px 0' }}>Sin constancia cargada.</div>
        )}
      </div>
    )
  }

  return (
    <Panel
      /* «de medicación» (Director, 2026-09-16): en el modal de la visita, «Dispensación» a secas
         convivía con «Procedimientos» y «Comentarios» sin decir QUÉ se dispensa. */
      title="Dispensación de medicación" icon="pill" accent={accent}
      // SIEMPRE teñida, también sin nada que dispensar. **Revierte la D8** ("el realce se apaga si no
      // hay nada", mock §4) por pedido explícito del Director el 2026-08-11: "agregale color a la
      // dispensación". Lo miró en pantalla y el apagado le dejaba la tarjeta en blanco justo donde
      // está la salida de "Dispensar fuera de cronograma", que es una acción real y no un hueco.
      // El razonamiento viejo —una sección sin trabajo no llama la atención— sigue siendo cierto en
      // general; acá pesa más que la dispensación se encuentre de un vistazo en una ficha con seis
      // tarjetas iguales.
      highlight
      tint={{ band: 'var(--spira-band-track)', body: 'var(--spira-tint-track)' }}
      /* El chip «Historial» (acceso H1 del handoff): las entregas de las otras visitas del estudio.
         En la banda, siempre a la vista; no aparece si no hay ninguna. */
      aside={<HistorialEntregas enrollmentId={visit.enrollment_id} visitId={visit.id} />}
    >
        <>
          {err && <div style={errBox}>{err}</div>}

          {rechazo && (
            <div role="status" style={rechazoStyle}>
              <Icon name="alertCircle" size={15} color="var(--spira-danger)" stroke={2} style={{ marginTop: 1, flex: '0 0 auto' }} />
              <span>Farmacia rechazó el pedido del {rechazo.fecha}{rechazo.motivo ? `: ${rechazo.motivo}` : '.'}</span>
            </div>
          )}

          {/* 1 · LOS COMPROBANTES, primero: el estado de la entrega es lo primero que se lee (handoff,
              punto 1). Un ticket por pedido vivo o entregado; lo normal es uno. */}
          {hayTickets && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tickets.map((r) => {
                const c = comprobanteDe(r, { puedeCancelar: !readOnly, puedeCorregir: puedeAbrirCorreccion })
                if (!c) return null
                const onEnlace = c.enlace === 'cancelar' ? () => void cancel(r.id) : c.enlace === 'corregir' ? abrirCorreccion : null
                return <ComprobanteTicket key={r.id} c={c} concomitante={renglonesDe(r)} ip={ipDe(r)} onEnlace={onEnlace} busy={busy} />
              })}
            </div>
          )}

          {/* 2 · AVISOS, antes de cargar nada: si llegan después de que el coordinador ya eligió la
              medicación, llegan tarde. El rojo por droga primero, después los saldos (D25). Recibe la
              consulta entera y decide sola qué mostrar. Con la excepción fuera de cronograma, el aviso
              del IP va adentro de su sección (`AvisoIpReciente`). */}
          {!readOnly && (
            <div style={hayTickets ? { marginTop: 12 } : undefined}>
              <AvisosDeEntrega
                query={ctxQ} rojo={rojo} saldos={saldos} hayElegido={elegidos.length > 0}
                // No es el `readOnly` de permisos: adentro de `AvisosDeEntrega` este prop sólo tapa el
                // botón «Pedir el saldo» (el aviso rojo es incondicional). Con la visita cerrada y sin
                // corrección abierta, tocar el saldo cargaría un renglón sobre un resumen de lectura.
                readOnly={!puedeCargar} accent={accent} onPedirSaldo={pedirSaldo}
              />
            </div>
          )}

          {readOnly && !cerrada && !hayTickets && requests.length === 0 && !reqQ.loading && (
            <div style={{ ...muted, padding: '2px 0' }}>Sin dispensación solicitada.</div>
          )}

          {/* 3 · SIN ENTREGA (spec D12): una frase para las dos partes y la puerta primaria. Las salidas
              del IP quedan a mano: son las que apagan la alerta de IP sin entregar. */}
          {sinEntrega && fraseSin && (
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', lineHeight: 1.45 }}>{fraseSin}</div>
              {puedeCorregir && (
                <button type="button" onClick={abrirCorreccion} style={{ ...btnPrimario(accent), marginTop: 12 }}>
                  <Icon name="plus" size={15} color="var(--spira-on-accent)" /> Registrar entrega
                </button>
              )}
              {contenidoIp === 'desenlace' && ipQ.data && <IpSalidas row={ipQ.data} accent={accent} readOnly={readOnly} />}
            </div>
          )}

          {/* 4 · CARGAR: sin ningún ticket (visita abierta), o abierto con «Nueva dispensación» /
              «Corregir esta entrega», o con algo elegido sin mandar. La lógica es la de siempre. */}
          {puedeCargar && (!hayTickets || formularioAbierto) && (
            <Sub label="Medicación concomitante" first={!hayTickets}>
              {corrigiendo && formularioAbierto && hayEntregado && (
                <div style={{ ...muted, padding: '2px 0', marginBottom: 9 }}>
                  La entrega anterior queda registrada. Lo que cargues acá la corrige.
                </div>
              )}

              {/* Los renglones ELEGIDOS y todavía no enviados, afuera del selector: son parte de la
                  solicitud que se está armando, no del formulario que los carga. La píldora dice en qué
                  estado están, que es la única diferencia real con los del ticket. */}
              {items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
                  {items.map((it, i) => (
                    <div key={it.medication_id}>
                      <div style={itemRow}>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--spira-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                        <span className="spira-mono" style={{ color: 'var(--spira-ink-soft)', flex: '0 0 auto' }}>
                          {cantidadConPartes(it.quantity, partesDeRenglon(it), 'corto')}
                        </span>
                        <span style={{ ...pillBase, color: 'var(--spira-acc-deep-warn)', background: WARN_TINT_PILL }}>Sin solicitar</span>
                        <button
                          type="button" aria-label={`Quitar ${it.name}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                          style={{ flex: '0 0 auto', background: 'transparent', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 2 }}
                        >
                          <Icon name="x" size={15} color="var(--spira-muted)" />
                        </button>
                      </div>
                      {/* 0124: un «Otro» dice que va con receta, y cuál: es lo que Farmacia va a mirar. */}
                      {esOtro(it) && (
                        <div style={lineaBajoRenglon}>
                          <Icon name="fileText" size={13} color="var(--spira-muted)" style={{ flex: '0 0 auto' }} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {it.receta ? `Con receta · ${it.receta.name}` : 'Con la receta ya aprobada'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* "Elegir" y no "Agregar": en el resto de Spira "Agregar" quiere decir DAR DE ALTA. Acá se
                  elige entre la medicación que el paciente YA tiene asignada. La cadena es
                  Elegir → Agregar → Listo → Solicitar: un verbo por paso (Director, 2026-09-04). */}
              {!soliciting && (
                <button type="button" onClick={() => { setSoliciting(true); setErr(null) }} style={addBtn}>
                  <Icon name="plus" size={16} color={accent} /> Elegir medicación
                </button>
              )}

              {soliciting && (
                <div style={{ border: '1px solid var(--spira-line-2)', borderRadius: 12, background: 'var(--spira-white)', padding: 13 }}>
                  {modoOtro ? (
                    // 0124: «Otro medicamento» es su propio formulario (receta, habilitación), no una
                    // opción más de la lista: se vuelve a la lista con «Volver» o al agregarlo.
                    <FormularioOtro
                      key={inicialOtro ? `${inicialOtro.medicationId}-${inicialOtro.quantity}` : 'nuevo'}
                      candidatos={candidatosQ.data ?? []}
                      loading={candidatosQ.loading}
                      error={candidatosQ.sinPermiso ? 'No podés pedir otro medicamento en esta visita.' : candidatosQ.error}
                      inicial={inicialOtro}
                      excluidos={excluidosOtro}
                      accent={accent}
                      onVolver={() => { setModoOtro(false); setInicialOtro(null); setErr(null) }}
                      onAgregar={(o) => {
                        setItems((xs) => [...xs, { ...o }])
                        setModoOtro(false); setInicialOtro(null); setErr(null)
                      }}
                    />
                  ) : activeMeds.length === 0 ? (
                    <div style={muted}>
                      Este paciente no tiene medicación habilitada. La farmacéutica tiene que asignarla primero (en la ficha del paciente).
                      {ofrecerOtro && (
                        <div style={{ marginTop: 10 }}>
                          <button type="button" style={btnChico} onClick={() => { setModoOtro(true); setErr(null) }}>
                            <Icon name="plus" size={14} color={accent} /> Otro medicamento, con receta
                          </button>
                        </div>
                      )}
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
                            disabled={options.length === 0 && !ofrecerOtro}
                            // 0124 (mock 2): «Otro» al pie, separado por un filete. No es `onCreate`: en
                            // la casa «crear» es dar de alta en el catálogo.
                            accionAlPie={ofrecerOtro ? {
                              label: 'Otro medicamento',
                              desc: 'No habilitado para este paciente. Lleva receta.',
                              onSelect: () => { setModoOtro(true); setPick(''); setErr(null) },
                            } : undefined}
                          />
                        </div>
                        <input
                          type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cant." aria-label="Cantidad a entregar hoy"
                          style={{ width: 74, height: 44, borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', padding: '0 12px', fontFamily: 'var(--spira-font-text)', fontSize: 14, color: 'var(--spira-ink)' }}
                        />
                        <button
                          type="button" onClick={addItem} disabled={!pick || !qty || partesMal}
                          style={{ height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-surface)', color: 'var(--spira-ink)', cursor: !pick || !qty || partesMal ? 'default' : 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13, opacity: !pick || !qty || partesMal ? 0.6 : 1 }}
                        >
                          Agregar
                        </button>
                      </div>
                      {/* «ENTREGAR EN PARTES» (D8), compartido con el formulario de «Otro». */}
                      <EntregarEnPartes
                        activo={enPartes} onActivo={setEnPartes} indicado={indicado} onIndicado={setIndicado}
                        cantidad={qtyNum} accent={accent}
                      />
                      {/* 0121 (D6): el aviso de stock, en memoria sobre la consulta del panel. Nunca
                          bloquea "Agregar": el stock puede cambiar antes del mostrador. */}
                      {pick && qty && avisoStock(stockDe(pick), parseInt(qty, 10)) && (
                        <div style={{ ...avisoStockStyle, paddingLeft: 2 }}>{avisoStock(stockDe(pick), parseInt(qty, 10))}</div>
                      )}
                    </>
                  )}

                  {/* El selector ya no solicita nada: solo suma renglones a la lista de arriba. Queda
                      abierto después de agregar —cargar dos o tres medicamentos seguidos es lo normal— y
                      se cierra con "Listo". El envío es uno solo y vive al pie de la tarjeta. */}
                  {!modoOtro && (
                    <button
                      type="button"
                      onClick={() => {
                        setSoliciting(false); setPick(''); setQty('1'); setEnPartes(false); setIndicado(''); setErr(null)
                        // Sin esto el modo corrección no tiene vuelta atrás: si se abrió por error (o
                        // para mirar) y no quedó nada cargado, hay que volver al ticket en vez de dejar
                        // la tarjeta invitando sola con "Elegir medicación" sobre una visita cerrada.
                        if (items.length === 0 && !archivo) {
                          if (corrigiendo) setCorrigiendo(false)
                          // `fueraCronograma` es el mismo tipo de estado LOCAL sin enviar que `corrigiendo`
                          // (Hallazgo 3, revisión final 2026-09-15): sin este reset, "Pedir fuera de
                          // cronograma" seguido de "Listo" sin cargar nada dejaba la excepción viva para
                          // siempre y la sección del IP pegada en ámbar.
                          setFueraCronograma(false)
                        }
                      }}
                      style={{ marginTop: 12, height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--spira-line-2)', background: 'var(--spira-white)', color: 'var(--spira-ink)', cursor: 'pointer', fontFamily: 'var(--spira-font-text)', fontWeight: 600, fontSize: 13 }}
                    >
                      Listo
                    </button>
                  )}
                </div>
              )}
            </Sub>
          )}

          {/* 5 · PRODUCTO EN INVESTIGACIÓN, sólo con lo que el ticket no cuenta (spec D16): cargar la
              constancia, la excepción, el desenlace con sus salidas, el cierre, la visita histórica.
              «Falta la constancia» ya no va acá: lo dice el ticket del pedido que la exige. */}
          {mostrarIp && (
            <SeccionIp
              contenido={contenidoIp}
              excepcion={mostrarExcepcion ? {
                // Sin el aviso sobre una entrega ya hecha (spec 2026-09-19, E4): advertía sobre sí misma.
                aviso: mostrarAvisoIp(contenidoIp, estadoIp)
                  ? <AvisoIpReciente query={ctxQ} aviso={avisoIp(ctxQ.data ?? [], ahora)} />
                  : null,
                // Con el pedido ya creado manda el motivo SELLADO en la fila, no el desplegable: es el
                // texto que Farmacia ve en el cajón y que sale impreso en el comprobante. Si hace falta
                // un motivo nuevo (nace otro pedido fuera de cronograma), se vuelve a pedir.
                motivoSellado: reqExcepcion && !necesitaMotivo ? reqExcepcion.off_schedule_reason ?? 'Sin motivo registrado' : null,
                motivo,
                // Limpia el error de "falta el motivo" apenas se elige uno.
                onMotivo: (v) => { setMotivo(v); setErr(null) },
              } : null}
              // `!puedeCargar` y no el `readOnly` pelado: `fueraCronograma` es estado LOCAL sin enviar
              // (Task 4), y con la visita cerrada el desplegable de motivo no puede quedar editable.
              readOnly={!puedeCargar}
              accent={accent}
              busy={busy}
              archivo={archivo}
              onQuitarArchivo={() => { setArchivo(null); setReemplazando(false); setErr(null) }}
              onElegirArchivo={elegirConstancia}
              constanciaAbierta={constanciaAbierta}
              reemplazando={reemplazando}
              onReemplazar={() => setReemplazando(true)}
              constanciaIncompleta={false}
              entregado={constanciaEntregada && reqEntregado && badgeEntregado ? {
                doc: constanciaEntregada,
                pedidoEl: reqEntregado.created_at,
                badge: badgeEntregado,
                comprobante: comprobanteEntregado,
              } : null}
              desenlace={ipQ.data ? desenlaceIp(ipQ.data, visit.ready_at !== null) : null}
              onRegistrarEntrega={puedeCorregir && ofrecerRegistrarIp(contenidoIp, estadoIp) ? abrirCorreccion : null}
              onPedirFueraDeCronograma={readOnly || (cerrada && !corrigiendo) ? null : () => { setFueraCronograma(true); setErr(null) }}
              /* Las salidas del IP («No corresponde», «Se entregó en otra visita»): `IpSalidas` decide
                 solo si hay algo que ofrecer y si no, no dibuja nada. */
              salidas={ipQ.data ? <IpSalidas row={ipQ.data} accent={accent} readOnly={readOnly} /> : null}
            />
          )}

          {/* 6 · EL CIERRE DE LA SOLICITUD. Un solo botón para todo lo que se armó —renglones y
              constancia—; aparece sólo cuando hay algo sin mandar. Arriba, lo que hace falta saber
              ANTES de apretarlo: qué se va a mandar y, si corresponde, que abre un pedido aparte.

              `puedeCargar` y no `readOnly`: `items`/`archivo` son estado LOCAL sin enviar, y el
              invariante "todo pedido ya mandado deja `cerrada` en false" no lo cubre. */}
          {puedeCargar && (items.length > 0 || archivo) && (
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

          {/* 7 · VOLVER A DISPENSAR (spec D11), afuera y abajo del ticket: nunca comparte peso con el
              enlace de corregir. Con un pedido que todavía acepta cambios, lo elegido se SUMA a ése, y
              llamarlo «nueva» prometería un segundo comprobante que no va a existir. */}
          {hayTickets && !cargaEnCurso && !readOnly && (puedeCargar || puedeCorregir) && (
            <button type="button" onClick={volverADispensar} style={btnNueva}>
              <Icon name="plus" size={15} /> {destino ? 'Sumar medicación' : 'Nueva dispensación'}
            </button>
          )}
        </>
    </Panel>
  )
}
