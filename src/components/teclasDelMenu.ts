/**
 * Qué hace el menú ⋮ (`ActionMenu`) con una tecla que le llega a su disparador o a uno de sus ítems.
 *
 * El menú FRENA el teclado porque suele colgar de algo que también se abre con Enter o Espacio: la
 * fila de Visitas del día es un `role="button"`. Sin el freno, Enter sobre el ⋮ abría el menú y,
 * además, la visita de abajo —y por el portal, el Enter sobre un ítem viaja igual por el árbol de
 * React hasta la fila—.
 *
 * Pero el freno se llevaba puesto el Esc (hasta el 2026-10-11). El `stopPropagation` de React corta
 * también el evento nativo en la raíz, así que el Esc no llegaba nunca a `document`, que es donde
 * `usePopover` lo escucha para cerrar el menú, ni a donde lo escuchan `Modal` y `Drawer`. Con el foco
 * en el ⋮, el menú no se cerraba con Esc y, con el menú cerrado, tampoco el modal de atrás.
 *
 *   · cerrar-menu → Esc con el menú abierto: lo cierra el menú y la tecla no sigue. Una capa por vez,
 *                   como en el resto de la app: el modal de atrás queda.
 *   · dejar-pasar → Esc con el menú cerrado: no es del menú, es de la capa de atrás.
 *   · frenar      → todo lo demás, como siempre.
 */
export type TeclaDelMenu = 'cerrar-menu' | 'dejar-pasar' | 'frenar'

export function teclaDelMenu(tecla: string, abierto: boolean): TeclaDelMenu {
  if (tecla !== 'Escape') return 'frenar'
  return abierto ? 'cerrar-menu' : 'dejar-pasar'
}
