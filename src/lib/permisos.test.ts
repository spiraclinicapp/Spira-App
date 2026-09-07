import { describe, expect, it } from 'vitest'
import { esFraseDelModulo, puedeEnModulo, SIN_ACCESO_PUEDE } from './permisos'
import { ROLE_PUEDE, ROLE_RANK } from './roles'
import type { ModuleRole } from './roles'

/* La matriz de permisos que se lee al elegir un nivel.
 *
 * Se testea porque es una falla silenciosa de manual: una celda equivocada produce una frase
 * perfectamente redactada que promete un permiso que la RLS no da. Nadie la ve mal en pantalla —
 * se descubre el día que alguien intenta hacer lo que la frase decía y se come un 42501, o peor,
 * el día que gerencia le da un nivel de menos creyendo que alcanzaba.
 *
 * Lo que este test PUEDE probar: que las celdas existen, que no hay huecos, que los fallbacks
 * funcionan y que el texto no cambia sin querer. Lo que NO puede: que la frase sea VERDAD contra
 * Postgres — vitest no tiene base. Eso lo sostiene la cita por celda en `permisos.ts`.
 */

const NIVELES = Object.keys(ROLE_RANK) as ModuleRole[]

describe('puedeEnModulo', () => {
  it('los dos módulos operativos tienen frase propia en los CUATRO niveles', () => {
    // Sin esto, un nivel olvidado caería al genérico sin que nadie lo note: la opción se ve igual
    // de completa, sólo que dice menos.
    for (const modulo of ['track', 'pharma']) {
      for (const nivel of NIVELES) {
        expect(esFraseDelModulo(modulo, nivel), `${modulo}/${nivel}`).toBe(true)
      }
    }
  })

  it('ninguna frase queda vacía ni repetida dentro del mismo módulo', () => {
    // Dos niveles con el MISMO texto es el error más fácil de cometer copiando celdas, y el más
    // difícil de ver: el desplegable muestra cuatro opciones que se explican igual.
    for (const modulo of ['track', 'pharma']) {
      const frases = NIVELES.map((n) => puedeEnModulo(modulo, n))
      for (const f of frases) expect(f.trim().length).toBeGreaterThan(0)
      expect(new Set(frases).size, `${modulo} repite una frase`).toBe(frases.length)
    }
  })

  it('un módulo desconocido cae al texto genérico, no a vacío', () => {
    // El caso real: `lab` el día que exista, o un módulo nuevo que alguien registre antes de
    // escribir su celda. Una opción muda parece un descuido; una genérica es modesta y cierta.
    for (const nivel of NIVELES) {
      expect(puedeEnModulo('lab', nivel)).toBe(ROLE_PUEDE[nivel])
      expect(puedeEnModulo('modulo-que-no-existe', nivel)).toBe(ROLE_PUEDE[nivel])
      expect(esFraseDelModulo('lab', nivel)).toBe(false)
    }
  })

  it('el escalón sube: cada nivel dice "lo mismo que" el anterior, o describe más', () => {
    // No es un chequeo de redacción: la escalera de `ROLE_RANK` es estricta (viewer < operator <
    // leader < admin), así que una celda que describa MENOS que la de abajo estaría mintiendo
    // sobre el modelo. Los dos niveles altos lo dicen explícitamente.
    for (const modulo of ['track', 'pharma']) {
      expect(puedeEnModulo(modulo, 'leader')).toMatch(/^lo mismo que Operador/)
      expect(puedeEnModulo(modulo, 'admin')).toMatch(/^lo mismo que Líder/)
    }
  })

  it('Coordinación nombra el ámbito por estudio, que es lo que decide qué pacientes ve', () => {
    // La frase de operator es la ÚNICA de la matriz que menciona el scoping, y tiene que hacerlo:
    // el bloque de protocolos que está justo debajo en la misma pantalla es el que lo define. Si
    // dijera "puede cargar y editar pacientes" a secas, gerencia daría el nivel y se iría creyendo
    // que ya está — y la persona no vería un solo paciente hasta que le asignen un estudio.
    expect(puedeEnModulo('track', 'operator')).toMatch(/estudios que tenga asignados/)
  })

  it('Farmacia admite que su nivel más alto no compra nada, en vez de inventarle algo', () => {
    // Es la celda sin cita, y la única honesta: después de la 0009 no queda ninguna policy de
    // Farmacia con `has_role` exacto, así que todo lo de leader alcanza también a admin.
    expect(puedeEnModulo('pharma', 'admin')).toMatch(/ninguna regla de Farmacia distingue/)
  })

  it('"Sin acceso" también se explica', () => {
    // La opción que más se elige no puede ser la única muda del desplegable.
    expect(SIN_ACCESO_PUEDE.trim().length).toBeGreaterThan(0)
  })
})
