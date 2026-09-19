/**
 * ┌─ El IP de la visita, dicho en palabras ────────────────────────────────────────────────────┐
 *
 * La REGLA (qué estado tiene el IP de una visita) vive en la base, en `v_visit_ip_status` (0119), y
 * no se reescribe acá: la leen tres lugares y tienen que decir lo mismo. Este archivo sólo traduce
 * el estado ya decidido a lo que ve la coordinadora, y decide qué se le ofrece hacer.
 *
 * POR QUÉ ES PURO Y CON TEST. Todo lo de acá puede quedar al revés sin verse: la fila se dibuja
 * prolija igual si dice "Entregado" sobre un pedido rechazado, si ofrece "No corresponde" sobre un IP
 * ya entregado (el servidor lo rebota, pero la pantalla prometió algo que no existe), o si el contador
 * "n/total realizados" suma un IP que no correspondía. Ver el criterio en
 * `src/views/pharma/dispensaciones/estados.test.ts`.
 *
 *   estado                     cuenta en n/total   hecho   se ofrece
 *   sin_pedir                  1 de total          no      "No se entrega en esta visita"
 *   pedido                     1 de total          no      nada (se resuelve en Farmacia)
 *   rechazado                  1 de total          no      "No se entrega en esta visita"
 *   entregado                  1 de total          sí      nada
 *   entregado_en_otra_visita   1 de total          sí      "Deshacer"
 *   no_corresponde             NO cuenta           —       "Deshacer"
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import type { EstadoIp, MotivoNoCorresponde, VisitIpStatusRow } from '../../data/visitIp'
import { formatDateAR, formatDateTimeAR } from '../../lib/dates'

/** El nombre de la fila. Es un procedimiento más para quien la lee, no una sección aparte. */
export const TITULO_IP = 'Entrega de producto en investigación'

/** Los motivos de "No corresponde", en el orden en que se ofrecen. `otro` pide contarlo. */
export const MOTIVOS_NO_CORRESPONDE: readonly { value: MotivoNoCorresponde; label: string }[] = [
  { value: 'discontinuo_tratamiento', label: 'Discontinuó el tratamiento' },
  { value: 'retirado_por_sponsor', label: 'Lo retiró el sponsor' },
  { value: 'otro', label: 'Otro' },
]

export function rotuloMotivo(m: MotivoNoCorresponde | null): string {
  return MOTIVOS_NO_CORRESPONDE.find((x) => x.value === m)?.label ?? 'Sin motivo'
}

/** Cómo entra la fila del IP al contador "n/total realizados" del panel. */
export function cuentaIp(estado: EstadoIp): { total: number; hecho: number } {
  if (estado === 'no_corresponde') return { total: 0, hecho: 0 }
  const hecho = estado === 'entregado' || estado === 'entregado_en_otra_visita' ? 1 : 0
  return { total: 1, hecho }
}

/** Qué se le ofrece hacer a la coordinadora. En la ficha (sólo lectura) nada. */
export function accionesIp(estado: EstadoIp, readOnly: boolean): { puedeCerrar: boolean; puedeDeshacer: boolean } {
  if (readOnly) return { puedeCerrar: false, puedeDeshacer: false }
  return {
    // `pedido` NO: hay un pedido vivo en Farmacia, y cerrarlo acá dejaría dos verdades. El servidor
    // lo rechaza con el mismo criterio (close_visit_ip, 0119).
    puedeCerrar: estado === 'sin_pedir' || estado === 'rechazado',
    puedeDeshacer: estado === 'no_corresponde' || estado === 'entregado_en_otra_visita',
  }
}

const kits = (n: number | null) => (n ? ` · ${n} ${n === 1 ? 'kit' : 'kits'}` : '')

/**
 * Qué pasó con el IP de la visita, en UNA frase (spec 2026-09-19, E1). La dicen igual la sección
 * «Producto en investigación» de Dispensación y la fila de Procedimientos (`detalleIp`, que le suma
 * dónde se resuelve). Antes cada una decía lo suyo: «Sin pedir» en la fila y «Sin constancia
 * cargada.» en la sección, sobre la misma visita.
 *
 * OJO CON EL ALCANCE: en la sección esta frase sale sólo en las ramas `desenlace` y `cierre`. Mientras
 * hay un pedido en curso que acepta la constancia y está en lectura, la sección sigue diciendo «Sin
 * constancia cargada.» —ahí sí falta un papel—, mientras la fila ya da la frase de `pedido` que sale de
 * acá. No se contradicen: son ramas distintas de la misma visita.
 *
 * `terminada` = la visita tiene fin de atención (`ready_at`), la misma señal con la que la tarjeta
 * decide si está cerrada (`vistaVisitaCerrada`). En una que todavía no terminó, «sin entregar» sonaría
 * a problema, y la base tiene cientos así: las próximas visitas del cronograma.
 */
