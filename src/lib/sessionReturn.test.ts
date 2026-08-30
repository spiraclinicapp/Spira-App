import { beforeEach, describe, expect, it } from 'vitest'
import { crearRegresoStore } from './sessionReturn'

/* El rastro que deja una sesión caída.
 *
 * Se testea porque las dos formas de romperlo son mudas. Si el destino NO se consume al leerlo,
 * queda esperando y te muda de pantalla en un ingreso posterior que no tiene nada que ver — el
 * "teletransporte fantasma", que en una app clínica significa abrir la ficha de un paciente que
 * nadie pidió. Y si se guarda una ruta inválida, el premio por volver a ingresar es la pantalla de
 * "esa dirección no existe". Ninguna de las dos rompe nada al escribirlas: se ven perfectas.
 */

function storageFalso(): Storage {
  const datos = new Map<string, string>()
  return {
    get length() {
      return datos.size
    },
    clear: () => datos.clear(),
    getItem: (k: string) => datos.get(k) ?? null,
    key: (i: number) => [...datos.keys()][i] ?? null,
    removeItem: (k: string) => {
      datos.delete(k)
    },
    setItem: (k: string, v: string) => {
      datos.set(k, v)
    },
  }
}

/** El modo privado de Safari: tocar sessionStorage lanza. La app no puede caerse por eso. */
function storageQueLanza(): Storage {
  const explotar = (): never => {
    throw new Error('SecurityError')
  }
  return {
    get length(): number {
      return explotar()
    },
    clear: explotar,
    getItem: explotar,
    key: explotar,
    removeItem: explotar,
    setItem: explotar,
  }
}

let store: ReturnType<typeof crearRegresoStore>

beforeEach(() => {
  store = crearRegresoStore(storageFalso())
})

describe('marca de sesión', () => {
  it('arranca sin marca', () => {
    expect(store.huboSesion()).toBe(false)
  })

  it('marcada, sobrevive a la lectura (no se consume: un F5 más y sigue siendo cierto)', () => {
    store.marcarSesion()
    expect(store.huboSesion()).toBe(true)
    expect(store.huboSesion()).toBe(true)
  })
})

describe('guardarDestino', () => {
  it('guarda una ruta profunda con su query', () => {
    store.guardarDestino('/coordinacion/pacientes/EFC18244/032000150088?tab=visitas')
    expect(store.tomarDestino()).toEqual({
      moduleKey: 'track',
      subKey: 'protocolos',
      path: ['EFC18244', '032000150088'],
      query: { tab: 'visitas' },
    })
  })

  it('NO guarda la raíz: no hay nada que reponer', () => {
    store.guardarDestino('/')
    expect(store.tomarDestino()).toBeNull()
  })

  it('NO guarda una ruta que no existe', () => {
    store.guardarDestino('/inventado/cualquiera')
    expect(store.tomarDestino()).toBeNull()
  })

  it('NO guarda el vocabulario interno (que la app nunca emite y el parser rechaza)', () => {
    store.guardarDestino('/track/protocolos')
    expect(store.tomarDestino()).toBeNull()
  })
})

describe('tomarDestino', () => {
  it('se CONSUME: el ingreso siguiente ya no te muda de pantalla', () => {
    store.guardarDestino('/farmacia/stock/ambulatoria')
    expect(store.tomarDestino()).not.toBeNull()
    expect(store.tomarDestino()).toBeNull()
  })

  it('sin nada guardado, devuelve null (se cae a Inicio)', () => {
    expect(store.tomarDestino()).toBeNull()
  })
})

describe('limpiar', () => {
  it('la salida voluntaria no le deja nada al que venga después', () => {
    store.marcarSesion()
    store.guardarDestino('/coordinacion/pacientes/EFC18244/032000150088')
    store.limpiar()
    expect(store.huboSesion()).toBe(false)
    expect(store.tomarDestino()).toBeNull()
  })
})

describe('sin storage disponible', () => {
  it('inerte (node, sin DOM): no lanza y no recuerda nada', () => {
    const sin = crearRegresoStore(null)
    expect(() => sin.marcarSesion()).not.toThrow()
    expect(() => sin.guardarDestino('/farmacia/stock')).not.toThrow()
    expect(sin.huboSesion()).toBe(false)
    expect(sin.tomarDestino()).toBeNull()
  })

  it('si el navegador lo prohíbe, la app sigue entrando igual', () => {
    const roto = crearRegresoStore(storageQueLanza())
    expect(() => roto.marcarSesion()).not.toThrow()
    expect(() => roto.guardarDestino('/farmacia/stock')).not.toThrow()
    expect(() => roto.limpiar()).not.toThrow()
    expect(roto.huboSesion()).toBe(false)
    expect(roto.tomarDestino()).toBeNull()
  })
})
