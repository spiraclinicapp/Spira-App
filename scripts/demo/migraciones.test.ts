/**
 * Elegir qué migraciones faltan falla en silencio de la peor manera: si se saltea una, el demo queda con un
 * schema distinto al de prod y los tutoriales muestran una app que no existe. Estos casos fijan que el orden
 * es el de los archivos y que cualquier estado raro se frena en vez de adivinarse.
 */
import { describe, expect, it } from 'vitest'
import { ordenarMigraciones, pendientes } from './migraciones.mjs'

const M = (n: number) => `${String(n).padStart(4, '0')}_m${n}.sql`

describe('ordenarMigraciones', () => {
  it('ordena y descarta lo que no es una migración', () => {
    expect(ordenarMigraciones([M(2), 'README.md', M(1), '_borrar.sql'])).toEqual([M(1), M(2)])
  })
  it('un hueco o un número repetido en el repo → error', () => {
    expect(() => ordenarMigraciones([M(1), M(3)])).toThrow(/esperaba 0002/)
    expect(() => ordenarMigraciones([M(1), '0001_otra.sql'])).toThrow(/Numeración/)
  })
  it('las del repo real están contiguas', async () => {
    const { readdirSync } = await import('node:fs')
    const archivos = ordenarMigraciones(readdirSync('supabase/migrations'))
    expect(archivos.length).toBeGreaterThan(150)
  })
})

describe('pendientes', () => {
  const todas = [M(1), M(2), M(3)]
  it('base nueva → todas; al día → ninguna; atrasada → las que siguen, en orden', () => {
    expect(pendientes(todas, [])).toEqual(todas)
    expect(pendientes(todas, todas)).toEqual([])
    expect(pendientes(todas, [M(1)])).toEqual([M(2), M(3)])
  })
  it('una aplicada que ya no está en el repo → frena y manda a resetear', () => {
    expect(() => pendientes(todas, [M(1), '0002_vieja.sql'])).toThrow(/demo:resetear/)
  })
  it('un hueco (falta una pero hay posteriores aplicadas) → frena, no la aplica fuera de orden', () => {
    expect(() => pendientes(todas, [M(1), M(3)])).toThrow(/hueco/)
  })
})
