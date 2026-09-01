/**
 * La regla de búsqueda de la barra de filtros de Alertas.
 *
 * ES PURA Y TIENE TEST porque su modo de falla es el peor de un filtro: esconde filas sin decirlo.
 * Si el término no matchea donde debería, la pantalla muestra menos alertas de las que hay y se ve
 * perfectamente normal — nadie sospecha de un listado que se dibujó bien. En una pantalla cuyo
 * trabajo es no dejar pasar un desvío, eso es lo único que no puede fallar en silencio.
 *
 * SIRVE PARA LAS DOS LISTAS de la pantalla —alertas de visita y reportes pendientes— porque pide
 * sólo los tres campos que ambas comparten. Si pidiera la fila entera habría que escribirla dos
 * veces, y la segunda copia sería la que se olvide de un campo.
 *
 * Busca por lo que alguien tiene en la mano cuando llega a esta pantalla: el nombre del paciente,
 * el número de sujeto que le dijo por teléfono, o el código del protocolo. Sin acentos ni
 * mayúsculas: quien escribe "muñoz" apurada no va a poner la ñ ni la tilde, y el filtro no está
 * para corregirle la ortografía.
 */

export interface Buscable {
  patient_name: string
  patient_code: string | null
  protocol_code: string
}

/** Minúsculas y sin diacríticos, para que "Muñoz" encuentre "munoz" y "Benítez" encuentre "benitez". */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()
}

export function coincideBusqueda(fila: Buscable, termino: string): boolean {
  const t = normalizar(termino.trim())
  if (!t) return true // sin término no se filtra nada: el vacío es "todas", nunca "ninguna"
  return [fila.patient_name, fila.patient_code ?? '', fila.protocol_code]
    .some((campo) => normalizar(campo).includes(t))
}

/**
 * Las opciones de los menús Médico y Coordinador de la vista de Alertas.
 *
 * POR QUÉ ES UNA FUNCIÓN Y NO DOS `map` EN LA VISTA: acá se cruzan las DOS listas de la pantalla
 * —alertas de visita y reportes pendientes—, y ése es exactamente el lugar donde se pierde una fila
 * sin que nadie se entere. Si el menú se armara sólo con una de las dos, un médico que únicamente
 * tiene reportes pendientes no aparecería en la lista de opciones: sus alertas quedarían
 * inalcanzables por filtro, con la pantalla mostrándose perfectamente normal.
 *
 * EL CENTINELA DEL NULL es el mismo `∅` que usa Visitas del día, y tiene que existir: sin una
 * opción para "sin médico" no habría forma de pedir justamente las que no tienen a nadie a cargo,
 * que suelen ser las que se pasan.
 *
 * El CONTEO suma las dos listas por el mismo motivo: un "3" que sólo contara visitas mentiría sobre
 * lo que va a quedar al tildar.
 */

/** Centinela de "sin valor". Mismo que en Visitas del día, para que las dos pantallas coincidan. */
export const SIN_VALOR = '∅'

export interface ConPersona {
  treating_physician: string | null
  coordinator_id: string | null
  coordinator_name: string | null
}

export interface OpcionPersona {
  value: string
  label: string
  count: number
}

/** Opciones del menú Médico, ordenadas alfabéticamente con "Sin médico" al final. */
export function opcionesMedico(listas: readonly ConPersona[][], sinLabel = 'Sin médico'): OpcionPersona[] {
  const todas = listas.flat()
  const cuenta = new Map<string, number>()
  for (const f of todas) {
    const k = f.treating_physician ?? SIN_VALOR
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  return ordenar(cuenta, sinLabel, (k) => k)
}

/** Opciones del menú Coordinador. La clave es el id; el rótulo, el nombre snapshot. */
export function opcionesCoordinador(listas: readonly ConPersona[][], sinLabel = 'Sin asignar'): OpcionPersona[] {
  const todas = listas.flat()
  const cuenta = new Map<string, number>()
  const nombre = new Map<string, string>()
  for (const f of todas) {
    const k = f.coordinator_id ?? SIN_VALOR
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
    /* El nombre puede venir null en una fila y cargado en otra del mismo coordinador (es un
       snapshot escrito al asignar). Nos quedamos con el primero que exista: descartar la opción
       por una fila sin nombre escondería a un coordinador que sí tiene alertas. */
    if (f.coordinator_name && !nombre.has(k)) nombre.set(k, f.coordinator_name)
  }
  return ordenar(cuenta, sinLabel, (k) => nombre.get(k) ?? sinLabel)
}

/** Alfabético por rótulo, con el centinela SIEMPRE al final: es una categoría, no un nombre. */
function ordenar(cuenta: Map<string, number>, sinLabel: string, rotulo: (k: string) => string): OpcionPersona[] {
  return [...cuenta.entries()]
    .map(([value, count]) => ({ value, label: value === SIN_VALOR ? sinLabel : rotulo(value), count }))
    .sort((a, b) => {
      if (a.value === SIN_VALOR) return 1
      if (b.value === SIN_VALOR) return -1
      return a.label.localeCompare(b.label, 'es')
    })
}
