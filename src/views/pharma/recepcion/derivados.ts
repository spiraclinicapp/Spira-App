import { formatNumberAR } from '../../../lib/numbers'
// Import de TIPO solamente (se borra al compilar): `renglonesParaRepetir` devuelve exactamente lo
// que el wizard consume, y declararlo estructuralmente acá sería una copia que se despega el día
// que `CountedMed` cambie sin que nada falle.
import type { CountedMed } from '../ReceptionWizard'

/**
 * Los derivados de la lista de Recepción: las frases con números y la decisión de qué fila
 * aparece al buscar.
 *
 * Van acá, puros y fuera del componente, porque son lo único del reskin que puede fallar EN
 * SILENCIO: un conteo equivocado se lee tan prolijo como uno correcto, y una búsqueda que no
 * mira el EAN devuelve "sin resultados" sin ninguna señal de que el filtro estaba incompleto.
 * La banda, el header en grilla y la tabla fallan de manera visible y se verifican mirando.
 *
 * El contrato es ESTRUCTURAL a propósito (`FilaRecepcion`, no `ReceptionRow`): así el test arma
 * una fila con los seis campos que importan en vez de la fila entera de Supabase, y `folio` puede
 * entrar cuando la 0085 esté aplicada sin tocar nada de acá.
 */

/** Lo que estos derivados necesitan de una recepción. `ReceptionRow` lo satisface. */
export interface FilaRecepcion {
  tipo: string
  status: string
  notes: string | null
  total_kits: number | null
  protocol: { code: string } | null
  items: {
    medication_id: string
    lot_number: string
    quantity: number
    medication: { name: string; codes?: { code: string }[] } | null
  }[]
  /** Número correlativo (0085). Opcional mientras la migración no esté aplicada. */
  folio?: number | null
}

const esIp = (r: FilaRecepcion) => r.tipo === 'investigacion'
const verificada = (r: FilaRecepcion) => r.status === 'verificada'
const anulada = (r: FilaRecepcion) => r.status === 'anulada'

/** Unidades declaradas en los renglones. En una recepción de IP no hay renglones: hay kits. */
export function unidadesDe(r: FilaRecepcion): number {
  return r.items.reduce((s, it) => s + it.quantity, 0)
}

/**
 * Medicamentos DISTINTOS, no renglones.
 *
 * La diferencia no es cosmética y la habilita el schema: el unique de `reception_items` es por
 * (recepción, medicamento, LOTE) — 0002:267 —, así que el mismo Salbutral en dos lotes son dos
 * renglones y un solo medicamento. Contar `items.length` diría "2 medicamentos" con uno solo, y
 * nadie lo notaría jamás.
 */
export function medicamentosDistintos(r: FilaRecepcion): number {
  return new Set(r.items.map((it) => it.medication_id)).size
}

/**
 * El CUERPO del resumen, sin verbo: "2 medicamentos · 15 unidades" o "24 kits".
 *
 * Existe separado porque tres lugares necesitan el mismo cuerpo con frases distintas alrededor: la
 * banda de la card, la confirmación de verificar ("van a entrar…") y la de anular ("van a salir…").
 * Antes la confirmación se lo sacaba al resumen con un `.replace(/^trae /, '')`, que es un
 * acoplamiento invisible: el día que cambie el verbo, el replace deja de encontrarlo y el modal
 * empieza a mostrar la frase con verbo adentro, sin que nada falle.
 */
export function contenidoDe(r: FilaRecepcion): string {
  if (esIp(r)) {
    const kits = r.total_kits ?? 0
    return `${formatNumberAR(kits)} ${kits === 1 ? 'kit' : 'kits'}`
  }
  if (r.items.length === 0) return '0 renglones'

  const meds = medicamentosDistintos(r)
  const uds = unidadesDe(r)
  return (
    `${formatNumberAR(meds)} ${meds === 1 ? 'medicamento' : 'medicamentos'}` +
    ` · ${formatNumberAR(uds)} ${uds === 1 ? 'unidad' : 'unidades'}`
  )
}

