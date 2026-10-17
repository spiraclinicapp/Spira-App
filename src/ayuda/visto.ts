/* ============================================================================
   «Visto» de los tutoriales: en el navegador (localStorage), como las leídas de la campana. Plan:
   docs/plan-tutoriales.md, «Visto»; desde el 2026-10-18, por usuario (docs/plan-ayuda-manual.md, A14).

   Visto = el video terminó o se reprodujo al menos el 90 %. Abrirlo no alcanza: un «✓ Visto» por haber
   abierto y cerrado es un dato falso, aunque sea chico. Y el halo del play depende de esto: apagarlo de más
   es dejar de avisar que hay algo para ver.

   LA CLAVE ES POR USUARIO, como `shell/leidas.ts`: las PC del centro son compartidas, y con una clave por
   navegador lo que vio una coordinadora le apagaba el halo a la siguiente. La clave vieja, sin usuario
   (`spira.tutoriales.vistos`), no se sabe de quién era: no se migra a nadie, se borra.

   El almacenamiento puede no estar (navegación privada, políticas del navegador) o tirar al escribir: nada de
   eso rompe la Ayuda. Sin almacenamiento, o sin usuario, todo figura «no visto», que es lo honesto.
   ============================================================================ */

/** La clave de antes del 2026-10-18, sin usuario. Sólo para borrarla. */
export const CLAVE_VIEJA = 'spira.tutoriales.vistos'

export function claveDeVistos(uid: string): string {
  return `spira.tutoriales.vistos:${uid}`
}

/** Lo mínimo de `Storage` que se usa: se inyecta en los tests. */
type Almacen = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>

function almacenPorDefecto(): Almacen | null {
  try { return window.localStorage } catch { return null }
}

/** Los ids que vio este usuario. Sin usuario, un valor roto o ajeno: vacío. De paso borra la clave vieja. */
export function leerVistos(uid: string | null, almacen: Almacen | null = almacenPorDefecto()): Set<string> {
  try { almacen?.removeItem?.(CLAVE_VIEJA) } catch { /* sin almacenamiento: no hay nada que borrar */ }
  if (!uid) return new Set()
  try {
    const crudo = almacen?.getItem(claveDeVistos(uid))
    const lista: unknown = crudo ? JSON.parse(crudo) : []
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Marca uno como visto y devuelve el conjunto nuevo (aunque no se haya podido guardar, o no haya usuario). */
export function marcarVisto(id: string, uid: string | null, almacen: Almacen | null = almacenPorDefecto()): Set<string> {
  const vistos = leerVistos(uid, almacen)
  vistos.add(id)
  if (uid) {
    try { almacen?.setItem(claveDeVistos(uid), JSON.stringify([...vistos].sort())) } catch { /* queda en memoria */ }
  }
  return vistos
}

/** ¿Alcanza lo reproducido para darlo por visto? */
export function alcanzaParaVisto(segundoActual: number, duracion: number, terminado = false): boolean {
  if (terminado) return true
  return Number.isFinite(duracion) && duracion > 0 && segundoActual / duracion >= 0.9
}
