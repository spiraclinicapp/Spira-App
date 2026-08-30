/**
 * El reloj del guardián de inactividad: cuánto hace que nadie toca la pantalla y qué corresponde
 * hacer al respecto. Puro a propósito — es lo único de esta feature que puede estar mal SIN QUE SE
 * VEA: un `>` donde va `>=`, o los dos umbrales al revés, no rompen ninguna pantalla; simplemente
 * echan a alguien de la sesión a los cinco minutos, o nunca. Por eso vive acá y no adentro del
 * componente, y por eso tiene tests.
 *
 * Es una máquina compartida de clínica: la pantalla queda con la ficha de un paciente abierta
 * mientras el consultorio sigue funcionando. El guardián existe para eso, no para ahorrar recursos.
 */

/** Los dos umbrales, en milisegundos y en UN solo lugar. */
export const INACTIVIDAD = {
  /** Sin actividad más allá de esto, se cierra la sesión. */
  cierreMs: 30 * 60_000,
  /** Antes del cierre, el aviso con la cuenta regresiva. */
  avisoMs: 25 * 60_000,
} as const

export type Umbrales = { cierreMs: number; avisoMs: number }

/** `activo` = nadie se enteró de nada · `aviso` = el cartel en pantalla · `vencido` = a cerrar. */
export type FaseInactividad = 'activo' | 'aviso' | 'vencido'

export interface EstadoInactividad {
  fase: FaseInactividad
  /** Segundos que faltan para el cierre. 0 cuando ya venció. */
  segundosRestantes: number
}

/**
 * Traduce "cuándo fue la última actividad" a qué mostrar ahora.
 *
 * Compara TIMESTAMPS y no cuenta ticks acumulados: el navegador estrangula los timers de una
 * pestaña oculta (y los saltea del todo mientras la máquina duerme), así que un contador que sume
 * intervalos nunca llegaría al umbral justo en el caso para el que se escribió esto — la pantalla
 * abandonada. Con timestamps, volver de la suspensión encuentra la sesión vencida en el primer tick.
 */
export function estadoInactividad(
  ultimaActividad: number,
  ahora: number,
  umbrales: Umbrales = INACTIVIDAD,
): EstadoInactividad {
  /* El piso en 0 no es paranoia: si el reloj del sistema se ATRASA (un ajuste de NTP, alguien que
     corrige la hora), `ahora - ultimaActividad` da negativo y la cuenta regresiva mostraría más
     minutos de los que existen — "te quedan 7:20" sobre un máximo de 5. Tratamos el salto hacia
     atrás como actividad recién ocurrida, que es la lectura segura: como mucho, regala tiempo. */
  const transcurrido = Math.max(0, ahora - ultimaActividad)

  if (transcurrido >= umbrales.cierreMs) return { fase: 'vencido', segundosRestantes: 0 }

  /* `ceil` y no `round`: en el instante exacto en que aparece el aviso tienen que faltar los 5:00
     completos, no 4:59. Y el último segundo se muestra como 0:01 hasta que efectivamente vence. */
  const segundosRestantes = Math.ceil((umbrales.cierreMs - transcurrido) / 1000)
  const fase: FaseInactividad = transcurrido >= umbrales.avisoMs ? 'aviso' : 'activo'
  return { fase, segundosRestantes }
}

/** Segundos → "4:32". Para la cuenta regresiva del cartel; siempre dos dígitos en los segundos. */
export function formatoCuentaRegresiva(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const min = Math.floor(total / 60)
  const seg = total % 60
  return `${min}:${String(seg).padStart(2, '0')}`
}