/**
 * El resumen de contenido de la banda: "2 medicamentos · 15 unidades".
 *
 * El VERBO cambia con el estado y eso es el punto: hasta verificar, esas unidades todavía no
 * entraron a stock; una vez anulada, no entraron nunca y no van a entrar. El handoff resolvía la
 * distinción escondiendo el resumen en las pendientes, que son justo las cards sobre las que hay
 * que decidir algo; acá se resuelve diciéndolo.
 *
 * La anulada NO repite la palabra "anulada": el rótulo de la banda ya la lleva al lado, a dos
 * centímetros. Lo que la distingue es el tiempo verbal — "traía" — CUANDO hay algo que contar.
 * Sin renglones no hay cantidad que poner en pasado, así que ahí verificada y anulada devuelven el
 * mismo `'Sin renglones'`: el verbo no tiene sobre qué pararse.
 */
export function resumenContenido(r: FilaRecepcion): string {
  const cuerpo = contenidoDe(r)

  if (esIp(r)) {
    if (anulada(r)) return `traía ${cuerpo}`
    const kits = r.total_kits ?? 0
    return verificada(r) ? `${cuerpo} ${kits === 1 ? 'ingresado' : 'ingresados'}` : `trae ${cuerpo}`
  }

  if (r.items.length === 0) {
    if (anulada(r)) return 'Sin renglones'
    return verificada(r) ? 'Sin renglones' : 'trae 0 renglones'
  }

  if (anulada(r)) return `traía ${cuerpo}`
  const uds = unidadesDe(r)
  return verificada(r) ? `${cuerpo} ${uds === 1 ? 'ingresada' : 'ingresadas'}` : `trae ${cuerpo}`
}

/**
 * ¿Este código es el de la caja (un GTIN/EAN-13) o uno interno del centro?
 *
 * Se decide por la FORMA del código y no por `medication_codes.code_type`, que es el campo que
 * el modelo tiene para esto y que hoy miente: la columna se creó con `default 'ean13'` (0032:45)
 * y nadie eligió nunca el tipo al dar de alta, así que "01", "02" y "0" figuran en producción
 * como códigos de barras internacionales. De seis códigos distintos en Recepción, tres están
 * mal tipados y ninguno declara `interno`.
 *
 * Importa porque esa columna es la que se coteja contra la caja que la farmacéutica tiene en la
 * mano: rotular un código interno como si fuera el de la caja la manda a buscar algo que no
 * existe. Trece dígitos numéricos es una forma verificable; el campo declarado, no.
 *
 * Cuando los datos se reclasifiquen (ver TODOS.md), esto puede volver a mirar `code_type`.
 */
export function esCodigoDeBarras(code: string): boolean {
  return /^\d{13}$/.test(code.trim())
}

/**
 * ¿Esta recepción coincide con lo que se tipeó?
 *
 * Cubre lo que el handoff promete del buscador: folio, medicamento, EAN, lote y protocolo (más
 * las notas, que ya se buscaban). El EAN faltaba y es el caso que más duele: alguien pasa el
 * lector sobre una caja, la pantalla dice "nada con esos filtros" y no hay forma de saber que el
 * filtro nunca miró ese campo.
 *
 * Se buscan TODOS los códigos del medicamento, no sólo el primero: `medication_codes` es 1-a-N y
 * un producto puede tener su EAN y además un código interno.
 */
export function coincideBusqueda(r: FilaRecepcion, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const campos: string[] = [
    r.folio != null ? String(r.folio) : '',
    r.protocol?.code ?? '',
    r.notes ?? '',
  ]
  for (const it of r.items) {
    campos.push(it.lot_number, it.medication?.name ?? '')
    for (const c of it.medication?.codes ?? []) campos.push(c.code)
  }

  return campos.some((c) => c.toLowerCase().includes(q))
}

