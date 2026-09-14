/**
 * ┌─ El aviso de entrega reciente, por droga y entre protocolos (plan D14, D24, D25 y R7) ────────┐
 *
 * «Si se selecciona una medicación entregada en los últimos 30 días, mostrar un aviso en rojo en la
 * parte superior» (el pedido del Director). Reemplaza al aviso genérico de «Última dispensación».
 *
 *   se elige X (en el desplegable o ya sumado sin mandar), y en 30 días hay…    aviso
 *   una ENTREGA de la misma droga, en cualquier visita o protocolo, incluida esta  rojo
 *   un pedido ABIERTO de la misma droga en otra visita, todavía sin retirar       rojo
 *   un SALDO abierto de la misma droga y X se pide como renglón normal (D24)      rojo, con la pista
 *   X es el saldo mismo («Pedir el saldo»)                                        nada: no es repetida
 *
 * «Misma droga»: por `drug_id` si los dos lo tienen; si alguno no (la columna es nullable), por el
 * mismo medicamento. Nunca bloquea: el rojo frena la mano, la decisión es de quien pide.
 *
 * Varias drogas en rojo van en UNA caja (D25): un título general y una línea por droga.
 *
 * LA VENTANA ES DE CALENDARIO EN HORA ARGENTINA: «en los últimos 30 días» es desde el mismo día de
 * hace 30 días a las 00:00 de acá, no 720 horas. `isoDayAR` usa el huso fijo, así que el borde no
 * depende de la zona del navegador ni de la del CI (que corre en UTC).
 *
 * POR QUÉ ES PURO Y CON TEST. Es el modo de falla que el plan marca como silencioso: un aviso que no
 * salta se ve exactamente igual que uno que no tenía por qué saltar. Una entrega de omeprazol de otra
 * presentación, o en otro protocolo, o a las 22:00 del día 30, tiene que dar rojo.
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { ContextoDispensacionRow } from '../../data/pharma/dispensationModel'
import { addDaysISO, daysDiffISO, formatAR, isoDayAR } from '../../lib/dates'
import type { SaldoCaja } from './saldoModel'

export const DIAS_AVISO = 30

/** Lo elegido en la pantalla que puede disparar el aviso. */
export interface Elegido {
  medication_id: string
  drug_id: string | null
  /** Pedido con «Pedir el saldo»: no es una entrega repetida. */
  esSaldo: boolean
}

export interface AvisoRojo {
  titulo: string
  lineas: string[]
}

/** Si el instante cae dentro de los últimos 30 días de calendario, en hora argentina. */
export function dentroDeLaVentana(instante: string, ahora: Date): boolean {
  const dia = isoDayAR(instante)
  const hoy = isoDayAR(ahora.toISOString())
  return dia >= addDaysISO(hoy, -DIAS_AVISO) && dia <= hoy
}

type ConDroga = { medication_id: string | null; drug_id: string | null }

/** Misma droga si las dos filas la tienen; si no, el mismo medicamento. */
export function mismaDroga(a: ConDroga, b: ConDroga): boolean {
  if (a.drug_id && b.drug_id) return a.drug_id === b.drug_id
  return !!a.medication_id && a.medication_id === b.medication_id
}

const claveDroga = (f: ConDroga) => (f.drug_id ? `d:${f.drug_id}` : `m:${f.medication_id}`)

const fecha = (ts: string) => formatAR(isoDayAR(ts))
const envases = (n: number) => `${n} ${n === 1 ? 'envase' : 'envases'}`

