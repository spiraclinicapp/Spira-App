/* ============================================================================
   «Visto» de los tutoriales: en el navegador (localStorage), como las leídas de la campana. Plan:
   docs/plan-tutoriales.md, «Visto».

   Visto = el video terminó o se reprodujo al menos el 90 %. Abrirlo no alcanza: un «✓ Visto» por haber
   abierto y cerrado es un dato falso, aunque sea chico.

   El almacenamiento puede no estar (navegación privada, políticas del navegador) o tirar al escribir: nada de
   eso rompe la Ayuda. Sin almacenamiento, todo figura «no visto», que es lo honesto.
   ============================================================================ */

export const CLAVE_VISTOS = 'spira.tutoriales.vistos'

/** Lo mínimo de `Storage` que se usa: se inyecta en los tests. */
type Almacen = Pick<Storage, 'getItem' | 'setItem'>

function almacenPorDefecto(): Almacen | null {
  try { return window.localStorage } catch { return null }
}

/** Los ids vistos. Un valor roto o ajeno no rompe nada: se lee como vacío. */
export function leerVistos(almacen: Almacen | null = almacenPorDefecto()): Set<string> {
  try {
    const crudo = almacen?.getItem(CLAVE_VISTOS)
    const lista: unknown = crudo ? JSON.parse(crudo) : []
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Marca uno como visto y devuelve el conjunto nuevo (aunque no se haya podido guardar). */
export function marcarVisto(id: string, almacen: Almacen | null = almacenPorDefecto()): Set<string> {
  const vistos = leerVistos(almacen)
  vistos.add(id)
  try { almacen?.setItem(CLAVE_VISTOS, JSON.stringify([...vistos].sort())) } catch { /* sin almacenamiento: queda en memoria */ }
  return vistos
}

/** ¿Alcanza lo reproducido para darlo por visto? */
export function alcanzaParaVisto(segundoActual: number, duracion: number, terminado = false): boolean {
  if (terminado) return true
  return Number.isFinite(duracion) && duracion > 0 && segundoActual / duracion >= 0.9
}
