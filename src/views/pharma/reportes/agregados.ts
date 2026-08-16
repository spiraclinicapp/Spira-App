import type { ReportItemRow, ReportReceptionRow } from '../../../data/pharma/reportModel'

/**
 * Los agregados del reporte: totales, tablas y la verificación de que todo cierra.
 *
 * Todas funciones puras sobre las filas que devuelve la vista. Viven en TypeScript y no en SQL
 * (decisión del eng review) por dos motivos: para que los tests prueben el código que realmente
 * corre en producción, y para que un solo snapshot en memoria alimente la pantalla Y las catorce
 * hojas impresas, con lo cual papel y pantalla no pueden divergir aunque alguien entregue
 * medicación mientras la farmacéutica mira.
 *
 * LA TRAMPA DEL GRANO, que atraviesa todo este archivo: la vista tiene una fila por
 * (dispensación × medicamento). Todo lo que sea "cuántas dispensaciones" o "cuántos kits" se
 * cuenta sobre ids DISTINTOS, nunca sumando filas.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   TOTALES
   ───────────────────────────────────────────────────────────────────────────── */

export interface Totales {
  /** Comprimidos, ampollas, lo que sea que tenga unidad. NUNCA incluye kits. */
  unidades: number
  dispensaciones: number
  pacientes: number
  /** Producto de investigación. Magnitud APARTE: no se suma a `unidades`. */
  kits: number
}

/**
 * Los totales del eje de salida.
 *
 * `kits` se suma una vez por dispensación DISTINTA. Sumar la columna sobre las filas duplicaría
 * los kits de toda dispensación que además entregó dos o más medicamentos, y el número resultante
 * se vería perfectamente razonable: un poco más alto, sin nada que delate el error.
 */
export function totales(items: ReportItemRow[]): Totales {
  const dispensaciones = new Set<string>()
  const pacientes = new Set<string>()
  const kitsPorDispensacion = new Map<string, number>()
  let unidades = 0

  for (const it of items) {
    unidades += it.unidades
    dispensaciones.add(it.dispensation_id)
    if (it.enrollment_id) pacientes.add(it.enrollment_id)
    if (it.ip_kits != null) kitsPorDispensacion.set(it.dispensation_id, it.ip_kits)
  }

  let kits = 0
  for (const k of kitsPorDispensacion.values()) kits += k

  return { unidades, dispensaciones: dispensaciones.size, pacientes: pacientes.size, kits }
}

/**
 * Las métricas que viven al nivel de la DISPENSACIÓN, no del renglón.
 *
 * Van juntas porque comparten la misma trampa: `minutos_hasta_entrega` y `unidades_solicitadas`
 * vienen repetidos en cada fila de la misma dispensación, así que promediarlos o sumarlos sobre
 * las filas le da más peso a las dispensaciones con varios medicamentos. Se colapsa primero por
 * id y recién después se calcula.
 */
export function porDispensacion(items: ReportItemRow[]): {
  minutosPromedio: number | null
  cumplimientoPct: number | null
} {
  const unicas = new Map<string, { minutos: number; solicitadas: number; entregadas: number }>()
  for (const it of items) {
    const prev = unicas.get(it.dispensation_id)
    if (prev) { prev.entregadas += it.unidades; continue }
    unicas.set(it.dispensation_id, {
      minutos: it.minutos_hasta_entrega,
      solicitadas: it.unidades_solicitadas,
      entregadas: it.unidades,
    })
  }
  if (unicas.size === 0) return { minutosPromedio: null, cumplimientoPct: null }

  const filas = [...unicas.values()]
  const minutosPromedio = filas.reduce((a, f) => a + f.minutos, 0) / filas.length

  /* El cumplimiento se calcula sobre el TOTAL pedido contra el TOTAL entregado, no promediando
     porcentajes por dispensación: un pedido de 2 unidades y otro de 200 no pesan igual, y el
     promedio de porcentajes los trataría como iguales. */
  const solicitadas = filas.reduce((a, f) => a + f.solicitadas, 0)
  const entregadas = filas.reduce((a, f) => a + f.entregadas, 0)
  const cumplimientoPct = solicitadas === 0 ? null : (entregadas / solicitadas) * 100

  return { minutosPromedio, cumplimientoPct }
}

