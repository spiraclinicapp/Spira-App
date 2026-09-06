import { describe, expect, it } from 'vitest'
import { KIND_LABELS, KIND_SHORT } from './visitLabels'
import type { VisitKind } from './visitLabels'
import { ayudaDeRotulo, GLOSARIO } from './glosario'

/**
 * El glosario contra la fuente de los rótulos.
 *
 * `ayudaDeRotulo` busca por el TEXTO que está en pantalla ("VNP", "Rando", "F+S"), no por la clave
 * del enum, porque el que dibuja el rótulo casi siempre tiene el string ya resuelto. Eso lo hace
 * cómodo de usar y FRÁGIL de la peor manera: si mañana alguien acorta "Randomización" a "Rand." en
 * `KIND_LABELS`, el `Record` deja de matchear, `ayudaDeRotulo` devuelve `undefined` y el tooltip
 * simplemente no aparece. Nada falla, nada se ve roto, y la ayuda que este PR agrega se apaga sola
 * sin que nadie se entere.
 *
 * Este test es el que convierte ese renombre en un test rojo. Recorre las dos tablas de rótulos
 * reales y exige que cada tipo de visita SUELTA tenga explicación — lo cual también obliga a que
 * un `VisitKind` nuevo llegue con su definición.
 *
 * `programada` queda afuera a propósito: su rótulo sale del cuadro del protocolo ("V5 - Screening"),
 * no de estas tablas, y no es una abreviatura que haya que explicar.
 *
 * Sin base y sin navegador: son funciones puras.
 */

const SUELTAS = (Object.keys(KIND_LABELS) as VisitKind[]).filter((k) => k !== 'programada')

describe('ayudaDeRotulo', () => {
  it('explica el rótulo LARGO de cada tipo de visita suelta', () => {
    for (const kind of SUELTAS) {
      const rotulo = KIND_LABELS[kind]
      expect(ayudaDeRotulo(rotulo), `falta la ayuda de "${rotulo}" (${kind})`).toBeTruthy()
    }
  })

  it('explica el rótulo CORTO de cada tipo de visita suelta', () => {
    for (const kind of SUELTAS) {
      const corto = KIND_SHORT[kind]
      /* `programada` es el único con corto vacío y ya está excluido; si aparece otro, es un dato
         nuevo que hay que mirar, no un caso a saltear en silencio. */
      expect(corto, `${kind} no tiene rótulo corto`).not.toBe('')
      expect(ayudaDeRotulo(corto), `falta la ayuda de "${corto}" (${kind})`).toBeTruthy()
    }
  })

  it('no marca lo que no es una abreviatura del vocabulario', () => {
    /* Las visitas del cronograma llegan como "V5 - Screening" y NO deben marcarse: el subrayado
       punteado sobre algo que no lo necesita es ruido, y era la mitad del riesgo de este cambio. */
    expect(ayudaDeRotulo('V5 - Screening')).toBeUndefined()
    expect(ayudaDeRotulo('V12')).toBeUndefined()
    expect(ayudaDeRotulo('')).toBeUndefined()
    expect(ayudaDeRotulo(null)).toBeUndefined()
    expect(ayudaDeRotulo(undefined)).toBeUndefined()
  })

  it('tolera espacios sobrantes alrededor del rótulo', () => {
    expect(ayudaDeRotulo('  VNP  ')).toBe(ayudaDeRotulo('VNP'))
  })
})

describe('GLOSARIO', () => {
  it('cada definición es una explicación, no un rótulo repetido', () => {
    for (const [clave, texto] of Object.entries(GLOSARIO)) {
      /* El defecto que esto ataja es la definición-placeholder ("IVRS: el IVRS del paciente"), que
         compila, se ve prolija en el tooltip y no enseña nada. Veinte caracteres es el piso de una
         oración que dice algo. */
      expect(texto.length, `la definición de "${clave}" es demasiado corta`).toBeGreaterThan(20)
    }
  })
})
