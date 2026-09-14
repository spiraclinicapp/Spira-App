/**
 * ┌─ Compras del mes que viene: la cuenta (docs/plan-reposicion-stock-minimo.md) ───────────────┐
 *
 * La card de Estadísticas dice cuántos envases hay que comprar para el mes siguiente, por estudio y
 * medicamento. La cuenta es «para todos» (D8, D10): sale de los pacientes y su cantidad mensual,
 * NUNCA del promedio de lo gastado, que queda como referencia.
 *
 *   hoy = 14/09        M0 = septiembre (en curso)        M1 = octubre (el que se compra)
 *
 *   por (estudio, medicamento):
 *     modo null           → «sin cargar», no calcula (no cuenta como cero)
 *     modo no_se_compra   → fuera de la cuenta                                         D25
 *     modo a_demanda      → comprar = max(0, stock_fijo − estante_M1 − en_camino)       D4
 *     modo mensual        ↓
 *
 *     pacientes(M)  = asignaciones activas, sin habilitación de una entrega, de enrolamientos en
 *                     screening|activo y que NO terminaron su cronograma automático antes de M   D16 D23
 *                     (dos presentaciones activas de la misma droga: suma una)                    D21
 *     mensual(p)    = excepción del paciente ?? cantidad del estudio                             D2
 *     pendiente_M0  = Σ max(0, mensual − retirado este mes)        sobre pacientes(M0)           D14
 *     lotes vigentes hoy, por vencimiento (sin vencimiento al final): se les saca pendiente_M0
 *     estante_M1    = lo que queda en lotes que vencen el 1° de M1 o después                     D15
 *     falta_M0      = max(0, pendiente_M0 − lotes vigentes)
 *     necesidad_M1  = Σ mensual                                    sobre pacientes(M1)
 *     en_camino     = pedidos − recibido desde cada pedido (el más viejo primero)                D20
 *
 *     comprar       = max(0, necesidad_M1 + falta_M0 − estante_M1 − en_camino)                   D31
 *
 *   la demora no cambia el número: da la fecha límite = 1° de M1 − demora                       D17 D24
 *
 * POR QUÉ ES PURO Y CON TEST. Un número mal contado se dibuja igual de prolijo: comprar de menos deja
 * pacientes sin medicación, y de más se vence en el estante. Los datos llegan crudos de
 * `insumos_de_reposicion` (0125, SECURITY DEFINER porque Farmacia no lee `patient_visits`) y toda la
 * regla vive acá. Las fechas van SIEMPRE por parámetro: CI corre en UTC.
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════ El JSON de `insumos_de_reposicion` (0125) ═══════════════════════════

export type ModoReposicion = 'mensual' | 'a_demanda' | 'no_se_compra'
export type EstadoEstudio = 'activo' | 'pausado' | 'cerrado'
export type EstadoEnrolamiento = 'screening' | 'activo' | 'completado' | 'discontinuado'

export interface EstudioInsumo {
  id: string
  code: string
  name: string
  status: EstadoEstudio
}

/** Un renglón de `protocol_medications` con lo que se cargó para reponerlo. */
export interface RenglonInsumo {
  protocol_medication_id: string
  protocol_id: string
  medication_id: string
  medication_name: string
  /** `medications.unit`, que en la app es la presentación («Aerosol (IDM)»). */
  presentacion: string | null
  drug_id: string | null
  modo: ModoReposicion | null
  envases_por_mes: number | null
  stock_fijo: number | null
  /** Salidas netas de los últimos 90 días (referencia, D8). */
  salidas_90d: number
}

/** Una asignación activa de un paciente (`patient_medications`). */
export interface PacienteInsumo {
  patient_medication_id: string
  enrollment_id: string
  protocol_id: string
  medication_id: string
  drug_id: string | null
  patient_name: string
  enrollment_status: EstadoEnrolamiento
  /** Excepción del paciente (null = la del estudio). */
  envases_por_mes: number | null
  /** La habilitación «para una entrega» (0124): esa asignación no suma. */
  habilitacion_id: string | null
  /** `patient_medications.created_at`, para desempatar presentaciones. */
  asignado_el: string
  /** Tiene visitas programadas de definiciones automáticas (D23). */
  tiene_cronograma: boolean
  /** Máxima `estimated_date` de esas visitas. */
  ultima_programada: string | null
  /** Neto retirado en el mes en curso (hora AR), lista o entregada (D14). */
  retirado_mes: number
  /** Último movimiento de dispensación de esa asignación. */
  ultimo_retiro: string | null
}

