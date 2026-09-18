import { describe, expect, it } from 'vitest'
import { armarLugar, empujarLugar, lugarActual } from './lugar'

/* Dónde estaba parada la persona cuando mandó el feedback.
 *
 * SE TESTEA PORQUE FALLA EN SILENCIO: el que lee esto es el supervisor, días después, y un lugar
 * armado al revés —o el target de otra pantalla— se ve perfecto en la bandeja y lo manda a mirar
 * donde no era. En pantalla no se nota nada, que es exactamente el criterio de qué se testea acá.
 */

describe('la pila de lugares', () => {
  it('manda el último que se publicó', () => {
    const sacarFicha = empujarLugar({ label: 'Juan Pérez · 4022001', target: { patientId: 'p1' } })
    const sacarModal = empujarLugar({ label: 'V8 · Juan Pérez', target: { visitId: 'v1' } })
    expect(lugarActual()?.label).toBe('V8 · Juan Pérez')
    sacarModal()
    expect(lugarActual()?.label).toBe('Juan Pérez · 4022001')
    sacarFicha()
    expect(lugarActual()).toBeNull()
  })

  it('un modal sin target hereda el de la pantalla de abajo', () => {
    // El wizard de Recepción no tiene entidad propia hasta que se confirma. Sin herencia, abrirlo
    // BORRARÍA el salto que ya tenía la pantalla: el supervisor perdería el destino por abrir una
    // ventana.
    const sacarLista = empujarLugar({ label: 'LTS17231', target: { protocolId: 'e1' } })
    const sacarWizard = empujarLugar({ label: 'Recepción · paso 2 de 4' })
    expect(lugarActual()).toEqual({ label: 'Recepción · paso 2 de 4', target: { protocolId: 'e1' } })
    sacarWizard()
    sacarLista()
  })

  it('desmontar en desorden saca la entrada correcta', () => {
    // React no garantiza el orden de limpieza entre componentes hermanos, y en StrictMode cada
    // efecto monta y desmonta dos veces. Sacar "el último" a ciegas dejaría la pila mintiendo.
    const sacarA = empujarLugar({ label: 'A' })
    const sacarB = empujarLugar({ label: 'B' })
    sacarA()
    expect(lugarActual()?.label).toBe('B')
    sacarB()
    expect(lugarActual()).toBeNull()
  })

  it('sacar dos veces no rompe ni saca a otro', () => {
    const sacarA = empujarLugar({ label: 'A' })
    const sacarB = empujarLugar({ label: 'B' })
    sacarB()
    sacarB()
    expect(lugarActual()?.label).toBe('A')
    sacarA()
  })
})

describe('armarLugar', () => {
  const base = { moduleName: 'Coordinación', moduleKey: 'track', subName: 'Estudios y pacientes', subKey: 'protocolos' }

  it('con un lugar publicado, lo usa y le suma el módulo y el submódulo', () => {
    expect(armarLugar({ ...base, crumbs: ['LTS17231'], lugar: { label: 'Juan Pérez · 4022001', target: { patientId: 'p1' } } })).toEqual({
      label: 'Coordinación › Estudios y pacientes › Juan Pérez · 4022001',
      target: { moduleKey: 'track', subKey: 'protocolos', patientId: 'p1' },
    })
  })

  it('sin lugar publicado cae a las migas del encabezado, y entonces no hay salto', () => {
    // Es el estado de hoy para las pantallas que no se cablearon: se lee, no se salta.
    expect(armarLugar({ ...base, crumbs: ['LTS17231', 'Juan Pérez'], lugar: null })).toEqual({
      label: 'Coordinación › Estudios y pacientes › LTS17231 › Juan Pérez',
      target: null,
    })
  })

  it('sin lugar y sin migas, el módulo y el submódulo pelados', () => {
    expect(armarLugar({ ...base, crumbs: [], lugar: null })).toEqual({
      label: 'Coordinación › Estudios y pacientes',
      target: null,
    })
  })

  it('un lugar publicado sin target no inventa uno', () => {
    expect(armarLugar({ ...base, crumbs: [], lugar: { label: 'Recepción · paso 2 de 4' } }).target).toBeNull()
  })

  it('descarta las migas vacías', () => {
    // Una vista que registra su encabezado antes de que carguen los datos pone una miga en blanco:
    // sin esto el texto guardado quedaría con un "›" colgando.
    expect(armarLugar({ ...base, crumbs: ['', 'Juan Pérez'], lugar: null }).label)
      .toBe('Coordinación › Estudios y pacientes › Juan Pérez')
  })
})
