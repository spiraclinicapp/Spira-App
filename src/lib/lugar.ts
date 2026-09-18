import { useEffect } from 'react'
import type { NavTarget } from '../views/types'

/* ============================================================================
   DÓNDE ESTÁ PARADA LA PERSONA, para que el feedback lo pueda anclar.

   El shell no tiene URL routing profundo —la navegación es estado—, así que "en qué pantalla estaba"
   no se puede leer de ningún lado: hay que publicarlo. Cada pantalla o modal que muestra UNA entidad
   publica su lugar mientras está montado, y el feedback lee el tope al abrirse.

   ES UNA PILA Y NO UN CONTEXT porque un modal se monta ENCIMA de la vista que lo abrió y las dos
   cosas son ciertas a la vez: manda el de más arriba. Además, el único lector lee una vez (en el
   handler que abre el modal), así que un Context re-renderizaría a media app por un dato que nadie
   está mirando. Mismo patrón que la pila de `Modal.tsx` para decidir quién atiende la tecla Escape.

   EL TARGET SE HEREDA hacia abajo: un modal sin entidad propia —el wizard de Recepción, que todavía
   no creó nada— no debe BORRAR el salto que ya tenía la pantalla de atrás. Hereda el primero que
   encuentre bajando, y así abrir una ventana nunca empeora lo que se guarda.
   ============================================================================ */

export interface Lugar {
  /** Texto legible, sin el módulo ni el submódulo (los pone el shell): "Juan Pérez · 4022001". */
  label: string
  /** Cómo volver acá. Es el mismo tipo que ya usa la navegación del shell. */
  target?: NavTarget
}

/** La entrada es un objeto propio: así se saca la que corresponde aunque el orden de limpieza no
 *  sea el de publicación (React no lo garantiza entre hermanos, y StrictMode monta dos veces). */
interface Entrada { lugar: Lugar }

const pila: Entrada[] = []

/** Publica un lugar y devuelve la función que lo saca. Es la pieza que testea la suite; `useLugar`
 *  es su cáscara para componentes. Sacar dos veces no hace nada: `indexOf` ya no lo encuentra. */
export function empujarLugar(lugar: Lugar): () => void {
  const yo: Entrada = { lugar }
  pila.push(yo)
  return () => {
    const i = pila.indexOf(yo)
    if (i >= 0) pila.splice(i, 1)
  }
}

/**
 * Publica un lugar mientras el componente esté montado. `null` = este componente no aporta lugar
 * (p. ej. todavía está cargando y no sabe de quién es la ficha).
 *
 * Las dependencias son el CONTENIDO y no el objeto: quien lo usa arma el literal en el render, así
 * que la identidad cambia siempre y el efecto se re-suscribiría en cada tecla que se toca.
 */
export function useLugar(lugar: Lugar | null): void {
  const label = lugar?.label ?? ''
  const target = lugar?.target ? JSON.stringify(lugar.target) : ''
  useEffect(() => {
    if (!label) return
    return empujarLugar({ label, target: target ? (JSON.parse(target) as NavTarget) : undefined })
  }, [label, target])
}

/** El tope de la pila, con el target heredado del más cercano que tenga uno. `null` si nadie
 *  publicó. NO es reactivo a propósito: se llama en el handler que abre el feedback. */
export function lugarActual(): Lugar | null {
  if (pila.length === 0) return null
  const label = pila[pila.length - 1].lugar.label
  for (let i = pila.length - 1; i >= 0; i--) {
    const target = pila[i].lugar.target
    if (target) return { label, target }
  }
  return { label }
}

/**
 * El texto y el objetivo que se guardan con el feedback.
 *
 * El lugar publicado GANA sobre las migas del encabezado: es más preciso y lo puso quien sabe qué
 * está mostrando. Las migas son el fallback de las pantallas que no se cablearon — dan el texto,
 * no el salto, que es exactamente lo que se podía hacer antes de esta feature.
 */
export function armarLugar(args: {
  moduleName: string
  moduleKey: string
  subName: string
  subKey: string
  /** Los labels de `ViewHeader.crumbs` de la vista activa. */
  crumbs: string[]
  /** `lugarActual()`. */
  lugar: Lugar | null
}): { label: string; target: Record<string, unknown> | null } {
  const { moduleName, moduleKey, subName, subKey, crumbs, lugar } = args
  const cola = lugar ? [lugar.label] : crumbs
  const label = [moduleName, subName, ...cola].filter((p) => p.trim() !== '').join(' › ')
  const target = lugar?.target ? { moduleKey, subKey, ...lugar.target } : null
  return { label, target }
}
