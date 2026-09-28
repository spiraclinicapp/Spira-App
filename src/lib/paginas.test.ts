import { describe, expect, it } from 'vitest'
import { todasLasPaginas } from './paginas'
import type { Pagina } from './paginas'

/*
 * `todasLasPaginas` falla en SILENCIO si se equivoca: una página de menos no da error, da una lista
 * más corta con 200 OK — que es exactamente el bug que vino a arreglar (1.060 visitas, llegaban
 * 1.000). Estos casos fijan que llegue TODO, en orden y sin repetir, con el `max-rows` que sea; y
 * que la segunda página salga SIN esperar a la primera, que es lo que hace que la lista no tarde lo
 * que las dos sumadas (medido en prod con `v0.93.2`).
 *
 * El servidor de mentira corta cada pedido en `maxRows`, igual que PostgREST, cuenta los pedidos y
 * cuántos llegan a estar en vuelo a la vez.
 */
function servidor(total: number, maxRows: number, { sinTotal = false, fallaDesde = -1 } = {}) {
  const filas = Array.from({ length: total }, (_, i) => i)
  const pedidos: Array<[number, number, boolean]> = []
  let enVuelo = 0
  let maxEnVuelo = 0
  const pedir = (desde: number, hasta: number, conTotal: boolean): Promise<Pagina<number, string>> => {
    pedidos.push([desde, hasta, conTotal])
    enVuelo++
    maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
    return new Promise((resolve) => setTimeout(() => {
      enVuelo--
      if (desde === fallaDesde) return resolve({ data: null, error: 'se cayó' })
      const tope = Math.min(hasta + 1, desde + maxRows)
      resolve({ data: filas.slice(desde, tope), error: null, count: conTotal && !sinTotal ? total : null })
    }, 5))
  }
  return { filas, pedidos, pedir, maxEnVuelo: () => maxEnVuelo }
}

const desdes = (pedidos: Array<[number, number, boolean]>) => pedidos.map(([d]) => d)

/*
 * Como los builders de supabase-js: el pedido NO sale al llamar a `pedir`, sale cada vez que alguien
 * llama a `.then` — y sale OTRA VEZ con cada `.then`. El servidor de arriba devuelve promesas comunes
 * y por eso no vio el error de la #337: la página adelantada se esperaba dos veces (una para atajar su
 * rechazo, otra para usarla) y en prod salía dos veces, la segunda DETRÁS de la primera página, que era
 * justo lo que había que evitar (verificado con el `fetch` interceptado: tres pedidos, `offset=1000`
 * repetido). Acá se cuentan las salidas reales a la red.
 */
function servidorPerezoso(total: number, maxRows: number) {
  const filas = Array.from({ length: total }, (_, i) => i)
  const salidas: number[] = []
  const pedir = (desde: number, hasta: number, conTotal: boolean): PromiseLike<Pagina<number, string>> => ({
    then(onOk, onError) {
      salidas.push(desde)
      const tope = Math.min(hasta + 1, desde + maxRows)
      return Promise.resolve({ data: filas.slice(desde, tope), error: null, count: conTotal ? total : null }).then(onOk, onError)
    },
  })
  return { filas, salidas, pedir }
}

describe('todasLasPaginas', () => {
  it('el caso real: 1.060 visitas con max-rows 1.000 → llegan las 1.060, en orden', async () => {
    const s = servidor(1060, 1000)
    const r = await todasLasPaginas(s.pedir)
    expect(r).toEqual({ data: s.filas, error: null })
    expect(s.pedidos).toEqual([[0, 999, true], [1000, 1999, false]])
  })

  it('la segunda página sale SIN esperar a la primera (las dos en vuelo a la vez)', async () => {
    const s = servidor(1060, 1000)
    await todasLasPaginas(s.pedir)
    expect(s.maxEnVuelo()).toBe(2)
  })

  it('con más de dos páginas, las siguientes salen juntas cuando llega el total', async () => {
    const s = servidor(3500, 1000)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(desdes(s.pedidos)).toEqual([0, 1000, 2000, 3000])
  })

  it('con menos filas que el límite, llega todo; la segunda adelantada vuelve vacía y no molesta', async () => {
    const s = servidor(40, 1000)
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: s.filas, error: null })
    expect(desdes(s.pedidos)).toEqual([0, 1000])
  })

  it('justo el límite: no pide nada más allá de la adelantada', async () => {
    const s = servidor(1000, 1000)
    expect((await todasLasPaginas(s.pedir)).data).toEqual(s.filas)
    expect(desdes(s.pedidos)).toEqual([0, 1000])
  })

  it('si max-rows es MÁS CHICO que la página pedida, descarta la adelantada y no saltea ni repite nada', async () => {
    const s = servidor(1060, 500)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    // 0 y la adelantada (1000, descartada: pidió desde donde no seguía); después de a 500.
    expect(desdes(s.pedidos)).toEqual([0, 1000, 500, 1000])
  })

  it('sin filas: lista vacía, no error', async () => {
    const s = servidor(0, 1000)
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: [], error: null })
  })

  it('un error en CUALQUIER página que hace falta es error de la consulta entera, no una lista más corta', async () => {
    const s = servidor(2500, 1000, { fallaDesde: 2000 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: null, error: 'se cayó' })
  })

  it('un error en la primera página también', async () => {
    const s = servidor(10, 1000, { fallaDesde: 0 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: null, error: 'se cayó' })
  })

  it('un error en la adelantada, cuando hacía falta, es error', async () => {
    const s = servidor(1060, 1000, { fallaDesde: 1000 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: null, error: 'se cayó' })
  })

  it('un error en la adelantada, cuando NO hacía falta, se ignora', async () => {
    const s = servidor(40, 1000, { fallaDesde: 1000 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: s.filas, error: null })
  })

  it('sin total, sigue de a una hasta una página vacía', async () => {
    const s = servidor(2100, 1000, { sinTotal: true })
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(desdes(s.pedidos)).toEqual([0, 1000, 2000, 2100])
  })

  it('con pedidos perezosos (supabase-js), cada página sale a la red UNA sola vez', async () => {
    const s = servidorPerezoso(1060, 1000)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(s.salidas).toEqual([0, 1000])
  })

  it('con pedidos perezosos y la adelantada descartada, tampoco se repite nada', async () => {
    const s = servidorPerezoso(1060, 500)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(s.salidas).toEqual([0, 1000, 500, 1000])
  })

  it('sin total, si la segunda viene corta era la última: no pide otra', async () => {
    const s = servidor(1500, 1000, { sinTotal: true })
    expect((await todasLasPaginas(s.pedir)).data).toEqual(s.filas)
    expect(desdes(s.pedidos)).toEqual([0, 1000])
  })
})
