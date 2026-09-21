/* ============================================================================
   De lo que quedó en el borrador a las llamadas que hay que mandar.

   VIVE ACÁ Y PURO —sin React, sin Supabase— porque es el punto donde esta pantalla puede fallar sin
   que se note. Una llamada de menos deja un acceso sin revocar y la pantalla se dibuja impecable:
   muestra lo que el usuario eligió, no lo que quedó en la base. Aislado se testea desde node;
   adentro de un `for` en el handler de guardar, no.
   ============================================================================ */

/** El alcance de una persona en Farmacia: el interruptor y, si está apagado, la lista. */
export interface AlcancePharma {
  /** true = ve todos los estudios (lo predeterminado). Espejo de
   *  `user_module_roles.ve_todos_los_estudios` (0138). */
  veTodos: boolean
  /** Ids de los estudios de `pharma_protocol_access`. Sólo rinde con `veTodos` en false. */
  estudios: string[]
}

/** Una llamada al servidor. `expected` es siempre lo que el navegador creía vigente: es el
 *  compare-and-swap de los dos RPC de la 0138. */
export type LlamadaDeAlcance =
  | { tipo: 'interruptor'; todos: boolean; expected: boolean }
  | { tipo: 'estudio'; protocolId: string; asignado: boolean; expected: boolean }

/**
 * Las llamadas que hacen falta para llevar `vigente` a `borrador`, en el orden en que se mandan.
 *
 * EL ORDEN NO ES COSMÉTICO: el interruptor va primero. Al revés, el historial se lee como si le
 * hubieran dado estudios a alguien que todavía ve todos — el mismo criterio por el que en
 * `AccesoEditor` los módulos van antes que los estudios.
 *
 * CON `veTodos` PRENDIDO EN EL BORRADOR NO SE MANDAN CAMBIOS DE ESTUDIOS, y eso es una decisión, no
 * un olvido: la lista se conserva para que gerencia la encuentre si se arrepiente, y sin el
 * interruptor no da acceso a nada porque `pharma_sin_recorte()` corta antes. Mandar las bajas
 * borraría el trabajo de elegirlos, en silencio.
 */
export function cambiosDeAlcance(
  vigente: AlcancePharma,
  borrador: AlcancePharma,
): LlamadaDeAlcance[] {
  const out: LlamadaDeAlcance[] = []

  if (vigente.veTodos !== borrador.veTodos) {
    out.push({ tipo: 'interruptor', todos: borrador.veTodos, expected: vigente.veTodos })
  }

  if (borrador.veTodos) return out

  const antes = new Set(vigente.estudios)
  const ahora = new Set(borrador.estudios)
  for (const id of new Set([...antes, ...ahora])) {
    if (antes.has(id) === ahora.has(id)) continue
    out.push({ tipo: 'estudio', protocolId: id, asignado: ahora.has(id), expected: antes.has(id) })
  }
  return out
}
