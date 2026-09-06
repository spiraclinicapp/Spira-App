import type { CSSProperties, ReactNode } from 'react'
import { GLOSARIO } from '../lib/glosario'
import type { ClaveGlosario } from '../lib/glosario'

/**
 * Una palabra de la jerga del centro, con su explicación al apuntarla.
 *
 * ES UN `<abbr>` Y NO UN `<span>` CON `title`: es la etiqueta que HTML tiene para un término con
 * expansión, y con ella el lector de pantalla anuncia la definición sin que haya que agregar un
 * `aria-label` que repita el `title` (dos textos para lo mismo se desincronizan solos). El
 * subrayado punteado y el `cursor: help` viven en `.spira-termino`, en tokens.css.
 *
 * SE USA CON MEDIDA. La regla es: se marca el término la primera vez que aparece en un bloque, no
 * cada vez que se repite. Subrayar los quince IVRS de una lista no enseña nada —la definición es la
 * misma quince veces— y convierte la columna en un texto resaltado, que es lo contrario de la calma
 * que esta app persigue. Cuando la explicación tiene que ir sobre algo que no es una palabra (una
 * fila entera, un número), pasá `GLOSARIO.<clave>` a un `title` común y no uses este componente:
 * marcar visualmente algo que no es un término confunde más de lo que ayuda.
 *
 * `title` es la convención de la casa para las pistas (167 usos en la app) y no necesita máquina
 * nueva: funciona con el teclado del sistema, no se rompe si falla el JS y no reserva espacio.
 */
export function Termino({ clave, children, style }: {
  clave: ClaveGlosario
  /** El texto tal como se muestra. Sin esto no habría qué marcar. */
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <abbr className="spira-termino" title={GLOSARIO[clave]} style={style}>
      {children}
    </abbr>
  )
}