/** Unidades ingresadas y recepciones verificadas. Los kits de IP van aparte, igual que en la salida. */
export function totalesIngresos(recepciones: ReportReceptionRow[]): {
  unidades: number
  recepciones: number
  lotes: number
  kits: number
} {
  let unidades = 0
  let lotes = 0
  let kits = 0
  for (const r of recepciones) {
    unidades += r.unidades
    lotes += r.lotes
    kits += r.total_kits ?? 0
  }
  return { unidades, recepciones: recepciones.length, lotes, kits }
}

/* ─────────────────────────────────────────────────────────────────────────────
   TABLAS
   ───────────────────────────────────────────────────────────────────────────── */

export interface FilaProtocolo {
  protocolCode: string
  protocolName: string | null
  sponsor: string | null
  dispensaciones: number
  unidades: number
  pacientes: number
  pct: number
}

/** Una fila por protocolo, ordenada por unidades descendente. */
export function porProtocolo(items: ReportItemRow[]): FilaProtocolo[] {
  const acc = new Map<string, {
    nombre: string | null; sponsor: string | null
    unidades: number; disp: Set<string>; pac: Set<string>
  }>()

  for (const it of items) {
    const code = it.protocol_code ?? '—'
    let f = acc.get(code)
    if (!f) {
      f = { nombre: it.protocol_name, sponsor: it.sponsor, unidades: 0, disp: new Set(), pac: new Set() }
      acc.set(code, f)
    }
    f.unidades += it.unidades
    f.disp.add(it.dispensation_id)
    if (it.enrollment_id) f.pac.add(it.enrollment_id)
  }

  const total = [...acc.values()].reduce((a, f) => a + f.unidades, 0)
  return [...acc.entries()]
    .map(([protocolCode, f]) => ({
      protocolCode,
      protocolName: f.nombre,
      sponsor: f.sponsor,
      dispensaciones: f.disp.size,
      unidades: f.unidades,
      pacientes: f.pac.size,
      pct: total === 0 ? 0 : (f.unidades / total) * 100,
    }))
    .sort((a, b) => b.unidades - a.unidades)
}

export interface FilaMedicamento {
  medicationName: string
  unidades: number
  dispensaciones: number
  pct: number
}

/**
 * Una fila por medicamento, ordenada por unidades descendente.
 *
 * Descarta las filas sin medicamento: son las dispensaciones de SOLO producto de investigación,
 * que existen en la vista para que sus kits se cuenten, pero no tienen medicamento que listar.
 */
export function porMedicamento(items: ReportItemRow[]): FilaMedicamento[] {
  const acc = new Map<string, { unidades: number; disp: Set<string> }>()
  for (const it of items) {
    if (!it.medication_name) continue
    let f = acc.get(it.medication_name)
    if (!f) { f = { unidades: 0, disp: new Set() }; acc.set(it.medication_name, f) }
    f.unidades += it.unidades
    f.disp.add(it.dispensation_id)
  }
  const total = [...acc.values()].reduce((a, f) => a + f.unidades, 0)
  return [...acc.entries()]
    .map(([medicationName, f]) => ({
      medicationName,
      unidades: f.unidades,
      dispensaciones: f.disp.size,
      pct: total === 0 ? 0 : (f.unidades / total) * 100,
    }))
    .sort((a, b) => b.unidades - a.unidades)
}

/**
 * Corta la tabla en el top N y junta el resto en una fila agregada ("Otros 11 medicamentos").
 *
 * La fila de resto se calcula como TOTAL MENOS LO MOSTRADO, nunca sumando los omitidos por
 * separado: así absorbe cualquier diferencia de redondeo y la columna sigue sumando el total
 * exacto. Es también por qué está testeada — si el cálculo quedara mal, la fila "Otros" se comería
 * el error y la tabla seguiría cerrando perfecto.
 *
 * Si el top N ya cubre todo, no hay fila de resto: mostrar "Otros 0" es ruido.
 */
