import type { IconName } from '../components/Icon'
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
 * Por eso el tinte lo decide la PEOR alerta presente. `ventana_vencida` (roja) manda siempre; sin
 * alertas devuelve `null` y la cabecera va neutra.
 *
 * ⚠️ EL TERCER TIPO LLEGÓ (0107): `por_reprogramar`. Va SEGUNDO —entre la ventana vencida y el
 * reporte fuera de plazo— porque un paciente que no vino y no tiene fecha nueva es una visita del
 * protocolo que NO OCURRIÓ, mientras que `item_vencido` es un dato que falta cargar sobre una
 * visita que sí ocurrió. El orden del `case` de la vista no dice nada al respecto: sus ramas 3 y 5
 * exigen `real_date` nulo y no nulo, así que nunca compiten.
 *
 * Un estado que no esté en la lista se IGNORA a propósito: preferimos que una alerta desconocida no
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
export type AlertSeverity = Extract<VisitStatus, 'ventana_vencida' | 'por_reprogramar' | 'item_vencido'>

/** De la más grave a la menos. El orden ES la regla: `severidadMaxima` devuelve la primera que encuentra. */
export const GRAVEDAD: readonly AlertSeverity[] = ['ventana_vencida', 'por_reprogramar', 'item_vencido']

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
  /* REUSA el token de `item_vencido` en vez de estrenar uno. El color del estado es `#8A5A3C`, un
     terracota que como TEXTO no llega a 4,5:1 sobre papel y que —como todo hex crudo— no se aclara
     en tema oscuro: es el mismo problema que este archivo ya documenta para el ámbar. Medido, el
     token rinde 6,07:1 en claro y 9,62:1 en oscuro sobre esta banda.

     EL COSTO, MEDIDO Y ASUMIDO: las bandas de "no vino" y "reporte vencido" quedan casi iguales.
     El fondo sí sale del hex de cada estado, pero al 10 % de alpha resuelven a 243,239,236 y
     247,243,236 — cuatro puntos de diferencia, o sea indistinguibles en la práctica. La cabecera
     comunica el ESCALÓN de gravedad (rojo / ámbar / neutro) y no la clase, y eso está bien: para
     eso están los ítems, donde `alertItemStyle` recibe el hex del estado y el borde al 19 % sí
     separa los dos tonos. Estrenar un token propio para el terracota exigiría calibrarlo a AA en
     los dos temas para ganar una distinción que la cabecera no tiene que hacer. */
  por_reprogramar: 'var(--spira-acc-deep-warn)',
  item_vencido: 'var(--spira-acc-deep-warn)',
}

/**
 * El ÍCONO de cada severidad.
 *
 * Vive acá por la misma razón que `SEVERIDAD_TINTA`: es un atributo de la severidad, y hasta hoy
 * estaba escrito dos veces, distinto, en dos pantallas que muestran las mismas alertas —
 * `AlertCardHeader` resolvía por tres vías (`alertCircle` / `clock` / `bell`) y `TrackAlertsView`
 * por dos (`alertCircle` o `clock` para todo lo demás), así que "no vino" salía con un ícono en la
 * tarjeta del resumen y con otro en la lista. Ninguna de las dos estaba mal a la vista; entre ellas,
 * sí. Una tercera copia en la campana habría hecho tres verdades sobre lo mismo.
 *
 * `por_reprogramar` lleva `calendar` y no `bell`: el hecho que nombra es "no vino a la cita y no
 * tiene fecha nueva", que es un asunto de calendario. Y `bell` era además el peor candidato posible
 * para el desplegable de la campana, donde el ícono de la campana ya es el marco de todo lo que se
 * está mirando: adentro de ese panel no distingue nada.
 *
 * El tipo `Record<AlertSeverity, IconName>` es la garantía de que ningún nombre acá sea un ícono que
 * no existe: `IconName` son las claves reales del set de `Icon.tsx`, así que un typo no compila. Por
 * eso el test de abajo cubre la COBERTURA y la distinción entre grados, y no la existencia.
 */
export const SEVERIDAD_ICONO: Record<AlertSeverity, IconName> = {
  ventana_vencida: 'alertCircle',
  por_reprogramar: 'calendar',
  item_vencido: 'clock',
}
