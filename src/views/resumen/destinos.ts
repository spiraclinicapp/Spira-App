import { MODULES } from '../../modules/registry'

/**
 * A dónde lleva cada KPI del Resumen de Coordinación, y cómo se llama ese lugar.
 *
 * Del handoff `docs/design_handoff_resumen_tareas_enfoque/`: al apuntar un KPI aparece, a la derecha
 * de su rótulo, el nombre del submódulo destino con una flecha. Ese nombre es una PROMESA — "clickeá
 * y vas acá" — y lo único inaceptable es que prometa un lugar que no existe.
 *
 * POR ESO EL RÓTULO NO SE ESCRIBE ACÁ: se lee de `MODULES` en tiempo de render. El mock del handoff
 * traía su propio diccionario (`DEST_LABEL = { pacientes: "Pacientes", ... }`), que es exactamente
 * la forma de que el chip y el menú se separen el día que alguien renombre un submódulo. Acá el mapa
 * guarda coordenadas (`moduleKey`/`subKey`) y el nombre sale del registry, que es la única fuente.
 *
 * EL DESAJUSTE QUE VAS A VER Y NO ES UN ERROR: "Protocolos activos" y "Pacientes activos" apuntan
 * los dos a `track/protocolos`, cuyo nombre visible es **Pacientes** — a los protocolos se entra por
 * esa misma pantalla y los pacientes viven adentro. Que el chip diga "Pacientes" sobre un número de
 * protocolos lee raro el primer día y es cierto todos los días, que es el orden de prioridades en
 * una app auditable. (Decisión D8 del plan.)
 *
 * Un `subKey` mal escrito NO rompe nada visible: `resolveView` cae al `Placeholder` y el chip igual
 * muestra un rótulo. De ahí que esto viva en un módulo puro con `destinos.test.ts` al lado, que lo
 * cruza contra el registry y contra las vistas realmente registradas.
 */

/** Las cuatro tarjetas de cifras del Resumen de Coordinación, en el orden en que se muestran. */
export type KpiKey = 'protocolos' | 'pacientes' | 'reportes' | 'visitas'

export interface Destino {
  moduleKey: string
  subKey: string
}

/**
 * El submódulo que junta lo que hay que resolver — se llama **Pendientes** desde el 2026-09-05 y su
 * clave sigue siendo `alertas`.
 *
 * Está acá arriba y con nombre propio porque lo apuntan TRES lugares (el KPI, el pie de la tarjeta
 * de alertas del Resumen y el enlace de vuelta de la propia vista), y hasta hoy dos de ellos lo
 * nombraban con un literal escrito a mano. Un literal habría sobrevivido al renombre sin fallar:
 * la pantalla diría "Alertas" y el menú "Pendientes", sin un solo error.
 */
export const DESTINO_PENDIENTES: Destino = { moduleKey: 'track', subKey: 'alertas' }

export const KPI_DESTINOS: Record<KpiKey, Destino> = {
  protocolos: { moduleKey: 'track', subKey: 'protocolos' },
  pacientes: { moduleKey: 'track', subKey: 'protocolos' },
  /* El KPI se llama "Reportes vencidos" y NO "Pendientes vencidos" desde que el submódulo se llama
     Pendientes: "los pendientes vencidos de Pendientes" no dice nada. Y de paso es más exacto —
     cuenta `item_vencido`, que es un REPORTE del estudio fuera de plazo. */
  reportes: DESTINO_PENDIENTES,
  visitas: { moduleKey: 'track', subKey: 'visitas' },
}

/**
 * El nombre visible del destino, tal como aparece en el menú lateral. `null` si el destino no existe
 * en el registry — caso que el test de abajo hace imposible, pero que el tipo no puede prometer.
 *
 * Devolver `null` y no un texto de relleno es deliberado: quien lo consuma tiene que poder decidir
 * NO dibujar el chip antes que dibujar uno que nombre un lugar inventado.
 */
export function nombreDeDestino(destino: Destino): string | null {
  const modulo = MODULES.find((m) => m.key === destino.moduleKey)
  return modulo?.submodules.find((s) => s.key === destino.subKey)?.name ?? null
}
