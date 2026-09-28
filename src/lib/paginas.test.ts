import { describe, expect, it } from 'vitest'
import { todasLasPaginas } from './paginas'
import type { Pagina } from './paginas'

/*
 * `todasLasPaginas` falla en SILENCIO si se equivoca: una página de menos no da error, da una lista
 * más corta con 200 OK — que es exactamente el bug que vino a arreglar (1.060 visitas, llegaban
 * 1.000). Estos casos fijan que llegue TODO, en orden, con el `max-rows` que sea.
 *
 * El servidor de mentira corta cada pedido en `maxRows`, igual que PostgREST, y cuenta los pedidos.
 */
function servidor(total: number, maxRows: number, { sinTotal = false, fallaDesde = -1 } = {}) {
  const filas = Array.from({ length: total }, (_, i) => i)
  const pedidos: Array<[number, number, boolean]> = []
  const pedir = async (desde: number, hasta: number, conTotal: boolean): Promise<Pagina<number, string>> => {
    pedidos.push([desde, hasta, conTotal])
    if (desde === fallaDesde) return { data: null, error: 'se cayó' }
    const tope = Math.min(hasta + 1, desde + maxRows)
    return { data: filas.slice(desde, tope), error: null, count: conTotal && !sinTotal ? total : null }
  }
  return { filas, pedidos, pedir }
}

describe('todasLasPaginas', () => {
  it('con menos filas que el límite, un solo pedido', async () => {
    const s = servidor(40, 1000)
    const r = await todasLasPaginas(s.pedir)
    expect(r).toEqual({ data: s.filas, error: null })
    expect(s.pedidos).toHaveLength(1)
  })

  it('el caso real: 1.060 visitas con max-rows 1.000 → llegan las 1.060, en orden', async () => {
    const s = servidor(1060, 1000)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(s.pedidos).toEqual([[0, 999, true], [1000, 1999, false]])
  })

  it('si max-rows es MÁS CHICO que la página pedida, avanza de a lo que llegó y no saltea nada', async () => {
    const s = servidor(1060, 500)
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(s.pedidos.map(([d]) => d)).toEqual([0, 500, 1000])
  })

  it('justo el límite: no pide una página de más', async () => {
    const s = servidor(1000, 1000)
    await todasLasPaginas(s.pedir)
    expect(s.pedidos).toHaveLength(1)
  })

  it('sin filas: lista vacía, no error', async () => {
    const s = servidor(0, 1000)
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: [], error: null })
  })

  it('un error en CUALQUIER página es error de la consulta entera, no una lista más corta', async () => {
    const s = servidor(2500, 1000, { fallaDesde: 2000 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: null, error: 'se cayó' })
  })

  it('un error en la primera página también', async () => {
    const s = servidor(10, 1000, { fallaDesde: 0 })
    expect(await todasLasPaginas(s.pedir)).toEqual({ data: null, error: 'se cayó' })
  })

  it('sin total, sigue de a una hasta una página vacía', async () => {
    const s = servidor(2100, 1000, { sinTotal: true })
    const r = await todasLasPaginas(s.pedir)
    expect(r.data).toEqual(s.filas)
    expect(s.pedidos.map(([d]) => d)).toEqual([0, 1000, 2000, 2100])
  })
})
