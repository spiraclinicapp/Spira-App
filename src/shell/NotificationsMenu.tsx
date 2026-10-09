import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { usePopover } from '../components/usePopover'
import type { AlertKind } from '../data/alertDismissalModel'
import {
  descarteListo, dismissAlert, DISMISS_REASONS, MOTIVO_OTRO, useActiveAlerts,
} from '../data/alertDismissals'
import type { PedidoAviso } from '../data/pharma/dispensationModel'
import { useConstanciasSinImprimir, usePedidosCorreccionPendientes } from '../data/pharma'
import { estadoDe, estaAbierto, loHicisteVos, motivoDePedido, repartir, ultimoMovimiento } from './avisosPedidos'
import { isoDayAR, todayISO } from '../lib/dates'
import { pushUrl } from '../lib/useUrlState'
import { constanciasAReimprimir, pedidosAResolver } from '../views/pharma/correccionEntregaModel'
import { MODULES } from '../modules/registry'
import type { NavTarget, ReturnTo } from '../views/types'
import { priorizarAlertas } from '../views/visitRules'
import { VisitDetail } from '../views/track/VisitDetail'
import { DESTINO_PENDIENTES, nombreDeDestino } from '../views/resumen/destinos'
import {
  agruparPorDia, claseDeAlerta, recortarPorGravedad, momentoDe, momentoDeVisita, motivoDeAlerta, motivoDeIp, motivoDeReporte,
  textoDePildora, tonoDeNoLeidas,
} from './notificaciones'
import { guardarLeidas, leerLeidas, marcar, noLeidas, reconciliar } from './leidas'
import type { Fuente, Novedad } from './leidas'
import { TarjetaNotificacion } from './TarjetaNotificacion'
import type { DatosDeTarjeta } from './TarjetaNotificacion'
import { DispensacionEnCurso } from './DispensacionEnCurso'
import { AlertaCampana } from './AlertaCampana'
import type { Alerta } from './AlertaCampana'

/** Cuántas alertas CLÍNICAS entran en el panel. Ver el porqué del recorte donde se aplica. */
const MAX_NOTIFICACIONES = 10

/** Cuánto tarda una tarjeta en pasar a leída con el panel abierto (handoff v2). */
const LEIDA_A_LOS_MS = 2_500

/** Cada cuánto se recalcula «hace N min» (handoff v2). */
const RELOJ_MS = 30_000

/* El acento con el que se pinta el modal de la visita. Sale del registry y no de un hex escrito a
   mano: la campana no vive en ningún módulo, pero lo que abre es una visita de Coordinación, y tiene
   que verse igual que abierta desde su propia pantalla. */
const ACENTO_TRACK = MODULES.find((m) => m.key === 'track')?.accent ?? 'var(--spira-primary)'

/* ============================================================================
   NotificationsMenu — la campana del top bar, su panel y la alerta que sale de ella.

   Handoff v2: `docs/design_handoff_notificaciones_v2/`, con las decisiones de
   `docs/plan-notificaciones-v2.md`. Rediseña el v1 (`docs/plan-campana-notificaciones.md`), del que
   conserva las fuentes y las reglas: las alertas son las de `useActiveAlerts()` —las mismas que
   cuentan Pendientes y el resumen de Inicio, ya sin las descartadas—, así que la píldora de la
   cabecera y el contador de Pendientes siguen diciendo el mismo número.

   LAS REGLAS NO ESTÁN ACÁ: viven en `./notificaciones.ts` (tipos, tiempos, grupos), `./leidas.ts`
   (leídas y novedades) y `./avisosPedidos.ts` (pedidos), con test. Este archivo es armado, estado de
   UI y gestos.

   CINCO COSAS QUE VALE LA PENA SABER ANTES DE TOCAR ESTE ARCHIVO:

   1. EL PANEL USA `usePopover`, y no es por comodidad. El popover de descarte se portalea a
      `document.body`; con el cierre por click afuera decidido a mano, ese popover cae "afuera" del
      panel y lo cierra entero antes de que el motivo llegue a elegirse. `usePopover` tiene el
      registro que reconstruye la cadena lógica que el portal corta.

   2. `Esc` CIERRA DE ADENTRO HACIA AFUERA, uno por vez (lo resuelve `usePopover`).

   3. EL DESCARTE ESTÁ GATEADO por `isAllowed('track')`, igual que el pie y el link del paciente.
      Archivar es una escritura auditada y el único lugar donde se DESHACE es el panel de descartadas
      de Coordinación: sin el módulo, quien descarte desde acá silencia para siempre.

   4. EL PUNTO DE LA CAMPANA DICE «NO LEÍDO», Y LA PÍLDORA DICE «PENDIENTES». Son dos números
      distintos a propósito: la píldora sigue contando lo mismo que Pendientes (las alertas clínicas
      vigentes), y el punto se apaga cuando ya viste todo lo que hay, aunque siga habiendo trabajo.
      Leídas viven en el navegador (`leidas.ts`, D1).

   5. LAS NOVEDADES SE SIEMBRAN POR FUENTE (`reconciliar`). La primera vez que cada consulta vuelve
      no avisa nada; de ahí en más, lo que no estaba es nuevo. Una fuente que está cargando o con
      error NO se reconcilia: si una lista vacía por error contara como foto, al volver la consulta
      saltarían de golpe todas sus alertas como recién llegadas.
   ============================================================================ */