export function conFilaOtros<T extends { unidades: number; dispensaciones: number; pct: number }>(
  filas: T[],
  topN: number,
): { visibles: T[]; otros: { cantidad: number; unidades: number; dispensaciones: number; pct: number } | null } {
  if (filas.length <= topN) return { visibles: filas, otros: null }

  const visibles = filas.slice(0, topN)
  const ocultas = filas.slice(topN)
  const totalUnidades = filas.reduce((a, f) => a + f.unidades, 0)
  const totalPct = filas.reduce((a, f) => a + f.pct, 0)

  return {
    visibles,
    otros: {
      cantidad: ocultas.length,
      unidades: totalUnidades - visibles.reduce((a, f) => a + f.unidades, 0),
      // Las dispensaciones NO son sumables entre filas (una dispensación con dos medicamentos
      // aparece en las dos), así que acá se suman las ocultas y punto: es un conteo indicativo
      // del resto, no un distinto global. La cifra global correcta vive en `totales()`.
      dispensaciones: ocultas.reduce((a, f) => a + f.dispensaciones, 0),
      pct: totalPct - visibles.reduce((a, f) => a + f.pct, 0),
    },
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   DETALLE
   ───────────────────────────────────────────────────────────────────────────── */

export interface FilaDetalle {
  dispensationId: string
  numero: number
  fecha: string
  deliveredAt: string
  pacienteNombre: string | null
  pacienteCodigo: string | null
  protocolCode: string | null
  medicamentos: string
  unidades: number
  kits: number
}

/**
 * Una fila por dispensación, con la lista de medicamentos armada.
 *
 * La columna "Visita" del handoff NO está: para llegar al nombre de la visita hay que pasar por
 * `patient_visits`, que Farmacia no puede leer (0006:162). Sumarla exigiría una tercera columna
 * desnormalizada por una columna de contexto, y no se justifica en esta tajada.
 */
export function detalle(items: ReportItemRow[]): FilaDetalle[] {
  const acc = new Map<string, FilaDetalle & { meds: { nombre: string; unidades: number }[] }>()

  for (const it of items) {
    let f = acc.get(it.dispensation_id)
    if (!f) {
      f = {
        dispensationId: it.dispensation_id,
        numero: it.correlative_number,
        fecha: it.fecha,
        deliveredAt: it.delivered_at,
        pacienteNombre: it.patient_name,
        pacienteCodigo: it.patient_code,
        protocolCode: it.protocol_code,
        medicamentos: '',
        unidades: 0,
        kits: it.ip_kits ?? 0,
        meds: [],
      }
      acc.set(it.dispensation_id, f)
    }
    f.unidades += it.unidades
    if (it.medication_name) f.meds.push({ nombre: it.medication_name, unidades: it.unidades })
  }

  return [...acc.values()]
    .map((f) => {
      const partes = f.meds
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map((m) => `${m.nombre} × ${m.unidades}`)
      if (f.kits > 0) partes.push(`Producto de investigación × ${f.kits} kits`)
      return { ...f, medicamentos: partes.join(', ') || '—' }
    })
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))
}

/* ─────────────────────────────────────────────────────────────────────────────
   LA VERIFICACIÓN
   ───────────────────────────────────────────────────────────────────────────── */

export interface Consistencia {
  ok: boolean
  problemas: string[]
}

/**
 * ¿Los bloques de la pantalla hablan del mismo número?
 *
 * Esto NO es un test: corre en producción y su resultado va a la línea que la farmacéutica lee
 * antes de imprimir. Si algo no cierra, la línea lo dice y los botones de impresión quedan
 * inertes, porque una hoja que se firma con números que no cuadran es peor que no tener hoja.
 *
 * Con un solo snapshot en memoria esto debería dar siempre `ok`. Que dé `false` significa que hay
 * un bug en los agregados o un dato imposible en la base, y en los dos casos lo correcto es no
 * imprimir.
 */
export function invariantes(
  items: ReportItemRow[],
  serie: { unidades: number }[],
  protocolos: { unidades: number; dispensaciones: number }[],
  medicamentos: { unidades: number }[],
): Consistencia {
  const t = totales(items)
  const problemas: string[] = []

  const sumaSerie = serie.reduce((a, p) => a + p.unidades, 0)
  if (sumaSerie !== t.unidades) {
    problemas.push(`la serie diaria suma ${sumaSerie} y el total dice ${t.unidades}`)
  }

  const sumaProtocolos = protocolos.reduce((a, f) => a + f.unidades, 0)
  if (sumaProtocolos !== t.unidades) {
    problemas.push(`la tabla por protocolo suma ${sumaProtocolos} y el total dice ${t.unidades}`)
  }

  const sumaMedicamentos = medicamentos.reduce((a, f) => a + f.unidades, 0)
  if (sumaMedicamentos !== t.unidades) {
    problemas.push(`la tabla por medicamento suma ${sumaMedicamentos} y el total dice ${t.unidades}`)
  }

  return { ok: problemas.length === 0, problemas }
}
