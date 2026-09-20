/**
 * ┌─ Reglas compartidas de la reposición (docs/plan-reposicion-stock-minimo.md, D2-D23) ───────────────┐
 *
 * Lo que queda de la cuenta del 14/09 después de que la card «Compras para …» se fue de Estadísticas
 * (2026-09-18): los tipos que siguen valiendo y las reglas por paciente y por lote que usa la reposición
 * de corte a corte (reposicionPeriodoModel.ts). La cuenta «para todos» (D8) vive ahora allá.
 *
 *   quién suma    screening|activo que NO terminó su cronograma automático antes del período   D16 D23
 *                 (dos presentaciones activas de la misma droga: suma una)                        D21
 *   estante       lo pendiente del período en curso sale primero de los lotes que vencen antes   D15
 *
 * Puro y con tests: un número mal contado se dibuja igual de prolijo. Las fechas van SIEMPRE por
 * parámetro: CI corre en UTC.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type ModoReposicion = 'mensual' | 'a_demanda' | 'no_se_compra'
export type EstadoEstudio = 'activo' | 'pausado' | 'cerrado'
export type EstadoEnrolamiento = 'screening' | 'activo' | 'completado' | 'discontinuado'

export interface EstudioInsumo {
  id: string
  code: string
  name: string
  status: EstadoEstudio
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

// ═══════════════════════════ Fechas ═══════════════════════════

const pad = (n: number) => String(n).padStart(2, '0')

/** Suma días a una fecha ISO sin pasar por la zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** `DD/MM`. */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// ═══════════════════════════ Reglas por paciente ═══════════════════════════

/** Lo que miran las reglas de cronograma. */
type ConCronograma = Pick<PacienteInsumo, 'enrollment_status' | 'tiene_cronograma' | 'ultima_programada'>

/** D16 + D23: el paciente cuenta en el período que empieza en `desde`. */
export function sigueEnElMes(p: ConCronograma, desde: string): boolean {
  if (p.enrollment_status !== 'screening' && p.enrollment_status !== 'activo') return false
  if (!p.tiene_cronograma || !p.ultima_programada) return true
  return p.ultima_programada >= desde
}

/** Terminó su cronograma automático antes del período y sigue activo: no suma, pero se lista (D23). */
export function terminoCronograma(p: ConCronograma, desde: string): boolean {
  return (p.enrollment_status === 'screening' || p.enrollment_status === 'activo')
    && p.tiene_cronograma && !!p.ultima_programada && p.ultima_programada < desde
}

/**
 * D21: con dos presentaciones activas de la misma droga en un enrolamiento, suma UNA: la última
 * retirada; si ninguna se retiró, la asignada más nueva. Devuelve los ids que NO suman.
 */
export function presentacionesDuplicadas(
  pacientes: readonly Pick<PacienteInsumo, 'patient_medication_id' | 'enrollment_id' | 'drug_id' | 'habilitacion_id' | 'ultimo_retiro' | 'asignado_el'>[],
): Set<string> {
  const porClave = new Map<string, (typeof pacientes)[number][]>()
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

// ═══════════════════════════ El estante ═══════════════════════════

export interface Estante {
  /** Lo que queda al comienzo del período que se compra (D15). */
  alComienzo: number
  /** Lo que no alcanza para terminar el período en curso (D31). */
  faltaEsteMes: number
  /** Lotes que siguen al comienzo pero vencen durante el período que se compra. */
  vencenEnElMes: { lot_number: string; expiry_date: string; quantity: number }[]
  /** Lo vigente hoy, sin descontar nada. */
  vigenteHoy: number
}

/** D15: lo pendiente del período en curso sale primero de los lotes que vencen antes. */
export function estanteAlComienzo(
  lotes: readonly LoteInsumo[],
  pendiente: number,
  hoy: string,
  periodo: { desde: string; hasta: string },
): Estante {
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
  const quedan = vigentes.filter((l) => l.quantity > 0 && (l.expiry_date == null || l.expiry_date >= periodo.desde))
  return {
    alComienzo: quedan.reduce((s, l) => s + l.quantity, 0),
    faltaEsteMes: Math.max(0, resto),
    vencenEnElMes: quedan
      .filter((l): l is typeof l & { expiry_date: string } => l.expiry_date != null && l.expiry_date <= periodo.hasta)
      .map((l) => ({ lot_number: l.lot_number, expiry_date: l.expiry_date, quantity: l.quantity })),
    vigenteHoy,
  }
}

// ═══════════════════════════ Lo que comparte la cuenta ═══════════════════════════

export type EstadoRenglon = 'sin_cargar' | 'no_se_compra' | 'comprar' | 'en_camino' | 'alcanza'

export type TipoAviso = 'vence' | 'termino_cronograma' | 'sin_retiros' | 'dos_presentaciones' | 'varios_meses'

export interface Aviso {
  tipo: TipoAviso
  texto: string
  /** Los que no se leen como un número van en ámbar (D45). */
  ambar: boolean
}

export const envasesTxt = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`

export const nombresDePacientes = (ps: readonly { patient_name: string }[]) => {
  const unicos = [...new Set(ps.map((p) => p.patient_name))].sort((a, b) => a.localeCompare(b, 'es'))
  return unicos.length <= 3 ? unicos.join(', ') : `${unicos.slice(0, 3).join(', ')} y ${unicos.length - 3} más`
}