interface NotificationsMenuProps {
  /** Navegar (lo provee el shell = AppShell.navigate). `back` arma el botón de vuelta del destino. */
  onNavigate: (moduleKey: string, subKey: string, target?: NavTarget, back?: ReturnTo) => void
  /** Gate de acceso del shell (para el pie, el link del paciente y el tacho). */
  isAllowed: (moduleKey: string) => boolean
  /** Los pedidos de dispensación del alcance de quien mira. `null` mientras la consulta no volvió. */
  pedidos: PedidoAviso[] | null
  /**
   * Por qué no se pudieron traer, si falló. NO ALCANZA CON NO MOSTRAR NADA: una lista vacía se lee
   * como "no tenés pedidos", que es el falso negativo que este aviso existe para evitar.
   */
  errorPedidos: string | null
  /** Para saber cuáles son tuyos, y de quién son las leídas. */
  uid: string | null
  /** Ir al tablero de Dispensaciones. */
  onAbrirTablero: () => void
  /** Parado en el tablero de Dispensaciones, un pedido que se mueve no salta: la pantalla ya lo dice. */
  enPantallaDelTablero: boolean
}

/** Lo que hace falta para archivar una alerta desde acá. */
interface Descarte {
  kind: AlertKind
  visitId: string
  reportDefinitionId: string | null
  /** Para el `aria-label` del tacho. */
  etiqueta: string
}

/** Una tarjeta del listado (o de la tarjeta fija), con sus gestos. */
interface Item {
  datos: DatosDeTarjeta
  fuente: Fuente
  /** El gesto grande. `undefined` = la tarjeta no lleva a ningún lado para quien mira. */
  abrir?: () => void
  /** El link del nombre: la ficha del paciente. */
  abrirPaciente?: () => void
  /** `null` = esta clase no se archiva (el IP sin entregar, 0119). */
  descarte: Descarte | null
  /** Para `reconciliar`: si su llegada avisa y si la hizo quien mira. */
  novedad: Novedad
  /** Rótulo de la alerta si llega mientras el panel está cerrado. */
  rotulo: string
}