export function desenlaceIp(row: VisitIpStatusRow, terminada: boolean): string {
  switch (row.estado) {
    case 'sin_pedir':
      return terminada ? 'Sin entregar: no se pidió a Farmacia.' : 'Todavía no se pidió a Farmacia.'
    case 'rechazado':
      return terminada ? 'Sin entregar: Farmacia rechazó el pedido.' : 'Farmacia rechazó el pedido.'
    case 'pedido':
      return row.pedido_at
        ? `Pedido a Farmacia el ${formatDateTimeAR(row.pedido_at)}, sin entregar todavía.`
        : 'Pedido a Farmacia, sin entregar todavía.'
    case 'entregado': {
      const quien = row.entregado_por_name ? ` por ${row.entregado_por_name}` : ''
      const cuando = row.entregado_at ? ` el ${formatDateTimeAR(row.entregado_at)}` : ''
      return `Entregado${quien}${cuando}${kits(row.entregado_ip_kits)}.`
    }
    case 'entregado_en_otra_visita': {
      const donde = row.otra_visita_code ?? row.otra_visita_name ?? 'otra visita'
      const cuando = row.otra_visita_entregado_at ? ` el ${formatDateAR(row.otra_visita_entregado_at)}` : ''
      return `Entregado en ${donde}${cuando}${kits(row.otra_visita_ip_kits)}.`
    }
    case 'no_corresponde': {
      const motivo = row.cierre_motivo === 'otro' && row.cierre_detalle
        ? row.cierre_detalle
        : rotuloMotivo(row.cierre_motivo)
      const quien = row.cerrado_por_name ? ` Lo marcó ${row.cerrado_por_name}.` : ''
      return `No corresponde: ${motivo}.${quien}`
    }
  }
}

/**
 * La segunda línea de la fila de Procedimientos: el desenlace y, si queda algo por hacer, dónde.
 * SIEMPRE empieza con `desenlaceIp` (hay un test que lo exige). En una visita terminada lo pendiente
 * se «carga», porque lo que se registra es una entrega que ya pasó; en una que no terminó, se «pide».
 */
export function detalleIp(row: VisitIpStatusRow, terminada: boolean): string {
  const desenlace = desenlaceIp(row, terminada)
  switch (row.estado) {
    case 'sin_pedir':
    case 'rechazado':
      return `${desenlace} ${terminada ? 'Se carga desde Dispensación.' : 'Se pide desde Dispensación.'}`
    case 'pedido':
      return `${desenlace} Se marca cuando Farmacia confirma la entrega.`
    default:
      return desenlace
  }
}

/** Si la fila se dice "hecha" (tilde lleno, asentada en el panel). */
export function ipHecho(estado: EstadoIp): boolean {
  return cuentaIp(estado).hecho === 1
}

/**
 * Si el formulario de cierre está listo para mandarse. Espeja los chequeos de `close_visit_ip`
 * (0119): si la pantalla deja pasar lo que la base rebota, la coordinadora ve un error por algo que
 * la pantalla ya sabía.
 */
export function cierreListo(
  kind: 'no_corresponde' | 'entregado_en_otra_visita' | null,
  motivo: MotivoNoCorresponde | null,
  detalle: string,
  dispensationId: string | null,
): boolean {
  if (kind === 'no_corresponde') {
    if (!motivo) return false
    return motivo !== 'otro' || detalle.trim() !== ''
  }
  if (kind === 'entregado_en_otra_visita') return !!dispensationId
  return false
}

/** Lo que dice la alerta «IP sin entregar» después del nombre de la visita. */
export function motivoAlertaIp(estado: 'sin_pedir' | 'pedido' | 'rechazado'): string {
  if (estado === 'pedido') return 'IP pedido, sin entregar'
  if (estado === 'rechazado') return 'IP rechazado por Farmacia'
  return 'IP sin pedir'
}
