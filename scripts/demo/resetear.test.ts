/**
 * El reset es el script más peligroso del demo: vacía `public` y borra las cuentas. Si corriera contra una base
 * que no es el demo, sería el peor escenario del plan. El cerrojo 1 (lista blanca) lo pone `conectarDemo`; acá
 * se fija el 2: sin la centinela del demo PRESENTE no se toca nada — ni siquiera una base vacía.
 */
import { describe, expect, it } from 'vitest'
import { GuardiaError } from './guardia.mjs'
import { resetear } from './resetear.mjs'

/** Un "cliente" que registra todo lo que se le pide ejecutar y devuelve la fila de la centinela que se le diga. */
function falso(fila: { centinela: boolean; con_datos: boolean }) {
  const ejecutado: string[] = []
  return {
    ejecutado,
    db: {
      cfg: { url: 'https://x.supabase.co', secretKey: 'sb_secret_x' },
      cliente: { query: async (sql: string) => { ejecutado.push(sql); return { rows: [] } } },
      consultar: async () => [fila],
    },
  }
}

describe('resetear', () => {
  it('CRÍTICO · base con datos y sin centinela (prod u otro proyecto) → aborta sin ejecutar nada', async () => {
    const { db, ejecutado } = falso({ centinela: false, con_datos: true })
    await expect(resetear(db as never, { log: () => {} })).rejects.toThrow(GuardiaError)
    expect(ejecutado).toEqual([])
  })
  it('base vacía sin centinela → tampoco se resetea (se migra con demo:migrar)', async () => {
    const { db, ejecutado } = falso({ centinela: false, con_datos: false })
    await expect(resetear(db as never, { log: () => {} })).rejects.toThrow(/demo:migrar/)
    expect(ejecutado).toEqual([])
  })
})
