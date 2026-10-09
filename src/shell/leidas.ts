/**
 * Qué notificaciones ya viste. Handoff v2 (`docs/plan-notificaciones-v2.md`, D1).
 *
 * VIVE EN EL NAVEGADOR, no en la base, y es una decisión: «leída» es una comodidad de quien mira
 * —saber qué es nuevo desde la última vez— y no un dato clínico ni de auditoría. Ponerlo en una
 * tabla pedía migración, RLS y banco de pruebas para algo que, si se pierde (otra compu, caché
 * borrada), sólo hace que todo vuelva a verse leído. El costo asumido: no se sincroniza entre
 * dispositivos.
 *
 * LA CLAVE ES POR USUARIO. Dos personas que comparten la notebook de la recepción no se marcan las
 * notificaciones entre sí.
 *
 * TODO ACCESO A `localStorage` VA ENVUELTO: en una ventana privada, con el almacenamiento bloqueado
 * o lleno, `getItem`/`setItem` tiran. La campana vive en el shell; si esto rompiera, se apaga el
 * topbar entero. La falla mansa es «nada leído guardado», y la campana sigue andando.
 */

/** Cuántas claves se guardan como máximo. Las más viejas se caen primero. */
export const MAX_LEIDAS = 1000

export function claveDeAlmacen(uid: string): string {
  return `spira:notif-leidas:${uid}`
}

/**
 * Lo guardado, o `null` si NUNCA se guardó nada para este usuario.
 *
 * La diferencia entre `null` y `[]` es la que sostiene la SIEMBRA (ver `reconciliar`): `null` es
 * «primera vez en este navegador» y `[]` es «ya estuvo acá y no leyó nada».
 */
export function leerLeidas(uid: string): string[] | null {
  try {
    const crudo = window.localStorage.getItem(claveDeAlmacen(uid))
    if (crudo === null) return null
    const v: unknown = JSON.parse(crudo)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return null
  }
}

export function guardarLeidas(uid: string, claves: readonly string[]): void {
  try {
    window.localStorage.setItem(claveDeAlmacen(uid), JSON.stringify(claves))
  } catch {
    /* Sin almacenamiento, lo leído vive sólo en esta pestaña. No hay nada útil que decirle al
       usuario sobre esto. */
  }
}

/**
 * Suma claves a lo leído, sin repetir y con techo.
 *
 * Las nuevas van AL FINAL y el recorte saca las del principio: así lo que se cae es lo leído hace
 * más tiempo, que es justo lo que ya no está en el panel. Sin techo, la lista crecería con cada
 * notificación de cada día, para siempre, en cada carga de la app.
 */
export function marcar(previas: readonly string[], nuevas: readonly string[]): string[] {
  const set = new Set(previas)
  const agregadas = nuevas.filter((k) => !set.has(k) && (set.add(k), true))
  if (agregadas.length === 0) return previas as string[]
  const todas = [...previas, ...agregadas]
  return todas.length > MAX_LEIDAS ? todas.slice(todas.length - MAX_LEIDAS) : todas
}

/** De dónde sale una tarjeta. Cada consulta llega cuando llega, y por eso se siembra por separado. */
export type Fuente = 'alertas' | 'pedidos' | 'constancias' | 'correcciones'

/** Lo que `reconciliar` necesita saber de cada tarjeta. */
export interface Novedad {
  clave: string
  /** Si su llegada merece la alerta de la campana. */
  avisa: boolean
  /** Si la produjo quien mira (crear o cancelar su propio pedido): se marca leída y no avisa. */
  propia: boolean
}

/**
 * Qué cambió en una fuente desde la última vez que se la miró. ACÁ ESTÁ EL MODO DE FALLA MUDO DE LA
 * ALERTA: si la siembra no anda, cada vez que alguien abre la app le saltan las cuarenta alertas de
 * siempre anunciadas como nuevas; si la comparación queda al revés, la alerta no sale nunca. Las dos
 * se ven igual desde afuera —una pantalla que hace ruido, o que no hace nada— y ninguna tira error.
 *
 *   · `previo === undefined` — LA SIEMBRA: la fuente llega por primera vez en esta sesión. No hay
 *     contra qué comparar, así que no avisa nada. Si además es la primera vez en este navegador
 *     (`primeraVez`), todo lo que ya existe cuenta como leído: sin esto, el día del deploy cada
 *     usuario arrancaría con el punto prendido por pendientes de hace semanas.
 *   · Después — lo que no estaba en la foto anterior es NUEVO. Lo propio se marca leído; lo demás que
 *     avise sale en `nuevas`.
 *
 * Va POR FUENTE porque las consultas no vuelven juntas: con una sola foto, las constancias que
 * llegan medio segundo después que las alertas se leerían como recién aparecidas.
 */
export function reconciliar(
  previo: readonly string[] | undefined,
  actuales: readonly Novedad[],
  primeraVez: boolean,
): { foto: string[]; marcarLeidas: string[]; nuevas: Novedad[] } {
  const foto = actuales.map((n) => n.clave)
  if (previo === undefined) {
    return { foto, marcarLeidas: primeraVez ? foto : [], nuevas: [] }
  }
  const antes = new Set(previo)
  const llegadas = actuales.filter((n) => !antes.has(n.clave))
  return {
    foto,
    marcarLeidas: llegadas.filter((n) => n.propia).map((n) => n.clave),
    nuevas: llegadas.filter((n) => n.avisa && !n.propia),
  }
}

/** Las claves de `actuales` que no están leídas, en el mismo orden. */
export function noLeidas(actuales: readonly string[], leidas: readonly string[]): string[] {
  const set = new Set(leidas)
  return actuales.filter((k) => !set.has(k))
}
