import { formatNumberAR } from '../../../lib/numbers'

/**
 * El aviso de truncamiento de Estadísticas: qué consultas cortaron y qué hacer al respecto.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Las cinco consultas piden `count: 'exact'` con un techo de filas
 * porque PostgREST corta por `max-rows` devolviendo **200 OK**: sin el conteo, un rango largo daría
 * totales cortos sin ningún error, y esos totales se imprimen y se firman. Lo que faltaba era que
 * el aviso supiera CUÁL cortó y QUÉ control la achica.
 *
 * LA ASIMETRÍA, que es lo que hace que esto no sea un `if`: los dos controles de la pantalla no
 * sirven para todas las consultas.
 *
 *   · A `vencidos` NO la achica el rango: es un corte AL DÍA DE HOY, no del período.
 *   · A las salidas ambulatorias NO las achica el protocolo: no tienen (0116).
 *
 * Y si esas dos truncan a la vez, ningún control por separado alcanza. Por eso cada fuente declara
 * a qué responde, como dato al lado de su rótulo: ahí se lee y se corrige junto, en vez de quedar
 * implícito en una escalera de ternarios.
 *
 * Es puro a propósito —sin React, sin Supabase— porque el consejo es lo que falla en silencio: uno
 * equivocado se lee perfecto y manda a tocar un control inerte con la impresión bloqueada.
 */

/**
 * A qué controles responde una fuente. UNIÓN DISCRIMINADA y no dos booleanos sueltos, porque con
 * booleanos sueltos se podían escribir dos fuentes que el consejo no sabe tratar, y que compilaban:
 *
 *   · una con un `false` y SIN `motivo`: el consejo caía en un "no responde a ese control" genérico,
 *     que es circular ("filtrar por protocolo no achica X: no responde a ese control");
 *   · una con los DOS en `false`: caía en la rama mixta, que pide usar los dos controles — y ninguno
 *     de los dos la achica. La impresión quedaba bloqueada sin ninguna acción posible.
 *
 * Con la unión, `tsc` exige el `motivo` justo cuando hay un `false` y rechaza la fuente con los dos en
 * `false`. Ninguna de las dos era alcanzable con las cinco fuentes reales; ahora tampoco se pueden
 * ESCRIBIR, que es lo que importa el día que se sume una sexta. Si alguna vez existe una lista que no
 * achica ningún control, no se la agrega acá: necesita otro aviso, porque el de este archivo siempre
 * ofrece algo que hacer. Fijado con `@ts-expect-error` en el test.
 */
export type AlcanceDeFuente =
  | { porRango: true; porProtocolo: true; motivo?: undefined }
  | {
      porRango: true
      porProtocolo: false
      /** Por qué filtrar por protocolo no la achica. Se lee en el consejo. */
      motivo: string
    }
  | {
      porRango: false
      porProtocolo: true
      /** Por qué acotar el período no la achica. Se lee en el consejo. */
      motivo: string
    }

export type FuenteDeDatos = {
  /** Cómo se nombra en el aviso, en plural y en minúscula: "renglones dispensados", "lotes vencidos". */
  que: string
  /** Filas que la base dice que hay. Nunca es null cuando `truncado` es true (ver abajo). */
  total: number | null
  truncado: boolean
} & AlcanceDeFuente

type SinProtocolo = Extract<FuenteDeDatos, { porProtocolo: false }>
type SinRango = Extract<FuenteDeDatos, { porRango: false }>

export interface Truncamiento {
  /** Las fuentes que cortaron, con su número: "6.000 en dispensaciones y 7.200 en recepciones". */
  detalle: string
  /** Qué hacer, ya resuelto contra la asimetría. Termina en punto. */
  consejo: string
}

/** "a", "a y b", "a, b y c" — la coma sólo aparece a partir de tres. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * Devuelve `null` si ninguna consulta cortó — y ese null es lo que apaga el aviso Y desbloquea la
 * impresión, así que no puede ser un objeto vacío.
 *
 * `total ?? 0` no es una red contra el null: `conTecho` sólo levanta `truncado` cuando el conteo
 * exacto llegó y fue mayor que las filas que efectivamente llegaron, así que una fuente en esta
 * lista siempre tiene número. El fallback está para que el tipo cierre sin un `!`.
 */
export function truncamiento(fuentes: FuenteDeDatos[]): Truncamiento | null {
  const cortadas = fuentes.filter((f) => f.truncado)
  if (cortadas.length === 0) return null

  const detalle = enumerar(cortadas.map((f) => `${formatNumberAR(f.total ?? 0)} en ${f.que}`))

  /* Guardas de tipo y no un filtro pelado: así el `motivo` llega tipado como `string` y el consejo lo
     usa sin fallback. Antes había un `motivo ?? 'no responde a ese control'` que ningún test ejercía
     y que producía una frase circular. */
  const sinProtocolo = cortadas.filter((f): f is SinProtocolo => !f.porProtocolo)
  const sinRango = cortadas.filter((f): f is SinRango => !f.porRango)

  /* Las cuatro ramas salen de la UNIÓN de lo que cortó, no de la primera fuente: ofrecer un control
     que no achica NADA de lo que cortó es peor que no decir nada, porque la farmacéutica lo usa,
     no pasa nada, y sigue sin poder imprimir. */
  const consejo =
    sinProtocolo.length === 0 && sinRango.length === 0
      ? 'Acotá el rango o filtrá por protocolo.'
      : sinRango.length === 0
        ? `Acotá el rango. Filtrar por protocolo no achica ${enumerar(sinProtocolo.map((f) => f.que))}: ${enumerar(sinProtocolo.map((f) => f.motivo))}.`
        : sinProtocolo.length === 0
          ? `Filtrá por protocolo. Acotar el rango no achica ${enumerar(sinRango.map((f) => f.que))}: ${enumerar(sinRango.map((f) => f.motivo))}.`
          : 'Acotá el rango y filtrá por protocolo: ninguno de los dos alcanza por separado.'

  return { detalle, consejo }
}

/**
 * La nota que declara que el detalle descargable salió cortado, o `null` si no lo está.
 *
 * POR QUÉ DEVUELVE `null` Y NO UN BOOLEANO APARTE: la nota y la condición para mostrarla son la
 * misma cosa. Con dos piezas separadas se puede escribir una sin la otra — un archivo que declara
 * un corte que no hubo, o peor, uno cortado que no lo dice.
 *
 * LOS NÚMEROS SON DE RENGLONES, no de dispensaciones, y eso NO es un detalle de redacción. El CSV
 * tiene una fila por dispensación (`detalle()` agrupa por `dispensation_id`), pero la consulta y su
 * techo cuentan RENGLONES —una fila por (dispensación × medicamento)—, así que las dos cifras viven
 * en unidades distintas. Comparar las filas del archivo contra el total de la consulta diría
 * "cortado" en CADA descarga, porque casi siempre hay más renglones que dispensaciones.
 */
export function notaDeDetalleCortado(
  { renglonesLeidos, renglonesEnTotal }: { renglonesLeidos: number; renglonesEnTotal: number | null },
): string | null {
  if (renglonesEnTotal == null || renglonesLeidos >= renglonesEnTotal) return null
  return `Este detalle está cortado: la pantalla pudo leer ${formatNumberAR(renglonesLeidos)} de `
    + `${formatNumberAR(renglonesEnTotal)} renglones del período, así que faltan dispensaciones acá.`
}