export interface LoteInsumo {
  protocol_id: string
  medication_id: string
  lot_number: string
  expiry_date: string | null
  quantity: number
}

export interface PedidoInsumo {
  id: string
  grupo: string
  protocol_id: string
  medication_id: string
  cantidad: number
  pedido_el: string
}

/** Lo recibido (verificado) desde el pedido abierto más viejo, por renglón de recepción. */
export interface RecepcionInsumo {
  protocol_id: string
  medication_id: string
  cantidad: number
  /** Día de verificación, en hora AR. */
  recibido_el: string
}

export interface InsumosReposicion {
  demora_compra_dias: number | null
  estudios: EstudioInsumo[]
  renglones: RenglonInsumo[]
  pacientes: PacienteInsumo[]
  lotes: LoteInsumo[]
  pedidos: PedidoInsumo[]
  recepciones: RecepcionInsumo[]
  /** Enrolamientos en screening/activo sin ninguna medicación habilitada, por estudio. */
  sin_medicacion: { protocol_id: string; enrolamientos: number }[]
}

// ═══════════════════════════ Fechas ═══════════════════════════

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface Mes {
  /** 1° del mes, `YYYY-MM-DD`. */
  desde: string
  /** Último día del mes. */
  hasta: string
  nombre: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** El mes calendario `offset` meses después del de `hoy` (0 = el mismo). */
export function mesDe(hoy: string, offset = 0): Mes {
  const [y, m] = hoy.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + offset
  const yy = Math.floor(total / 12)
  const mm = total % 12
  const ultimo = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return { desde: `${yy}-${pad(mm + 1)}-01`, hasta: `${yy}-${pad(mm + 1)}-${pad(ultimo)}`, nombre: MESES[mm] }
}

/** Suma días a una fecha ISO sin pasar por la zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** `DD/MM`. */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export interface Plazo {
  /** El mes que se compra (M1). */
  mes: Mes
  /** 1° de M1 − demora; null sin demora cargada. */
  limite: string | null
  aTiempo: boolean
  /** Si se pide hoy, cuándo llega. */
  llega: string | null
  /** Cuando ya es tarde: el primer mes cuyo límite todavía se alcanza (D24). */
  siguienteAlcanzable: { mes: Mes; limite: string } | null
}

export function plazo(hoy: string, demora: number | null): Plazo {
  const mes = mesDe(hoy, 1)
  if (demora == null) return { mes, limite: null, aTiempo: true, llega: null, siguienteAlcanzable: null }
  const limite = sumarDias(mes.desde, -demora)
  const aTiempo = hoy <= limite
  let siguienteAlcanzable: Plazo['siguienteAlcanzable'] = null
  if (!aTiempo) {
    for (let k = 2; k <= 24; k++) {
      const m = mesDe(hoy, k)
      const l = sumarDias(m.desde, -demora)
      if (hoy <= l) { siguienteAlcanzable = { mes: m, limite: l }; break }
    }
  }
  return { mes, limite, aTiempo, llega: sumarDias(hoy, demora), siguienteAlcanzable }
}

// ═══════════════════════════ Reglas por paciente ═══════════════════════════

/** D16 + D23: el paciente cuenta en el mes que empieza en `desde`. */
export function sigueEnElMes(p: PacienteInsumo, desde: string): boolean {
  if (p.enrollment_status !== 'screening' && p.enrollment_status !== 'activo') return false
  if (!p.tiene_cronograma || !p.ultima_programada) return true
  return p.ultima_programada >= desde
}

/** Terminó su cronograma automático antes del mes y sigue activo: no suma, pero se lista (D23). */
export function terminoCronograma(p: PacienteInsumo, desde: string): boolean {
  return (p.enrollment_status === 'screening' || p.enrollment_status === 'activo')
    && p.tiene_cronograma && !!p.ultima_programada && p.ultima_programada < desde
}

/**
 * D21: con dos presentaciones activas de la misma droga en un enrolamiento, suma UNA: la última
 * retirada; si ninguna se retiró, la asignada más nueva. Devuelve los ids que NO suman.
 */
export function presentacionesDuplicadas(pacientes: readonly PacienteInsumo[]): Set<string> {
  const porClave = new Map<string, PacienteInsumo[]>()
  for (const p of pacientes) {
    if (!p.drug_id || p.habilitacion_id) continue
    const k = `${p.enrollment_id}|${p.drug_id}`
    porClave.set(k, [...(porClave.get(k) ?? []), p])
  }
  const fuera = new Set<string>()
  for (const grupo of porClave.values()) {
    if (grupo.length < 2) continue
    const [queda] = [...grupo].sort((a, b) => {
      const ra = a.ultimo_retiro ?? '', rb = b.ultimo_retiro ?? ''
      if (ra !== rb) return ra > rb ? -1 : 1
      return a.asignado_el > b.asignado_el ? -1 : a.asignado_el < b.asignado_el ? 1 : 0
    })
    for (const p of grupo) if (p.patient_medication_id !== queda.patient_medication_id) fuera.add(p.patient_medication_id)
  }
  return fuera
}

// ═══════════════════════════ Estante y pedidos ═══════════════════════════

export interface Estante {
  /** Lo que queda al 1° de M1 (D15). */
  alComienzo: number
  /** Lo que no alcanza para terminar el mes en curso (D31). */
  faltaEsteMes: number
  /** Lotes que siguen al 1° de M1 pero vencen durante M1. */
  vencenEnElMes: { lot_number: string; expiry_date: string; quantity: number }[]
  /** Lo vigente hoy, sin descontar nada. */
  vigenteHoy: number
}

/** D15: lo pendiente del mes en curso sale primero de los lotes que vencen antes. */
export function estanteAlComienzo(lotes: readonly LoteInsumo[], pendiente: number, hoy: string, mes: Mes): Estante {
  const vigentes = lotes
    .filter((l) => l.quantity > 0 && (l.expiry_date == null || l.expiry_date >= hoy))
    .map((l) => ({ ...l }))
    .sort((a, b) => {
      if (a.expiry_date === b.expiry_date) return 0
      if (a.expiry_date == null) return 1
      if (b.expiry_date == null) return -1
      return a.expiry_date < b.expiry_date ? -1 : 1
    })
  const vigenteHoy = vigentes.reduce((s, l) => s + l.quantity, 0)
  let resto = pendiente
  for (const l of vigentes) {
    if (resto <= 0) break
    const saca = Math.min(l.quantity, resto)
    l.quantity -= saca
    resto -= saca
  }
  const quedan = vigentes.filter((l) => l.quantity > 0 && (l.expiry_date == null || l.expiry_date >= mes.desde))
  return {
    alComienzo: quedan.reduce((s, l) => s + l.quantity, 0),
    faltaEsteMes: Math.max(0, resto),
    vencenEnElMes: quedan
      .filter((l): l is typeof l & { expiry_date: string } => l.expiry_date != null && l.expiry_date <= mes.hasta)
      .map((l) => ({ lot_number: l.lot_number, expiry_date: l.expiry_date, quantity: l.quantity })),
    vigenteHoy,
  }
}

export interface PedidoAbierto extends PedidoInsumo {
  pendiente: number
  /** Ya pasó `pedido_el + demora` sin recibirlo entero. */
  atrasado: boolean
}

/** D20: los pedidos se netean solos contra lo recibido desde su fecha, el más viejo primero. */
export function pedidosAbiertos(
  pedidos: readonly PedidoInsumo[],
  recepciones: readonly RecepcionInsumo[],
  hoy: string,
  demora: number | null,
): PedidoAbierto[] {
  const rec = [...recepciones].sort((a, b) => (a.recibido_el < b.recibido_el ? -1 : a.recibido_el > b.recibido_el ? 1 : 0)).map((r) => ({ ...r }))
  const ordenados = [...pedidos].sort((a, b) => (a.pedido_el < b.pedido_el ? -1 : a.pedido_el > b.pedido_el ? 1 : 0))
  const abiertos: PedidoAbierto[] = []
  for (const p of ordenados) {
    let falta = p.cantidad
    for (const r of rec) {
      if (falta <= 0) break
      if (r.cantidad <= 0 || r.recibido_el < p.pedido_el) continue
      if (r.protocol_id !== p.protocol_id || r.medication_id !== p.medication_id) continue
      const usa = Math.min(r.cantidad, falta)
      r.cantidad -= usa
      falta -= usa
    }
    if (falta > 0) {
      const atrasado = demora != null && sumarDias(p.pedido_el, demora) < hoy
      abiertos.push({ ...p, pendiente: falta, atrasado })
    }
  }
  return abiertos
}

// ═══════════════════════════ La reposición entera ═══════════════════════════

export type EstadoRenglon = 'sin_cargar' | 'no_se_compra' | 'comprar' | 'en_camino' | 'alcanza'

export type TipoAviso = 'vence' | 'falta_este_mes' | 'termino_cronograma' | 'sin_retiros' | 'dos_presentaciones' | 'varios_meses' | 'pedido_atrasado'

export interface Aviso {
  tipo: TipoAviso
  texto: string
  /** Los que no se leen como un número merecen el ámbar en la lista (D45). */
  ambar: boolean
}

export interface RenglonReposicion {
  clave: string
  protocolMedicationId: string
  estudio: EstudioInsumo
  medicationId: string
  nombre: string
  presentacion: string | null
  modo: ModoReposicion | null
  /** Lo cargado en el estudio, para abrir el formulario con el valor actual. */
  envasesPorMes: number | null
  estado: EstadoRenglon
  /** Envases a comprar (0 si no aplica). */
  comprar: number
  /** Cuenta, para el renglón abierto. */
  cuenta: {
    pacientesMes: number
    necesidad: number
    faltaEsteMes: number
    alComienzo: number
    enCamino: number
    stockFijo: number | null
  }
  pedidos: PedidoAbierto[]
  avisos: Aviso[]
  salidas90d: number
}

export interface Reposicion {
  plazo: Plazo
  hoy: string
  renglones: RenglonReposicion[]
  resumen: {
    envases: number
    medicamentos: number
    estudios: number
    sinCargar: number
    enCamino: number
    /** Pedido anterior más reciente todavía abierto (para «Deshacer»). */
    ultimoGrupo: { grupo: string; pedido_el: string; envases: number } | null
  }
  sinMedicacion: { estudio: EstudioInsumo; enrolamientos: number }[]
  demoraCargada: boolean
}

const envasesTxt = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`
const nombres = (ps: readonly PacienteInsumo[]) => {
  const unicos = [...new Set(ps.map((p) => p.patient_name))].sort((a, b) => a.localeCompare(b, 'es'))
  return unicos.length <= 3 ? unicos.join(', ') : `${unicos.slice(0, 3).join(', ')} y ${unicos.length - 3} más`
}
const noventaDias = (hoy: string) => sumarDias(hoy, -90)

export function armarReposicion(insumos: InsumosReposicion, hoy: string): Reposicion {
  const pl = plazo(hoy, insumos.demora_compra_dias)
  const m0 = mesDe(hoy, 0)
  const m1 = pl.mes
  const estudios = new Map(insumos.estudios.filter((e) => e.status !== 'cerrado').map((e) => [e.id, e]))
  const duplicados = presentacionesDuplicadas(insumos.pacientes)
  const abiertos = pedidosAbiertos(insumos.pedidos, insumos.recepciones, hoy, insumos.demora_compra_dias)

  const renglones: RenglonReposicion[] = []
  for (const r of insumos.renglones) {
    const estudio = estudios.get(r.protocol_id)
    if (!estudio) continue
    const lotes = insumos.lotes.filter((l) => l.protocol_id === r.protocol_id && l.medication_id === r.medication_id)
    const pedidos = abiertos.filter((p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id)
    const enCamino = pedidos.reduce((s, p) => s + p.pendiente, 0)
    const asignaciones = insumos.pacientes.filter((p) => p.protocol_id === r.protocol_id && p.medication_id === r.medication_id && !p.habilitacion_id)
    const avisos: Aviso[] = []

    let comprar = 0
    let necesidad = 0
    let est: Estante = { alComienzo: 0, faltaEsteMes: 0, vencenEnElMes: [], vigenteHoy: 0 }
    // Quiénes siguen en el mes se cuenta en TODO renglón, también sin cargar: el formulario de carga
    // lo muestra («7 pacientes siguen en octubre») antes de que exista el modo.
    const suman = asignaciones.filter((p) => !duplicados.has(p.patient_medication_id))
    const delMes = suman.filter((x) => sigueEnElMes(x, m1.desde))
    const pacientesMes = delMes.length

    if (r.modo === 'mensual' || r.modo === 'a_demanda') {
      let pendiente = 0
      if (r.modo === 'mensual') {
        const mensual = (p: PacienteInsumo) => p.envases_por_mes ?? r.envases_por_mes ?? 0
        for (const p of suman.filter((x) => sigueEnElMes(x, m0.desde))) pendiente += Math.max(0, mensual(p) - p.retirado_mes)
        necesidad = delMes.reduce((s, p) => s + mensual(p), 0)

        const terminaron = asignaciones.filter((p) => terminoCronograma(p, m1.desde))
        if (terminaron.length) avisos.push({ tipo: 'termino_cronograma', ambar: false, texto: `Terminó su cronograma y sigue activo, no suma: ${nombres(terminaron)}` })
        const sinRetiros = suman.filter((p) => sigueEnElMes(p, m1.desde) && (!p.ultimo_retiro || p.ultimo_retiro.slice(0, 10) < noventaDias(hoy)))
        if (sinRetiros.length) avisos.push({ tipo: 'sin_retiros', ambar: false, texto: `Sin retiros en 90 días, suma igual: ${nombres(sinRetiros)}` })
        const dobles = asignaciones.filter((p) => duplicados.has(p.patient_medication_id))
        if (dobles.length) avisos.push({ tipo: 'dos_presentaciones', ambar: true, texto: `Tiene otra presentación de la misma droga habilitada, suma una sola: ${nombres(dobles)}` })
        const varios = suman.filter((p) => mensual(p) > 0 && p.retirado_mes > mensual(p))
        if (varios.length) avisos.push({ tipo: 'varios_meses', ambar: false, texto: `Se llevó más de un mes en ${m0.nombre}: ${nombres(varios)}` })
      }
      est = estanteAlComienzo(lotes, pendiente, hoy, m1)
      comprar = r.modo === 'mensual'
        ? Math.max(0, necesidad + est.faltaEsteMes - est.alComienzo - enCamino)
        : Math.max(0, (r.stock_fijo ?? 0) - est.alComienzo - enCamino)
      if (est.faltaEsteMes > 0) avisos.unshift({ tipo: 'falta_este_mes', ambar: true, texto: `Este mes faltan ${envasesTxt(est.faltaEsteMes)}: no alcanza para ${m0.nombre}` })
      for (const v of est.vencenEnElMes) avisos.push({ tipo: 'vence', ambar: true, texto: `Un lote (${v.lot_number}, ${envasesTxt(v.quantity)}) vence el ${diaMes(v.expiry_date)}` })
    } else {
      est = estanteAlComienzo(lotes, 0, hoy, m1)
    }
    for (const p of pedidos.filter((x) => x.atrasado)) {
      const debia = insumos.demora_compra_dias != null ? sumarDias(p.pedido_el, insumos.demora_compra_dias) : p.pedido_el
      avisos.push({ tipo: 'pedido_atrasado', ambar: true, texto: `¿Llegó? El pedido del ${diaMes(p.pedido_el)} debía llegar el ${diaMes(debia)}` })
    }

    const estado: EstadoRenglon = r.modo == null ? 'sin_cargar'
      : r.modo === 'no_se_compra' ? 'no_se_compra'
        : comprar > 0 ? 'comprar'
          : enCamino > 0 ? 'en_camino'
            : 'alcanza'

    renglones.push({
      clave: r.protocol_medication_id,
      protocolMedicationId: r.protocol_medication_id,
      estudio,
      medicationId: r.medication_id,
      nombre: r.medication_name,
      presentacion: r.presentacion,
      modo: r.modo,
      envasesPorMes: r.envases_por_mes,
      estado,
      comprar: estado === 'comprar' ? comprar : 0,
      cuenta: { pacientesMes, necesidad, faltaEsteMes: est.faltaEsteMes, alComienzo: est.alComienzo, enCamino, stockFijo: r.stock_fijo },
      pedidos,
      avisos,
      salidas90d: r.salidas_90d,
    })
  }

  renglones.sort(ordenLista)
  const aComprar = renglones.filter((r) => r.estado === 'comprar')
  const grupos = new Map<string, { grupo: string; pedido_el: string; envases: number }>()
  for (const p of abiertos) {
    const g = grupos.get(p.grupo) ?? { grupo: p.grupo, pedido_el: p.pedido_el, envases: 0 }
    g.envases += p.pendiente
    grupos.set(p.grupo, g)
  }
  const ultimoGrupo = [...grupos.values()].sort((a, b) => (a.pedido_el > b.pedido_el ? -1 : a.pedido_el < b.pedido_el ? 1 : 0))[0] ?? null

  return {
    plazo: pl,
    hoy,
    renglones,
    resumen: {
      envases: aComprar.reduce((s, r) => s + r.comprar, 0),
      medicamentos: aComprar.length,
      estudios: new Set(aComprar.map((r) => r.estudio.id)).size,
      sinCargar: renglones.filter((r) => r.estado === 'sin_cargar').length,
      enCamino: renglones.reduce((s, r) => s + r.cuenta.enCamino, 0),
      ultimoGrupo,
    },
    sinMedicacion: insumos.sin_medicacion
      .filter((s) => s.enrolamientos > 0 && estudios.has(s.protocol_id))
      .map((s) => ({ estudio: estudios.get(s.protocol_id)!, enrolamientos: s.enrolamientos })),
    demoraCargada: insumos.demora_compra_dias != null,
  }
}

/** D45: la lista desplegada va por estudio y, adentro, por medicamento. */
export function ordenLista(a: RenglonReposicion, b: RenglonReposicion): number {
  return a.estudio.code.localeCompare(b.estudio.code, 'es') || a.nombre.localeCompare(b.nombre, 'es')
}

/** «Empezar a cargar»: el primer renglón sin cargar en el orden de la lista. */
export function siguienteSinCargar(rep: Reposicion): RenglonReposicion | null {
  return rep.renglones.find((r) => r.estado === 'sin_cargar') ?? null
}

// ═══════════════════════════ «Ver pedido» (D46) ═══════════════════════════

export type OrdenPedido = 'estudio' | 'medicamento' | 'cantidad'

export interface LineaPedido {
  clave: string
  nombre: string
  presentacion: string | null
  envases: number
  /** Por estudio y por cantidad: el estudio de la línea. Por medicamento: el reparto. */
  estudios: { code: string; envases: number }[]
}

export interface GrupoPedido {
  /** Código del estudio; null cuando el orden no agrupa. */
  titulo: string | null
  envases: number
  lineas: LineaPedido[]
}

/** Sólo lo que hay que comprar, ordenado como pide Farmacia. */
export function pedidoOrdenado(rep: Reposicion, orden: OrdenPedido): GrupoPedido[] {
  const compra = rep.renglones.filter((r) => r.estado === 'comprar')
  const linea = (r: RenglonReposicion): LineaPedido => ({
    clave: r.clave, nombre: r.nombre, presentacion: r.presentacion, envases: r.comprar,
    estudios: [{ code: r.estudio.code, envases: r.comprar }],
  })
  const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')

  if (orden === 'estudio') {
    const grupos = new Map<string, GrupoPedido>()
    for (const r of [...compra].sort(ordenLista)) {
      const g = grupos.get(r.estudio.code) ?? { titulo: r.estudio.code, envases: 0, lineas: [] }
      g.lineas.push(linea(r))
      g.envases += r.comprar
      grupos.set(r.estudio.code, g)
    }
    return [...grupos.values()]
  }

  if (orden === 'medicamento') {
    const porMed = new Map<string, LineaPedido>()
    for (const r of compra) {
      const l = porMed.get(r.medicationId) ?? { clave: r.medicationId, nombre: r.nombre, presentacion: r.presentacion, envases: 0, estudios: [] }
      l.envases += r.comprar
      l.estudios.push({ code: r.estudio.code, envases: r.comprar })
      porMed.set(r.medicationId, l)
    }
    const lineas = [...porMed.values()].sort(porNombre)
    for (const l of lineas) l.estudios.sort((a, b) => a.code.localeCompare(b.code, 'es'))
    return [{ titulo: null, envases: lineas.reduce((s, l) => s + l.envases, 0), lineas }]
  }

  const lineas = compra.map(linea).sort((a, b) =>
    b.envases - a.envases || porNombre(a, b) || a.estudios[0].code.localeCompare(b.estudios[0].code, 'es'))
  return [{ titulo: null, envases: lineas.reduce((s, l) => s + l.envases, 0), lineas }]
}

/** Lo que «Ya lo pedí» manda a `registrar_pedido_reposicion`: una fila por renglón a comprar. */
export function renglonesDelPedido(rep: Reposicion): { protocol_id: string; medication_id: string; cantidad: number }[] {
  return rep.renglones
    .filter((r) => r.estado === 'comprar')
    .map((r) => ({ protocol_id: r.estudio.id, medication_id: r.medicationId, cantidad: r.comprar }))
}
