import type { VisitStatus } from '../data/visits'

/**
 * De qué gravedad habla una LISTA de alertas, para teñir la cabecera de la tarjeta.
 *
 * Nace del rediseño de la card de Alertas (handoff `design_handoff_resumen_tareas_enfoque`,
 * decisión D4): la cabecera lleva el ícono, el título y el contador sobre un fondo teñido, y los
 * renglones pasan a ser filas planas con un punto de color.
 *
 * EL MOCK LA PINTA FIJA EN ROJO Y ESO NO SE PORTA. Una cabecera siempre roja afirma una gravedad
 * que puede no existir: con tres pendientes ámbar y ninguna ventana vencida, la tarjeta gritaría
 * "rojo" todos los días. En una app auditable eso no es un detalle estético — es exagerar un dato
 * clínico, y además gasta la señal: cuando de verdad se venza una ventana, ya nadie la mira.
 *
 * Por eso el tinte lo decide la PEOR alerta presente. `ventana_vencida` (roja) manda siempre sobre
 * `item_vencido` (ámbar); sin alertas devuelve `null` y la cabecera va neutra.
 *
 * ⚠️ SI ALGÚN DÍA HAY UN TERCER TIPO DE ALERTA hay que agregarlo a `GRAVEDAD` y ordenarlo acá. Un
 * estado que no esté en la lista se IGNORA a propósito: preferimos que una alerta desconocida no
 * suba el tinte a que lo suba mal. El test cubre ese caso.
 *
 * El COLOR no sale de acá: sale de `VISIT_STATES[severidad].color`, que es la paleta que ya usan
 * los chips y la leyenda del pie. Esta función devuelve el estado, no el hex — así no hay dos
 * lugares donde el rojo de "ventana vencida" pueda quedar distinto.
 */

/**
 * Los dos estados de `VisitStatus` que son ALERTA. Va con `Extract` y no escrito suelto: así el
 * compilador garantiza que son valores reales del enum —un typo o un estado que se retire de la
 * base rompe acá— sin ensanchar el tipo a los ocho, que es lo que haría que `SEVERIDAD_TINTA`
 * tuviera que cubrir "completa" o "por reprogramar".
 */
export type AlertSeverity = Extract<VisitStatus, 'ventana_vencida' | 'item_vencido'>

/** De la más grave a la menos. El orden ES la regla: `severidadMaxima` devuelve la primera que encuentra. */
export const GRAVEDAD: readonly AlertSeverity[] = ['ventana_vencida', 'item_vencido']

export function severidadMaxima(
  alertas: readonly { computed_status: VisitStatus }[],
): AlertSeverity | null {
  for (const nivel of GRAVEDAD) {
    if (alertas.some((a) => a.computed_status === nivel)) return nivel
  }
  return null
}

/**
 * La TINTA de la cabecera para cada severidad.
 *
 * Separada del color de `VISIT_STATES` a propósito, y no por duplicar: son dos usos distintos del
 * mismo concepto. `VISIT_STATES[...].color` es un hex pensado para PINTAR —el punto del chip, el
 * fondo teñido de una superficie— y ahí funciona igual en los dos temas porque se usa con alpha
 * sobre un fondo conocido. Como TEXTO, en cambio, ese mismo hex no sirve: el ámbar #B0823F sobre
 * papel no llega a 4,5:1, y en tema oscuro ninguno de los dos se aclara.
 *
 * Los `--spira-acc-deep-*` son los únicos acentos con versión aclarada para oscuro, así que todo lo
 * que sea texto o ícono de la cabecera sale de acá, y el fondo teñido sigue saliendo de
 * `VISIT_STATES` con alpha. Es la misma división que ya hace `alertItemStyle`.
 */
export const SEVERIDAD_TINTA: Record<AlertSeverity, string> = {
  ventana_vencida: 'var(--spira-acc-deep-danger)',
  item_vencido: 'var(--spira-acc-deep-warn)',
}
