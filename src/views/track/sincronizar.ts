import type { SchedulePlan } from '../../data/visitDefinitions'

/**
 * Las líneas del preview de «Generar / actualizar cronograma» (`ScheduleSyncModal`). Puras y con test porque
 * son lo único del modal que puede fallar sin verse: un «Aplicar» apagado con cambios pendientes, o un
 * «undefined visitas» si el front llega antes que la 0163. Plan: `docs/plan-sync-sin-pisar-reprogramar.md`.
 *
 *   crear ······ siempre          «2 visitas a crear»
 *   fechas ····· siempre          «5 cambian de fecha (no atendidas)»
 *   ventanas ··· si hay           «4 sólo ajustan su ventana»            (moves − fechas)
 *   respetadas · si hay           «3 conservan la fecha que se les dio a mano»
 *   con_marcas · si hay           «1 conserva su fecha porque ya tiene algo marcado»
 *   borrar ····· siempre          «0 visitas a borrar (no atendidas)»
 *
 * Con el cronograma al día, sólo quedan las dos de «conservan»: dicen lo que el sync deliberadamente no hace,
 * para que no parezca un olvido.
 */
export type ClaveDeLinea = 'crear' | 'mover' | 'fechas' | 'ventanas' | 'respetadas' | 'con_marcas' | 'borrar'

export interface LineaDelPlan {
  clave: ClaveDeLinea
  n: number
  /** Lo que va después del número (el número lo pinta el modal en negrita). */
  texto: string
}

/**
 * Nada que aplicar: la fórmula de siempre. `moves` cuenta las que cambian de fecha O de ventana, así que un
 * cambio sólo de ventana (o de una fecha conservada a la que se le mueve la ventana) deja «Aplicar» habilitado.
 */
export function planSinCambios(plan: SchedulePlan): boolean {
  return plan.creates === 0 && plan.moves === 0 && plan.deletes === 0
}

const segun = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

function conservan(plan: SchedulePlan): LineaDelPlan[] {
  const lineas: LineaDelPlan[] = []
  const respetadas = plan.respetadas ?? 0
  const conMarcas = plan.con_marcas ?? 0
  if (respetadas > 0) {
    lineas.push({
      clave: 'respetadas', n: respetadas,
      texto: segun(respetadas, 'conserva la fecha que se le dio a mano', 'conservan la fecha que se les dio a mano'),
    })
  }
  if (conMarcas > 0) {
    lineas.push({
      clave: 'con_marcas', n: conMarcas,
      texto: segun(conMarcas, 'conserva su fecha porque ya tiene algo marcado', 'conservan su fecha porque ya tienen algo marcado'),
    })
  }
  return lineas
}

export function lineasDelPlan(plan: SchedulePlan): LineaDelPlan[] {
  if (planSinCambios(plan)) return conservan(plan)

  const crear: LineaDelPlan = { clave: 'crear', n: plan.creates, texto: segun(plan.creates, 'visita a crear', 'visitas a crear') }
  const borrar: LineaDelPlan = {
    clave: 'borrar', n: plan.deletes,
    texto: segun(plan.deletes, 'visita a borrar (no atendida)', 'visitas a borrar (no atendidas)'),
  }

  // Sin la 0163 la respuesta no trae `fechas`: lo de antes, que no distinguía fecha de ventana.
  if (plan.fechas == null) {
    return [
      crear,
      { clave: 'mover', n: plan.moves, texto: segun(plan.moves, 'visita a mover (no atendida)', 'visitas a mover (no atendidas)') },
      borrar,
    ]
  }

  const lineas: LineaDelPlan[] = [
    crear,
    { clave: 'fechas', n: plan.fechas, texto: segun(plan.fechas, 'cambia de fecha (no atendida)', 'cambian de fecha (no atendidas)') },
  ]
  const ventanas = Math.max(0, plan.moves - plan.fechas)
  if (ventanas > 0) {
    lineas.push({ clave: 'ventanas', n: ventanas, texto: segun(ventanas, 'sólo ajusta su ventana', 'sólo ajustan su ventana') })
  }
  return [...lineas, ...conservan(plan), borrar]
}

/**
 * El arranque del aviso ámbar de las que quedan fuera de su ventana nueva; `null` si no hay ninguna. El
 * modal le agrega «:» y los nombres, o «.» si quien mira no ve esas visitas.
 */
export function avisoFueraDeVentana(plan: SchedulePlan): string | null {
  const n = plan.fuera_de_ventana?.length ?? 0
  if (n === 0) return null
  return n === 1
    ? '1 de las que conservan su fecha queda fuera de su ventana nueva'
    : `${n} de las que conservan su fecha quedan fuera de su ventana nueva`
}
