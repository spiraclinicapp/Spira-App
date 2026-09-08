import type { SelectOption } from '../../components/SearchableSelect'

/**
 * El vocabulario de la dispensación FUERA DE CRONOGRAMA, compartido por las dos pantallas que
 * la pueden originar: el panel de la visita en Coordinación (`VisitDispensationPanel`) y el alta
 * manual del mostrador de Farmacia (`dispensaciones/PanelNuevaDispensacion`).
 *
 * Vivía como `const` privado dentro del primero, con un comentario que prometía "si la lista se
 * corrige, se corrige acá y en ningún otro lado". Cuando el mostrador necesitó la misma lista,
 * copiarla habría roto esa promesa por escrito — y no es una lista cualquiera: el texto elegido
 * NO se queda en la pantalla donde se decidió, viaja a la tarjeta del tablero, al cajón y al
 * COMPROBANTE IMPRESO que lee un monitor. Dos redacciones del mismo hecho clínico en dos
 * comprobantes es una inconsistencia que alguien pregunta en una auditoría.
 */

/**
 * Motivos de una dispensación fuera de cronograma. Desplegable y no texto libre: el Director
 * prefiere valores preestablecidos para no depender de cómo lo escriba cada operador.
 *
 * Lo que se manda al servidor es la ETIQUETA legible y no la clave (ver `motivoLabel` en los
 * consumidores): `ajuste_dosis` impreso en un comprobante no le dice nada a nadie.
 *
 * PENDIENTE: lista propuesta, a confirmar por el Director (2026-08-09). Si la corrige, ahora sí
 * se corrige acá y en ningún otro lado.
 */
export const MOTIVOS_FUERA_CRONOGRAMA: readonly SelectOption[] = [
  { value: 'reposicion', label: 'Reposición por pérdida o rotura' },
  { value: 'vnp', label: 'Visita no programada (VNP)' },
  { value: 'ajuste_dosis', label: 'Ajuste de dosis indicado por el investigador' },
  { value: 'viaje', label: 'Adelanto por viaje del paciente' },
  { value: 'otro', label: 'Otro' },
]

/** La clave del motivo que corresponde a una VNP, para preseleccionarlo cuando el pedido nace
 *  justamente de registrar una (mostrador de Farmacia). Se nombra en vez de escribir 'vnp' suelto
 *  en la vista: si la lista cambia de claves, el compilador no ayuda pero el grep sí. */
export const MOTIVO_VNP = 'vnp'

/** Mismo texto por los caminos que crean el pedido: la falta es la misma y quien la lee tiene que
 *  leer siempre lo mismo. Sereno, en castellano, sin culpar. */
export const FALTA_MOTIVO_MSG =
  'Elegí el motivo de la dispensación fuera de cronograma antes de solicitarla.'

/**
 * Lo que hace falta saber de una visita para decidir si su dispensación necesita motivo. Los dos
 * consumidores lo cumplen sin adaptar nada: `v_track_visits` y `visitas_dispensables` (0115)
 * exponen las dos columnas con estos mismos nombres.
 */
export interface VisitaDispensadora {
  /** `coalesce(visit_definitions.dispenses, false)`: el cronograma dice que entrega medicación. */
  dispenses: boolean
  /** `coalesce(visit_definitions.dispenses_ip, false)`: el cronograma dice que entrega IP (0071). */
  dispenses_ip: boolean
}

/**
 * Por cuál de sus dos caminos nace el pedido. NO es un detalle de presentación: la base valida
 * distinto según el caso, y una sola constante para los dos mentiría en uno de ellos.
 *
 *   create_dispensation_request, 0071:481-487, cuando NO viene motivo:
 *     items > 0  →  exige vd.dispenses      ("Esta visita no entrega medicación")
 *     items = 0  →  exige vd.dispenses_ip   ("Un pedido sin renglones y sin IP no es un pedido")
 */
export type CaminoDelPedido =
  /** Renglones de medicación. Es SIEMPRE el caso del mostrador de Farmacia. */
  | 'renglones'
  /** Sin renglones: el pedido es la constancia de IP. */
  | 'solo_ip'
  /** Ninguno de los dos está autorizado por el cronograma, así que da igual por dónde se entre.
   *  Es la condición de la sección de excepción en Coordinación, que ofrece los dos caminos. */
  | 'cualquiera'

/**
 * ¿Hace falta declarar un motivo para que la base acepte este pedido?
 *
 * El motivo es la ÚNICA puerta que tiene la base para saltear la validación del cronograma
 * (0071), y `off_schedule` lleva su propio check: no existe una excepción sin motivo.
 *
 * Se testea porque falla EN SILENCIO hacia un lado. Si devolviera `false` de más, la base
 * rechaza el pedido y la farmacéutica ve el error — molesto pero visible. Si devolviera `true`
 * de más, una dispensación perfectamente normal queda grabada con `off_schedule = true` y un
 * motivo inventado, y eso no se ve en ninguna pantalla: aparece cuando un monitor filtra las
 * excepciones y encuentra decenas que no lo eran.
 */
export function necesitaMotivoFueraCronograma(
  v: VisitaDispensadora,
  camino: CaminoDelPedido,
): boolean {
  switch (camino) {
    case 'renglones': return !v.dispenses
    case 'solo_ip': return !v.dispenses_ip
    case 'cualquiera': return !v.dispenses && !v.dispenses_ip
  }
}