export function NotificationsMenu({
  onNavigate, isAllowed, pedidos, errorPedidos, uid, onAbrirTablero, enPantallaDelTablero,
}: NotificationsMenuProps) {
  const alerts = useActiveAlerts()
  const [open, setOpen] = useState(false)
  const verFarmacia = isAllowed('pharma')
  /** Las constancias corregidas que Farmacia tiene que reimprimir. Se relee al abrir el panel. */
  const reimprimirQ = useConstanciasSinImprimir(verFarmacia)
  const releerReimprimir = reimprimirQ.refetch
  /** Los pedidos de corrección de Coordinación esperando a Farmacia (0152). Ídem. */
  const correccionesQ = usePedidosCorreccionPendientes(verFarmacia)
  const releerCorrecciones = correccionesQ.refetch
  useEffect(() => { if (open) { releerReimprimir(); releerCorrecciones() } }, [open, releerReimprimir, releerCorrecciones])
  /** La visita que muestra el modal, cuando se abrió una desde una tarjeta. */
  const [visitaAbierta, setVisitaAbierta] = useState<string | null>(null)
  const cerrar = useCallback(() => setOpen(false), [])

  /* `flip` apagado: la campana vive pegada al borde SUPERIOR de la ventana. `align: 'end'` lo cuelga
     por su borde derecho, que es lo que hace que salga de la campana y no del centro de la barra. */
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(open, cerrar, false, 'end')

  const panelRef = useRef<HTMLDivElement | null>(null)
  const montarPanel = useCallback((n: HTMLDivElement | null) => {
    panelRef.current = n
    popRef(n)
  }, [popRef])

  /* —— El reloj ——
     «hace N min» se recalcula cada 30 s, pero sólo mientras algo lo muestra (el panel o la alerta):
     con todo cerrado, repintar la campana cada medio minuto es trabajo para nadie. */
  const [alerta, setAlerta] = useState<Alerta | null>(null)
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const relojVivo = open || alerta !== null
  useEffect(() => {
    if (!relojVivo) return
    setAhoraMs(Date.now())
    const t = window.setInterval(() => setAhoraMs(Date.now()), RELOJ_MS)
    return () => window.clearInterval(t)
  }, [relojVivo])
  const hoy = todayISO()

  const todasLasVisitas = alerts.visitAlerts
  const todosLosReportes = alerts.reportAlerts
  const todosLosIp = alerts.ipAlerts
  const count = todasLasVisitas.length + todosLosReportes.length + todosLosIp.length

  /* ┌─ EL RECORTE ELIGE POR GRAVEDAD; EL LISTADO ORDENA POR FECHA ─────────────────────────────┐
     El panel muestra hasta 10 alertas clínicas. Cuáles entran lo decide la gravedad
     (`recortarPorGravedad`, con test): el IP sin entregar, las de visita por `priorizarAlertas` y
     los reportes al final — así una ventana vencida de hace dos semanas nunca queda afuera por diez
     reportes. Una vez elegidas, el handoff v2 las ordena por fecha y las agrupa por día (D3). El pie
     dice cuántas quedaron afuera.
     El punto de la campana y la píldora no se recortan: cuentan TODAS.
     └──────────────────────────────────────────────────────────────────────────────────────────┘ */
  const recorte = recortarPorGravedad(todosLosIp, priorizarAlertas(todasLasVisitas), todosLosReportes, MAX_NOTIFICACIONES)
  const ipRows = recorte.ips
  const procRows = recorte.reportes
  const rows = recorte.visitas
  const ocultas = recorte.ocultas

  const puedeCoordinar = isAllowed('track')

  // Al abrir, el foco va al panel.
  useEffect(() => { if (open) panelRef.current?.focus() }, [open])

  /* Al cerrar, el foco vuelve a la campana SÓLO si quedó huérfano: si el cierre fue por un click en
     otra cosa, el foco ya está donde el usuario lo puso y robarlo sería peor. */
  const estabaAbierto = useRef(false)
  useEffect(() => {
    if (estabaAbierto.current && !open && document.activeElement === document.body) {
      triggerRef.current?.focus()
    }
    estabaAbierto.current = open
  }, [open, triggerRef])

  const goAll = () => { setOpen(false); onNavigate('track', 'alertas') }

  /* EL PASAJE DE VUELTA apunta a Pendientes y no a "la campana", que no es un lugar al que se pueda
     volver. El rótulo sale del registry: escrito a mano sobrevive a un renombre prometiendo una
     pantalla que ya no existe. */
  const volverAPendientes = (): ReturnTo => {
    const nombre = nombreDeDestino(DESTINO_PENDIENTES) ?? 'Pendientes'
    return {
      moduleKey: DESTINO_PENDIENTES.moduleKey,
      subKey: DESTINO_PENDIENTES.subKey,
      label: `Volver a ${nombre}`,
      hint: `Volver a la lista de ${nombre.toLowerCase()}`,
    }
  }

  const abrirFichaDe = (patientId: string, protocolId: string) => {
    setOpen(false)
    onNavigate('track', 'protocolos', { patientId, protocolId }, volverAPendientes())
  }
  /* Sin el módulo Coordinación el nombre queda como texto pelado (ver `PatientLink`), en vez de un
     `navigate` que `isAllowed` descartaría en silencio del lado del shell. */
  const abrirFicha = (patientId: string, protocolId: string) =>
    (puedeCoordinar && patientId ? () => abrirFichaDe(patientId, protocolId) : undefined)

  /* EL GESTO GRANDE ABRE LA VISITA y cierra el panel: un popover se cerraría solo con el primer
     clic dentro del modal —`usePopover` lo vería "afuera"— y quedaría escondido detrás. */
  const abrirVisita = (visitId: string) =>
    (puedeCoordinar ? () => { setOpen(false); setVisitaAbierta(visitId) } : undefined)

  /* Abre el cajón de esa entrega en el historial de Dispensaciones. El historial arranca en el día
     de `dia` y pagina hacia atrás: con el día de la ENTREGA, el cajón la encuentra en la primera
     página. Sin código o sin fecha cae al tablero. */
  const abrirEntrega = (codigo: string | null, deliveredAt: string | null) => () => {
    setOpen(false)
    if (!codigo || !deliveredAt) { onAbrirTablero(); return }
    pushUrl({ moduleKey: 'pharma', subKey: 'dispensaciones', path: [codigo], query: { vista: 'historial', dia: isoDayAR(deliveredAt) } })
  }

  /* —— Las tarjetas clínicas ——
     Se arman DOS veces: las del recorte, que son las que se dibujan, y todas, que son las que se
     comparan para saber qué es nuevo. Si la foto fuera sólo del recorte, descartar una alerta haría
     entrar a la undécima —vieja— y saltaría como «Nueva notificación». */
  const clinicas = armarClinicas(ipRows, procRows, rows)
  const todasLasClinicas = armarClinicas(todosLosIp, todosLosReportes, todasLasVisitas)

  function armarClinicas(
    ips: typeof todosLosIp, reportes: typeof todosLosReportes, visitas: typeof todasLasVisitas,
  ): Item[] {
    return [
    ...ips.map((r): Item => ({
      datos: {
        clave: `ip:${r.visit_id}`,
        tipo: 'ip',
        pacienteNombre: r.patient_name,
        pacienteCodigo: r.patient_code,
        protocoloCodigo: r.protocol_code,
        motivo: motivoDeIp(r),
        momento: momentoDe(r.vence_at),
      },
      fuente: 'alertas',
      abrir: abrirVisita(r.visit_id),
      abrirPaciente: abrirFicha(r.patient_id, r.protocol_id),
      descarte: null,
      novedad: { clave: `ip:${r.visit_id}`, avisa: true, propia: false },
      rotulo: 'Nueva notificación',
    })),
    ...reportes.map((r): Item => {
      const clave = `reporte:${r.visit_id}:${r.report_definition_id}`
      return {
        datos: {
          clave,
          tipo: 'reporte',
          pacienteNombre: r.patient_name,
          pacienteCodigo: r.patient_code,
          protocoloCodigo: r.protocol_code,
          motivo: motivoDeReporte(r),
          momento: momentoDe(r.report_due_at),
        },
        fuente: 'alertas',
        abrir: abrirVisita(r.visit_id),
        abrirPaciente: abrirFicha(r.patient_id, r.protocol_id),
        descarte: {
          kind: 'reporte_procedimiento',
          visitId: r.visit_id,
          reportDefinitionId: r.report_definition_id,
          etiqueta: `${r.report_name} · ${r.patient_name}`,
        },
        novedad: { clave, avisa: true, propia: false },
        rotulo: 'Nueva notificación',
      }
    }),
    ...visitas.map((a): Item => {
      /* La clase va en la clave: una visita que pasa de «pendiente vencido» a «ventana vencida» es
         una notificación NUEVA, no la misma con otro color. */
      const clase = claseDeAlerta(a.computed_status)
      const clave = `${clase}:${a.id}`
      return {
        datos: {
          clave,
          tipo: clase,
          pacienteNombre: a.patient_name,
          pacienteCodigo: a.patient_code,
          protocoloCodigo: a.protocol_code,
          motivo: motivoDeAlerta(a),
          momento: momentoDeVisita(a),
        },
        fuente: 'alertas',
        abrir: abrirVisita(a.id),
        abrirPaciente: abrirFicha(a.patient_id, a.protocol_id),
        descarte: { kind: 'visita', visitId: a.id, reportDefinitionId: null, etiqueta: `${motivoDeAlerta(a)} · ${a.patient_name}` },
        novedad: { clave, avisa: true, propia: false },
        rotulo: 'Nueva notificación',
      }
    }),
    ]
  }

  /* —— Los pedidos ——
     Lo PROPIO Y ABIERTO va a la tarjeta fija; lo propio cerrado (entregado, rechazado, cancelado hoy)
     y lo nuevo de Farmacia, al listado. Los pedidos NO suman a la píldora: no son pendientes
     clínicos. Sí cuentan para el punto de «no leído» — un pedido listo que no viste es algo que no
     viste. */
  const { mios, nuevos } = repartir(pedidos ?? [], uid)
  const fijos = mios.filter(estaAbierto)
  const pedidoAItem = (p: PedidoAviso, comoFarmacia: boolean): Item => {
    const estado = estadoDe(p)
    const clave = `pedido:${p.id}:${estado}`
    return {
      datos: {
        clave,
        tipo: 'dispensacion',
        pacienteNombre: p.patient_name,
        pacienteCodigo: p.patient_code,
        protocoloCodigo: p.protocol_code,
        motivo: motivoDePedido(p, comoFarmacia),
        momento: momentoDe(ultimoMovimiento(p)),
      },
      fuente: 'pedidos',
      abrir: comoFarmacia
        ? () => { setOpen(false); onAbrirTablero() }
        : () => { setOpen(false); setVisitaAbierta(p.visit_id) },
      abrirPaciente: abrirFicha(p.patient_id, p.protocol_id),
      descarte: null,
      novedad: { clave, avisa: !enPantallaDelTablero, propia: loHicisteVos(p, estado, uid) },
      rotulo: estado === 'solicitada' ? 'Nueva notificación' : 'Dispensación actualizada',
    }
  }
  const itemsFijos = fijos.map((p) => pedidoAItem(p, false))
  const itemsPedidos = [
    ...mios.filter((p) => !estaAbierto(p)).map((p) => pedidoAItem(p, false)),
    ...nuevos.map((p) => pedidoAItem(p, true)),
  ]

  /* «Constancias para reimprimir» (0149) y «Correcciones pedidas» (0152): información de Farmacia,
     sólo con su módulo, y sin sumar a la píldora por lo mismo que los pedidos. */
  const itemsConstancias: Item[] = constanciasAReimprimir(reimprimirQ.data ?? []).map((c) => ({
    datos: {
      clave: `constancia:${c.docId}`,
      tipo: 'constancia',
      pacienteNombre: c.paciente,
      pacienteCodigo: c.ivrs,
      protocoloCodigo: c.protocolCode,
      motivo: `Constancia corregida — reimprimila para el archivo · ${c.detalle}`,
      momento: momentoDe(c.cargadaAt),
    },
    fuente: 'constancias',
    abrir: abrirEntrega(c.codigo, c.deliveredAt),
    descarte: null,
    novedad: { clave: `constancia:${c.docId}`, avisa: true, propia: false },
    rotulo: 'Nueva notificación',
  }))
  const itemsCorrecciones: Item[] = pedidosAResolver(correccionesQ.data ?? []).map((c) => ({
    datos: {
      clave: `correccion:${c.id}`,
      tipo: 'correccion',
      pacienteNombre: c.paciente,
      pacienteCodigo: c.ivrs,
      protocoloCodigo: c.protocolCode,
      motivo: `Coordinación pidió corregir la medicación · ${c.detalle}`,
      momento: momentoDe(c.pedidaAt),
    },
    fuente: 'correcciones',
    abrir: abrirEntrega(c.codigo, c.deliveredAt),
    descarte: null,
    novedad: { clave: `correccion:${c.id}`, avisa: true, propia: false },
    rotulo: 'Nueva notificación',
  }))

  const listado = [...clinicas, ...itemsPedidos, ...itemsCorrecciones, ...itemsConstancias]
  const grupos = agruparPorDia(listado, (i) => i.datos.momento, hoy)

  /* —— Leídas ——
     `primeraVez` se decide UNA vez por usuario, al montar: es la diferencia entre «nunca estuvo en
     este navegador» (todo lo que existe cuenta como leído) y «estuvo y dejó cosas sin leer». */
  const [{ leidas, primeraVez }, setLecturas] = useState(() => {
    const guardadas = uid ? leerLeidas(uid) : null
    return { leidas: guardadas ?? [], primeraVez: guardadas === null }
  })
  const fotos = useRef<Partial<Record<Fuente, string[]>>>({})
  const uidDeLecturas = useRef(uid)
  useEffect(() => {
    if (uidDeLecturas.current === uid) return
    uidDeLecturas.current = uid
    const guardadas = uid ? leerLeidas(uid) : null
    setLecturas({ leidas: guardadas ?? [], primeraVez: guardadas === null })
    fotos.current = {}
  }, [uid])

  const marcarLeidas = useCallback((claves: readonly string[]) => {
    setLecturas((prev) => {
      const nuevas = marcar(prev.leidas, claves)
      return nuevas === prev.leidas ? prev : { ...prev, leidas: nuevas }
    })
  }, [])
  // Se guarda DESPUÉS de cambiar, y no adentro del updater: el modo estricto lo corre dos veces.
  const leidasGuardadas = useRef(leidas)
  useEffect(() => {
    if (!uid || leidas === leidasGuardadas.current) return
    leidasGuardadas.current = leidas
    guardarLeidas(uid, leidas)
  }, [uid, leidas])

  const todos = [...itemsFijos, ...listado]
  const clavesSinLeer = noLeidas(todos.map((i) => i.datos.clave), leidas)
  const sinLeer = new Set(clavesSinLeer)
  const punto = tonoDeNoLeidas(todos.filter((i) => sinLeer.has(i.datos.clave)).map((i) => i.datos.tipo))

  /* —— Novedades y alerta —— */
  const [recienLlegadas, setRecienLlegadas] = useState<ReadonlySet<string>>(new Set())
  const [sacudida, setSacudida] = useState(0)
  const abiertoRef = useRef(open)
  abiertoRef.current = open
  /* Lo que el panel muestra. Una novedad que no entra en el recorte no avisa: la alerta llevaría a
     un panel donde esa tarjeta no está. Sigue contando en la píldora y en Pendientes. */
  const visiblesRef = useRef<ReadonlySet<string>>(new Set())
  visiblesRef.current = new Set([...itemsFijos, ...listado].map((i) => i.datos.clave))

  const llegaron = useCallback((todas: Item[]) => {
    const items = todas.filter((i) => visiblesRef.current.has(i.datos.clave))
    if (items.length === 0) return
    setSacudida((n) => n + 1)
    if (abiertoRef.current) {
      // Con el panel abierto no hay alerta: la tarjeta entra directo al listado con su animación.
      setRecienLlegadas((prev) => new Set([...prev, ...items.map((i) => i.datos.clave)]))
      return
    }
    // Una alerta nueva reemplaza a la visible; si llegan varias juntas, se muestra la más reciente.
    const ultima = agruparPorDia(items, (i) => i.datos.momento, todayISO())[0]?.items[0] ?? items[0]
    setAlerta({ datos: ultima.datos, rotulo: ultima.rotulo })
  }, [])

  const ctx = { fotos, primeraVez, marcarLeidas, llegaron }
  useNovedades('alertas', !alerts.loading && !alerts.error ? todasLasClinicas : null, ctx)
  useNovedades('pedidos', pedidos !== null && errorPedidos === null ? [...itemsFijos, ...itemsPedidos] : null, ctx)
  useNovedades('constancias', verFarmacia && reimprimirQ.data && !reimprimirQ.error ? itemsConstancias : null, ctx)
  useNovedades('correcciones', verFarmacia && correccionesQ.data && !correccionesQ.error ? itemsCorrecciones : null, ctx)

  /* Con el panel abierto, lo que se ve pasa a leído a los 2,5 s. La firma de lo no leído entra en
     las dependencias: si llega algo con el panel abierto, su propio plazo arranca de cero. */
  const firmaSinLeer = clavesSinLeer.join('|')
  const sinLeerRef = useRef(clavesSinLeer)
  sinLeerRef.current = clavesSinLeer
  useEffect(() => {
    if (!open || firmaSinLeer === '') return
    const t = window.setTimeout(() => marcarLeidas(sinLeerRef.current), LEIDA_A_LOS_MS)
    return () => window.clearTimeout(t)
  }, [open, firmaSinLeer, marcarLeidas])

  // Al cerrar el panel, las recién llegadas dejan de serlo: la próxima vez no vuelven a animarse.
  useEffect(() => { if (!open) setRecienLlegadas(new Set()) }, [open])

  const alternar = () => {
    setOpen((v) => {
      if (!v) setAlerta(null)
      return !v
    })
  }
  const cerrarAlerta = useCallback(() => setAlerta(null), [])
  const abrirDesdeAlerta = useCallback(() => { setAlerta(null); setOpen(true) }, [])

  const label = clavesSinLeer.length > 0
    ? `Notificaciones, ${clavesSinLeer.length} sin leer`
    : count > 0 ? `Notificaciones, ${textoDePildora(count)}` : 'Notificaciones'
  /* El error cuenta como "hay algo que mostrar": si no, un fallo de la consulta caería en el estado
     vacío ("Estás al día") y afirmaría que no pasa nada justo cuando no sabemos. */
  const vacio = listado.length === 0 && itemsFijos.length === 0 && errorPedidos === null

  /* El panel cuelga 10 px debajo de la campana y se pasa 6 px de su borde derecho (handoff v2).
     `usePopover` ya lo pega por la derecha a 6 px; el resto se corrige acá, sin salirse de los 8 px
     de margen de la ventana. */
  const posPanel = pos
    ? { top: pos.top + 4, left: Math.max(8, Math.min(pos.left + 6, window.innerWidth - 8 - 452)) }
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Notificaciones"
        style={bellBtn}
      >
        {/* La `key` reinicia la sacudida y los pulsos con cada llegada. */}
        <span key={`c${sacudida}`} className={sacudida > 0 ? 'spira-campana--sacude' : undefined} style={{ display: 'grid' }}>
          <Icon name="bell" size={18} color="var(--spira-ink)" />
        </span>
        {/* Un PUNTO y no un contador: el número vive en la píldora del panel. En cero no se dibuja. */}
        {punto && (
          <span
            key={`p${sacudida}`}
            className={`spira-notif-punto${sacudida > 0 ? ' spira-notif-punto--pulso' : ''}`}
            style={{ background: punto }}
          />
        )}
      </button>

      <AlertaCampana
        alerta={open ? null : alerta}
        anclaRef={triggerRef}
        hoy={hoy}
        ahoraMs={ahoraMs}
        onAbrir={abrirDesdeAlerta}
        onCerrar={cerrarAlerta}
      />

      {open && posPanel && createPortal(
        <div
          ref={montarPanel}
          tabIndex={-1}
          role="dialog"
          aria-label="Notificaciones"
          className="spira-notif-panel"
          style={posPanel}
        >
          <div className="spira-notif-cabecera">
            <span className="spira-notif-titulo">Notificaciones</span>
            {count > 0 && <span className="spira-notif-pildora">{textoDePildora(count)}</span>}
            {/* Sólo cuando hay algo sin leer: un botón que no cambia nada finge una acción. */}
            {clavesSinLeer.length > 0 && (
              <button type="button" className="spira-notif-marcar spira-no-press" onClick={() => marcarLeidas(clavesSinLeer)}>
                Marcar como leídas
              </button>
            )}
          </div>

          <div className="spira-notif-lista spira-scroll">
            {alerts.loading && vacio ? (
              <div style={emptyBox}>Cargando…</div>
            ) : alerts.error && vacio ? (
              <div style={{ ...emptyBox, color: 'var(--spira-acc-deep-danger)' }}>
                No pudimos cargar las notificaciones.
              </div>
            ) : vacio ? (
              <div style={emptyState}>
                <span style={emptyIcon}><Icon name="check" size={20} color="var(--spira-good)" /></span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--spira-ink)' }}>Estás al día</div>
                <div style={{ fontSize: 12.5, color: 'var(--spira-muted)', marginTop: 2 }}>
                  No tenés pendientes nuevos.
                </div>
              </div>
            ) : (
              <>
                {alerts.error && <div className="spira-notif-mensaje">No pudimos cargar las alertas clínicas.</div>}
                {errorPedidos && (
                  <div className="spira-notif-mensaje">No pudimos ver el estado de los pedidos de dispensación.</div>
                )}
                {fijos.map((p) => (
                  <DispensacionEnCurso
                    key={p.id}
                    pedido={p}
                    hoy={hoy}
                    ahoraMs={ahoraMs}
                    onAbrir={() => { setOpen(false); setVisitaAbierta(p.visit_id) }}
                  />
                ))}
                {grupos.map((g) => (
                  <section key={g.grupo} aria-label={g.rotulo}>
                    <div className="spira-notif-grupo" aria-hidden="true">{g.rotulo}</div>
                    <div className="spira-notif-grupo-items">
                      {g.items.map((i) => (
                        <TarjetaNotificacion
                          key={i.datos.clave}
                          datos={i.datos}
                          hoy={hoy}
                          ahoraMs={ahoraMs}
                          noLeida={sinLeer.has(i.datos.clave)}
                          nueva={recienLlegadas.has(i.datos.clave)}
                          onAbrir={i.abrir}
                          abrirPaciente={i.abrirPaciente}
                          descartar={puedeCoordinar && i.descarte ? <BotonDescartar destino={i.descarte} /> : undefined}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>

          {puedeCoordinar && (
            <button type="button" onClick={goAll} className="spira-notif-all">
              {/* El pie DICE cuántas quedaron afuera, y NOMBRA el destino desde el registry. */}
              Ver {ocultas > 0 ? `las ${ocultas} restantes` : 'todos'} en{' '}
              {nombreDeDestino(DESTINO_PENDIENTES) ?? 'Pendientes'}
              <Icon name="arrowRight" size={15} color="var(--spira-acc-deep-track)" />
            </button>
          )}
        </div>,
        document.body,
      )}

      {/* La visita que abrió una tarjeta. Va FUERA del portal del panel a propósito: el panel se
          cierra al abrirla, y si el modal colgara de ahí adentro se desmontaría con él. `onChanged`
          relee las alertas: si en el modal se reagenda o se carga lo que faltaba, la alerta deja de
          estar vigente y la campana tiene que enterarse. */}
      {visitaAbierta && (
        <VisitDetail
          visitId={visitaAbierta}
          accent={ACENTO_TRACK}
          onClose={() => setVisitaAbierta(null)}
          onChanged={() => alerts.refetch()}
          onOpenPatient={abrirFichaDe}
        />
      )}
    </>
  )
}

/**
 * Reconcilia una fuente cada vez que cambia su CONJUNTO de claves (no cada render).
 *
 * `lista === null` = la fuente no está lista (cargando, con error o sin permiso): no se toca su
 * foto. Ver el punto 5 del encabezado.
 */
function useNovedades(
  fuente: Fuente,
  lista: Item[] | null,
  ctx: {
    fotos: { current: Partial<Record<Fuente, string[]>> }
    primeraVez: boolean
    marcarLeidas: (claves: readonly string[]) => void
    llegaron: (items: Item[]) => void
  },
) {
  const firma = lista === null ? null : lista.map((i) => i.novedad.clave).join('|')
  // Lo último, por ref: el efecto depende sólo de la firma, y no de objetos nuevos en cada render.
  const ultimo = useRef({ lista, ctx })
  ultimo.current = { lista, ctx }
  useEffect(() => {
    const { lista: l, ctx: c } = ultimo.current
    if (l === null) return
    const r = reconciliar(c.fotos.current[fuente], l.map((i) => i.novedad), c.primeraVez)
    c.fotos.current[fuente] = r.foto
    if (r.marcarLeidas.length > 0) c.marcarLeidas(r.marcarLeidas)
    if (r.nuevas.length > 0) {
      const porClave = new Map(l.map((i) => [i.novedad.clave, i]))
      c.llegaron(r.nuevas.map((n) => porClave.get(n.clave)!).filter(Boolean))
    }
  }, [fuente, firma])
}

/**
 * «Descartar» y su confirmación.
 *
 * Descartar se registra con motivo y autor, así que no se borra en seco: el botón abre un popover
 * con el catálogo de motivos, y "Otro" exige explicación. Es el «flujo de descarte con motivo que ya
 * está definido» que el handoff pide conectar (su prototipo borra directo, para simplificar).
 *
 * SIN UI OPTIMISTA. `dismissAlert` espera al RPC y después `bumpDismissals()` relee los descartes en
 * las tres instancias montadas —la campana, el resumen y Pendientes—, así que la tarjeta se va sola
 * apenas vuelve el servidor. Una alerta que reaparece sola después de archivarla hace dudar del
 * registro entero; se gana el viaje de ida y vuelta, se paga con eso.
 */
function BotonDescartar({ destino }: { destino: Descarte }) {
  const [abierto, setAbierto] = useState(false)
  const cerrar = useCallback(() => setAbierto(false), [])
  const { triggerRef, popRef, pos } = usePopover<HTMLButtonElement, HTMLDivElement>(abierto, cerrar, true, 'end')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const necesitaDetalle = motivo === MOTIVO_OTRO
  // La MISMA regla que usa el modal de Pendientes, no una copia parecida. Ver `descarteListo`.
  const listo = descarteListo(motivo, detalle)

  const confirmar = async () => {
    if (!listo || ocupado) return
    setOcupado(true)
    setError(null)
    const { error: e } = await dismissAlert({
      kind: destino.kind,
      visitId: destino.visitId,
      reportDefinitionId: destino.reportDefinitionId,
      reason: motivo,
      detail: necesitaDetalle ? detalle : null,
    })
    setOcupado(false)
    if (e) { setError(e); return }
    // No se cierra el PANEL: sólo el popover. La tarjeta se va sola con el refetch.
    setAbierto(false)
  }

  // El botón vive en el mismo lugar que la hora y aparece en hover (handoff v2); ver el CSS.
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="spira-tarjeta-descartar spira-no-press"
        title="Descartar"
        aria-label={`Descartar la alerta: ${destino.etiqueta}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        // No propaga: el clic es para el tacho, no para abrir la visita.
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v) }}
      >
        <Icon name="trash" size={14} stroke={1.8} />
      </button>

      {abierto && pos && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label="Descartar la alerta"
          className="spira-notif-pop"
          style={{ top: pos.top, left: pos.left }}
          /* LA OTRA MITAD DEL PORTAL: React propaga los eventos por el árbol de REACT, no por el DOM.
             Aunque este div vive en `document.body`, su padre React es el tacho, que está adentro
             del `<div onClick>` de la tarjeta. Sin esto, elegir un motivo abría la visita. */
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div style={popTitulo}>¿Descartar esta alerta?</div>
          <div style={popBajada}>
            Se archiva con motivo y autor; si la condición cambia, vuelve a aparecer.
          </div>

          <div style={popLabel}>Motivo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {DISMISS_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className="spira-notif-motivo-op spira-no-press"
                aria-pressed={motivo === r.value}
                onClick={() => setMotivo(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {necesitaDetalle && (
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              placeholder="Queda en la auditoría."
              aria-label="Explicá el motivo"
              style={popTextarea}
            />
          )}

          {error && <div style={popError}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={cerrar} style={popBtnCancelar}>Cancelar</button>
            <button
              type="button"
              onClick={confirmar}
              disabled={!listo || ocupado}
              aria-disabled={!listo || ocupado}
              className={!listo || ocupado ? 'spira-no-press' : undefined}
              style={{
                ...popBtnConfirmar,
                // Deshabilitado hasta que haya motivo: el botón no promete algo que la base va a rechazar.
                opacity: listo && !ocupado ? 1 : 0.45,
                cursor: listo && !ocupado ? 'pointer' : 'default',
              }}
            >
              {ocupado ? 'Archivando…' : 'Descartar'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/* —— estilos —— */
const bellBtn: CSSProperties = {
  /* `padding: 0` explícito: el `1px 6px` que trae el navegador achica la caja de contenido y el
     ícono se centra ahí adentro, no en el botón. */
  width: 38, height: 38, padding: 0, borderRadius: 10, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--spira-ink)',
  position: 'relative',
}
const emptyState: CSSProperties = { padding: '30px 16px 34px', textAlign: 'center' }
const emptyIcon: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 42, height: 42, borderRadius: '50%',
  background: 'color-mix(in srgb, var(--spira-good) 12%, transparent)', marginBottom: 10,
}
const emptyBox: CSSProperties = {
  padding: '26px 16px', textAlign: 'center', color: 'var(--spira-muted)', fontSize: 13.5,
}

const popTitulo: CSSProperties = {
  fontFamily: 'var(--spira-font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--spira-ink)',
}
const popBajada: CSSProperties = { fontSize: 11.5, lineHeight: 1.4, color: 'var(--spira-muted)' }
const popLabel: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--spira-muted)', marginTop: 2,
}
const popTextarea: CSSProperties = {
  width: '100%', resize: 'vertical', padding: '7px 9px', borderRadius: 8,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spira-line-2)',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, color: 'var(--spira-ink)',
  background: 'var(--spira-white)',
}
const popError: CSSProperties = {
  fontSize: 11.5, lineHeight: 1.4, color: 'var(--spira-acc-deep-danger)',
}
const popBtn: CSSProperties = {
  flex: 1, height: 30, borderRadius: 8, cursor: 'pointer',
  fontFamily: 'var(--spira-font-text)', fontSize: 12, fontWeight: 600,
  borderWidth: 1, borderStyle: 'solid',
}
const popBtnCancelar: CSSProperties = {
  ...popBtn, borderColor: 'var(--spira-line-2)', background: 'var(--spira-white)',
  color: 'var(--spira-ink)',
}
const popBtnConfirmar: CSSProperties = {
  ...popBtn, borderColor: 'var(--spira-acc-deep-danger)',
  background: 'var(--spira-acc-deep-danger)', color: 'var(--spira-white)',
}
