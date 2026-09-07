import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/* Se lee del disco y no con el `?raw` de Vite porque vitest reemplaza los CSS por stubs vacíos:
   el import devuelve "" y los tres tests pasarían a fallar por "falta la variable" en vez de por
   lo que miran. La ruta es relativa a la raíz del repo, que es desde donde corre `npm run test`. */
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

/* El orden de apilado de la app.
 *
 * Se testea porque es LA falla silenciosa de esta clase: un popover tapado no tira error, no
 * escribe nada en consola y no se ve raro — el menú simplemente no aparece, y el que lo pulsa
 * cree que el botón no anda. Todos los desplegables de Ajustes estuvieron así (el de Módulos y
 * el de Rol en Mi cuenta) desde que el modal nació con z-index 220 contra los 60 de los popovers,
 * y nadie lo reportó hasta que una captura lo mostró.
 *
 * Se lee el CSS y no una tabla en TypeScript a propósito: `tokens.css` es la ÚNICA fuente de los
 * números. Duplicarlos acá para poder compararlos sería crear justo la desincronización que este
 * test viene a impedir.
 *
 * ⚠️ QUÉ PROTEGE Y QUÉ NO. Protege el orden ENTRE las capas declaradas: si alguien sube el modal
 * por encima del popover, la suite se pone roja. NO protege contra una capa nueva que se escriba
 * como número suelto en un `.tsx` sin pasar por acá — para eso no hay test, hay que revisarlo al
 * leer el diff. Si aparece un overlay nuevo, su lugar se decide ACÁ primero.
 */

/** El valor de una variable de capa, tal como está escrita en tokens.css. */
function capa(nombre: string): number {
  const m = new RegExp(`--spira-z-${nombre}\\s*:\\s*(-?\\d+)\\s*;`).exec(tokens)
  if (!m) throw new Error(`Falta --spira-z-${nombre} en tokens.css`)
  return Number(m[1])
}

/** De abajo hacia arriba. El último de la lista tapa a todos los anteriores. */
const ORDEN = ['drawer', 'palette', 'modal', 'dialog', 'popover'] as const

describe('escala de capas', () => {
  it('las cinco capas están declaradas en tokens.css', () => {
    // `capa()` lanza si falta, así que basta con pedirlas todas: borrar una rompe acá y no en
    // producción, que es donde se vería como "el menú no abre".
    for (const nombre of ORDEN) expect(Number.isFinite(capa(nombre))).toBe(true)
  })

  it('cada capa está por encima de la anterior, sin empates', () => {
    // Los empates importan tanto como el orden: con el mismo z-index gana el orden del DOM, y un
    // popover portaleado a `document.body` va DESPUÉS del overlay que lo abrió sólo por casualidad.
    for (let i = 1; i < ORDEN.length; i++) {
      expect(capa(ORDEN[i])).toBeGreaterThan(capa(ORDEN[i - 1]))
    }
  })

  it('el popover está por encima de TODO lo demás', () => {
    // La regla que motiva el archivo entero, escrita aparte de la cadena de arriba: un popover
    // vive fuera del árbol de quien lo abrió (portal a body) y compite con él en el contexto raíz.
    // Si no está último, no se ve.
    const popover = capa('popover')
    for (const nombre of ORDEN) {
      if (nombre !== 'popover') expect(popover).toBeGreaterThan(capa(nombre))
    }
  })
})
