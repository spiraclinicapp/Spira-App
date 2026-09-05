import { describe, expect, it } from 'vitest'
import { SPIRA_VERSION } from './version'

/**
 * Por qué esto se testea, si un texto largo se VE.
 *
 * Se ve, pero sólo si alguien abre el panel de «Acerca de Spira» y despliega las novedades viejas
 * — que es justo lo que nadie hace al sacar un release. El changelog se escribe en el cierre de
 * jornada, cuando la atención está en otra cosa, y la deriva es silenciosa: entrada por entrada,
 * la "línea" se fue estirando hasta los 601 caracteres (la 0.49) sin que nadie lo decidiera.
 *
 * El daño no es estético. Con textos así el panel deja de servir como índice: no se ve QUÉ hay,
 * se lee la primera y el resto queda abajo. Se corrigió el 2026-09-04 acortando las 42 entradas
 * (pedido del Director), y este test es lo que impide que vuelva a pasar sin que se note.
 *
 * Qué garantiza el tope y qué no. Los caracteres NO predicen los renglones: a los 288px del
 * popover, la 0.43 entra en tres con 92 y la 0.30 se iba a cuatro con 89, porque depende de dónde
 * corten las palabras. Así que esto no reemplaza a mirar — lo que ataja es la DERIVA, que es el
 * modo real de romperlo: nadie escribe 92 caracteres creyendo que son 85, pero sí escribió 601.
 * De los renglones se ocupa `AboutMenu`, que recorta a tres y ofrece "Seguir leyendo"; que ese
 * botón aparezca es la señal visible de que un texto se pasó.
 *
 * El número: la entrada más larga hoy tiene 92. Cien deja margen para escribir sin pelearse con el
 * test y sigue estando a un orden de magnitud del párrafo que motivó todo esto.
 */
const TOPE = 100

describe('changelog de la plataforma', () => {
  it('cada novedad entra en una línea', () => {
    const largas = SPIRA_VERSION.changelog
      .filter((c) => c.text.length > TOPE)
      .map((c) => `${c.version} (${c.text.length} caracteres)`)

    expect(largas).toEqual([])
  })

  it('no hay dos entradas con la misma versión', () => {
    const vistas = SPIRA_VERSION.changelog.map((c) => c.version)
    expect(vistas).toEqual([...new Set(vistas)])
  })

  it('van de la más nueva a la más vieja', () => {
    // Comparación numérica por tramo, no alfabética: '0.9' > '0.10' como texto.
    const orden = SPIRA_VERSION.changelog.map((c) => c.version.split('.').map(Number))
    const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]

    for (let i = 1; i < orden.length; i++) {
      expect(cmp(orden[i - 1], orden[i]), `la ${orden[i].join('.')} quedó fuera de orden`).toBeGreaterThan(0)
    }
  })
})