/**
 * El conteo de la barra de cada día: "3 recepciones · 15 unidades · 1 anulada".
 *
 * Las unidades y los kits NUNCA se suman entre sí (principio del Director Médico, 0038: la
 * composición de un kit la declara el sponsor y Spira no la reinterpreta). Si el día mezcla las
 * dos cosas, se enuncian las dos por separado.
 *
 * Las ANULADAS se cuentan como recepciones pero no aportan unidades ni kits. Las dos mitades de esa
 * decisión importan: son documentos que siguen a la vista (D3), así que descontarlas del conteo
 * dejaría tres cards bajo un rótulo que dice "2 recepciones" —se lee como un bug—; y sus unidades
 * nunca entraron a stock, así que sumarlas haría mentir al total. Por eso además se nombran: el
 * "· 1 anulada" es lo que explica por qué la cuenta de unidades no cierra con la de cards.
 */
export function totalesDelDia(rows: FilaRecepcion[]): string {
  const n = rows.length
  const vigentes = rows.filter((r) => !anulada(r))
  const anuladas = n - vigentes.length
  const uds = vigentes.filter((r) => !esIp(r)).reduce((s, r) => s + unidadesDe(r), 0)
  const kits = vigentes.filter(esIp).reduce((s, r) => s + (r.total_kits ?? 0), 0)

  const partes = [`${formatNumberAR(n)} ${n === 1 ? 'recepción' : 'recepciones'}`]
  if (uds > 0) partes.push(`${formatNumberAR(uds)} ${uds === 1 ? 'unidad' : 'unidades'}`)
  if (kits > 0) partes.push(`${formatNumberAR(kits)} ${kits === 1 ? 'kit' : 'kits'}`)
  if (anuladas > 0) partes.push(`${formatNumberAR(anuladas)} ${anuladas === 1 ? 'anulada' : 'anuladas'}`)
  return partes.join(' · ')
}

/**
 * El motivo que queda asentado: "Duplicada — la cargó también Ana", o sólo "Duplicada".
 *
 * Vive acá y no dentro del modal porque es texto que se escribe UNA vez y se lee para siempre —va
 * al `void_reason` de la recepción y al `reason` del movimiento compensatorio—, y una raya colgando
 * o un espacio de más no se ven mal en pantalla: se leen mal seis meses después, en la auditoría.
 */
export function armarMotivo(motivo: string, nota: string): string {
  const m = motivo.trim()
  const n = nota.trim()
  return n ? `${m} — ${n}` : m
}

/**
 * Los renglones de una recepción, listos para sembrar el wizard de "Repetir recepción".
 *
 * Agrupa POR MEDICAMENTO y suma las cantidades, que es el punto y lo único que puede fallar en
 * silencio: el unique de `reception_items` es por (recepción, medicamento, LOTE) — 0002:267 —, así
 * que el mismo Salbutral en dos lotes son dos renglones y UN medicamento. Copiar los renglones tal
 * cual dejaría el mismo producto dos veces en el Escaneo, y el wizard lo aceptaría: nadie lo vería
 * hasta que la recepción nueva entre a stock partida en dos.
 *
 * `lots: []` a propósito: el lote y el vencimiento NO se repiten. Lo que vuelve a llegar es el
 * mismo producto, casi nunca el mismo lote, y arrastrarlo sería sembrar el dato más delicado de la
 * carga con algo que probablemente ya no corresponde. Vacío, el `seedLots` del wizard crea al
 * entrar al paso Lotes un único lote en blanco con la cantidad total — que es exactamente la
 * pantalla que la farmacéutica tiene que completar.
 *
 * Tampoco viaja el `code`: `Step1Scan` lo resuelve contra el catálogo vivo, así que sembrarlo acá
 * congelaría el código que tenía el medicamento el día de la recepción original.
 *
 * Una recepción de IP no tiene renglones (lleva la cantidad total de kits), así que devuelve la
 * lista vacía sin necesidad de un caso aparte: repetir un cargamento hereda ámbito y protocolo.
 */
export function renglonesParaRepetir(r: FilaRecepcion): CountedMed[] {
  const porMedicamento = new Map<string, CountedMed>()
  for (const it of r.items) {
    const ya = porMedicamento.get(it.medication_id)
    if (ya) { ya.quantity += it.quantity; continue }
    porMedicamento.set(it.medication_id, {
      medicationId: it.medication_id,
      name: it.medication?.name ?? '—',
      quantity: it.quantity,
      lots: [],
    })
  }
  return [...porMedicamento.values()]
}
