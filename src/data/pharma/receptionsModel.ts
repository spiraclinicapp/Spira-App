import type { ReceptionKind } from './receptions'

/**
 * QUÉ FILTROS DE RECEPCIÓN VIAJAN A LA BASE, y en qué forma.
 *
 * NO IMPORTA SUPABASE (sólo un tipo, que se borra al compilar), y eso es lo que lo hace
 * testeable: `lib/supabase` toca `window.sessionStorage` al cargarse. Mismo criterio que
 * `ambulatoriaModel.ts`. El transporte vive en `receptions.ts`.
 *
 * POR QUÉ LA FECHA Y EL PROTOCOLO VAN A LA BASE (2026-09-13, decisión del Director): la lista tiene
 * techo de filas. Con esos dos filtros en memoria, trabajaban sobre las 500 recepciones más
 * recientes y no traían ni una más — y el aviso de corte mandaba justo a tocarlos. Elegir un
 * período viejo mostraba "Nada con esos filtros" cuando sí había recepciones, sólo que habían
 * quedado más allá del techo. Filtrando en la base, el recorte y el conteo miran el mismo universo
 * que se pidió, así que acotar por fecha o protocolo trae de verdad las que faltaban.
 *
 * Estado, medicamento y búsqueda siguen en memoria, a propósito: el estado lleva conteo en su menú
 * (cuenta sobre lo traído), el medicamento vive en los renglones embebidos y la búsqueda cruza
 * campos de varias tablas. Por eso el aviso de corte NO los nombra: no traen nada nuevo.
 */
export interface FiltrosDeBaseRecepcion {
  tipos: readonly ReceptionKind[]
  /** Ids de protocolo elegidos. Vacío = todos. */
  protocolIds: readonly string[]
  /** `YYYY-MM-DD` o vacío. `reception_date` es `date` (0002), así que compara igual que en memoria. */
  desde: string
  hasta: string
}

/** Lo que `useReceptions` le aplica a la consulta, ya normalizado. */
export interface ConsultaRecepciones {
  tipos: ReceptionKind[]
  /** Sólo se pidió "ambulatoria": además, `protocol_id is null`. */
  soloSinProtocolo: boolean
  protocolIds: string[]
  desde: string | null
  hasta: string | null
  /**
   * Firma estable para las deps del hook. Ordena tipos y protocolos: elegir A y después B, o B y
   * después A, es la MISMA consulta y no tiene que volver a pedirse.
   */
  clave: string
}

export function consultaDeRecepciones(f: FiltrosDeBaseRecepcion): ConsultaRecepciones {
  const tipos = [...new Set(f.tipos)].sort()
  const protocolIds = [...new Set(f.protocolIds)].sort()
  const desde = f.desde.trim() || null
  const hasta = f.hasta.trim() || null
  /* El guard de "ambulatoria no lleva protocolo" vale sólo si se pidió ESE tipo y nada más:
     mezclado con protocolo o investigación borraría justamente las que sí tienen protocolo. */
  const soloSinProtocolo = tipos.length === 1 && tipos[0] === 'ambulatoria'
  return {
    tipos,
    soloSinProtocolo,
    protocolIds,
    desde,
    hasta,
    clave: [tipos.join(','), protocolIds.join(','), desde ?? '', hasta ?? ''].join('|'),
  }
}
