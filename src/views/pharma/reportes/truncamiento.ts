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

export interface FuenteDeDatos {
  /** Cómo se nombra en el aviso, en plural y en minúscula: "dispensaciones", "lotes vencidos". */
  que: string
  /** Filas que la base dice que hay. Nunca es null cuando `truncado` es true (ver abajo). */
  total: number | null
  truncado: boolean
  /** ¿Acotar el período achica esta lista? */
  porRango: boolean
  /** ¿Filtrar por protocolo achica esta lista? */
  porProtocolo: boolean
  /** Por qué esta lista no responde a uno de los dos controles. Sólo para las que tienen un `false`. */
  motivo?: string
}

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
 * exacto llegó y superó el techo, así que una fuente en esta lista siempre tiene número. El
 * fallback está para que el tipo cierre sin un `!`.
 */
export function truncamiento(fuentes: FuenteDeDatos[]): Truncamiento | null {
  const cortadas = fuentes.filter((f) => f.truncado)
  if (cortadas.length === 0) return null

  const detalle = enumerar(cortadas.map((f) => `${formatNumberAR(f.total ?? 0)} en ${f.que}`))

  const sinProtocolo = cortadas.filter((f) => !f.porProtocolo)
  const sinRango = cortadas.filter((f) => !f.porRango)

  /* Las cuatro ramas salen de la UNIÓN de lo que cortó, no de la primera fuente: ofrecer un control
     que no achica NADA de lo que cortó es peor que no decir nada, porque la farmacéutica lo usa,
     no pasa nada, y sigue sin poder imprimir. */
  const consejo =
    sinProtocolo.length === 0 && sinRango.length === 0
      ? 'Acotá el rango o filtrá por protocolo.'
      : sinRango.length === 0
        ? `Acotá el rango. Filtrar por protocolo no achica ${enumerar(sinProtocolo.map((f) => f.que))}: ${enumerar(sinProtocolo.map((f) => f.motivo ?? 'no responde a ese control'))}.`
        : sinProtocolo.length === 0
          ? `Filtrá por protocolo. Acotar el rango no achica ${enumerar(sinRango.map((f) => f.que))}: ${enumerar(sinRango.map((f) => f.motivo ?? 'no responde a ese control'))}.`
          : 'Acotá el rango y filtrá por protocolo: cada una de estas listas responde a uno de los dos.'

  return { detalle, consejo }
}