/** «a», «a y b», «a, b y c». */
export function listaY(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

interface Grupo {
  droga: string
  entrega: ContextoDispensacionRow | null
  abierto: ContextoDispensacionRow | null
  saldo: SaldoCaja | null
}

/* Instantes comparados como números: PostgREST recorta los ceros de la fracción y comparar el texto
   queda atado a esa forma. */
const ms = (ts: string | null) => (ts ? Date.parse(ts) : -Infinity)
const masNuevo = (a: ContextoDispensacionRow | null, b: ContextoDispensacionRow) =>
  !a || ms(b.instante) > ms(a.instante) ? b : a

/**
 * El aviso rojo de lo elegido. `null` = no hay nada que avisar.
 *
 * `saldos` son las cajas de `saldoModel`: un saldo todavía por pedir de la misma droga convierte un
 * renglón normal en una indicación nueva (D24).
 */
export function avisoRojo(
  contexto: readonly ContextoDispensacionRow[],
  elegidos: readonly Elegido[],
  saldos: readonly SaldoCaja[],
  ahora: Date,
): AvisoRojo | null {
  const grupos = new Map<string, Grupo>()
  const grupo = (f: ConDroga & { drug_name: string | null; medication_name: string | null }) => {
    const k = claveDroga(f)
    let g = grupos.get(k)
    if (!g) {
      g = { droga: f.drug_name?.toLowerCase() ?? f.medication_name ?? 'este medicamento', entrega: null, abierto: null, saldo: null }
      grupos.set(k, g)
    }
    return g
  }

  for (const e of elegidos) {
    if (e.esSaldo) continue
    for (const f of contexto) {
      if (!f.instante || !mismaDroga(e, f)) continue
      if (f.tipo === 'entrega' && dentroDeLaVentana(f.instante, ahora)) {
        const g = grupo(f); g.entrega = masNuevo(g.entrega, f)
      } else if (f.tipo === 'abierto') {
        const g = grupo(f); g.abierto = masNuevo(g.abierto, f)
      }
    }
    for (const s of saldos) {
      if (s.pendiente <= 0 || s.estado === 'en_pantalla') continue
      const f = contexto.find((c) => c.tipo === 'indicacion' && c.item_id === s.itemId)
      if (f && mismaDroga(e, f)) { const g = grupo(f); g.saldo = g.saldo ?? s }
    }
  }
  if (grupos.size === 0) return null

  const recibio: string[] = []
  const pedido: string[] = []
  const conSaldo: string[] = []
  const lineas: string[] = []
  for (const g of grupos.values()) {
    if (g.entrega) {
      recibio.push(g.droga)
      lineas.push([g.entrega.medication_name ?? 'Medicamento', fecha(g.entrega.instante!), g.entrega.protocol_code].filter(Boolean).join(' · '))
    } else if (g.abierto) {
      pedido.push(g.droga)
      lineas.push(
        `${g.abierto.medication_name ?? 'Medicamento'} · pedido el ${fecha(g.abierto.instante!)}` +
        `${g.abierto.protocol_code ? ` en ${g.abierto.protocol_code}` : ''}, todavía sin retirar`,
      )
    } else if (g.saldo) {
      conSaldo.push(g.droga)
    }
    if (g.saldo) {
      lineas.push(`Tiene saldo de ${envases(g.saldo.pendiente)} de ${g.saldo.nombre}: pedilo con «Pedir el saldo».`)
    }
  }

  const partes = [
    recibio.length ? `recibió ${listaY(recibio)} en los últimos ${DIAS_AVISO} días` : null,
    pedido.length ? `tiene pedido ${listaY(pedido)} sin retirar` : null,
    conSaldo.length ? `tiene saldo de ${listaY(conSaldo)} sin pedir` : null,
  ].filter((p): p is string => p !== null)

  return { titulo: `Este paciente ${listaY(partes)}`, lineas }
}

/** El aviso del producto en investigación fuera de cronograma: la última entrega de IP en 30 días. */
export function avisoIp(contexto: readonly ContextoDispensacionRow[], ahora: Date): AvisoRojo | null {
  const ip = contexto
    .filter((f) => f.tipo === 'ip' && f.instante && dentroDeLaVentana(f.instante, ahora))
    .reduce<ContextoDispensacionRow | null>((a, b) => masNuevo(a, b), null)
  if (!ip?.instante) return null
  const dias = daysDiffISO(isoDayAR(ip.instante), isoDayAR(ahora.toISOString()))
  const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`
  const detalle = [
    fecha(ip.instante),
    ip.ip_kits ? `${ip.ip_kits} ${ip.ip_kits === 1 ? 'kit' : 'kits'}` : null,
    ip.es_esta_visita ? 'en esta visita' : ip.visit_code ? `en la visita ${ip.visit_code}` : null,
  ].filter(Boolean).join(' · ')
  return {
    titulo: `Ya se entregó producto en investigación ${cuando}`,
    lineas: [`${detalle}. Revisá que no sea una entrega repetida.`],
  }
}
