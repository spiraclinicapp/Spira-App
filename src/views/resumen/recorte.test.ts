import { describe, expect, it } from 'vitest'
import { recortarGrupos } from './recorte'

/**
 * El recorte de las próximas visitas del Resumen.
 *
 * Falla EN SILENCIO y por aritmética: un off-by-one no rompe la pantalla, sólo deja una visita
 * afuera con el contador del pie diciendo otro número. Nadie cuenta a mano las visitas de la semana
 * para descubrirlo, y lo que se esconde es a quién hay que atender.
 *
 * El caso que más importa es el del grupo cortado al medio: es donde vive el off-by-one, y también
 * donde puede colarse un encabezado de día sin ninguna visita debajo.
 *
 * Sin base y sin navegador: es una función pura.
 */

const g = (date: string, n: number) => ({ date, visits: Array.from({ length: n }, (_, i) => `${date}-${i}`) })
const contar = (grupos: { visits: unknown[] }[]) => grupos.reduce((n, x) => n + x.visits.length, 0)

describe('recortarGrupos', () => {
  it('sin nada que recortar devuelve los grupos tal cual', () => {
    const grupos = [g('lun', 2), g('mar', 1)]
    const r = recortarGrupos(grupos, 3)
    expect(r.restantes).toBe(0)
    expect(r.grupos).toBe(grupos) // la misma referencia: no rearma nada al pedazo
  })

  it('lista vacía: ni grupos ni restantes', () => {
    expect(recortarGrupos([], 3)).toEqual({ grupos: [], restantes: 0 })
  })

  it('corta un grupo al medio en vez de descartarlo entero', () => {
    // Las visitas vienen por fecha: saltear las 5 de mañana para mostrar completas las de pasado
    // mentiría sobre qué es lo próximo.
    const r = recortarGrupos([g('lun', 5), g('mar', 2)], 3)
    expect(contar(r.grupos)).toBe(3)
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0].date).toBe('lun')
    expect(r.restantes).toBe(4)
  })

  it('el corte justo en el borde de un grupo no deja un día vacío', () => {
    // Acá está el bug fácil: con `max` igual al tamaño del primer grupo, una implementación ingenua
    // empuja el segundo grupo con `visits: []` y la tarjeta dibuja un encabezado de día sin nada.
    const r = recortarGrupos([g('lun', 3), g('mar', 4)], 3)
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos.every((x) => x.visits.length > 0)).toBe(true)
    expect(r.restantes).toBe(4)
  })

  it('reparte el cupo entre varios grupos', () => {
    const r = recortarGrupos([g('lun', 1), g('mar', 1), g('mie', 1), g('jue', 5)], 3)
    expect(r.grupos.map((x) => x.date)).toEqual(['lun', 'mar', 'mie'])
    expect(r.restantes).toBe(5)
  })

  it('los restantes siempre cierran con el total', () => {
    // La invariante que hace confiable el número del pie: visibles + restantes = todas.
    const grupos = [g('lun', 2), g('mar', 3), g('mie', 4)]
    for (const max of [0, 1, 2, 3, 4, 5, 8, 9, 20]) {
      const r = recortarGrupos(grupos, max)
      expect(contar(r.grupos) + r.restantes, `max=${max}`).toBe(9)
    }
  })

  it('max 0 esconde todo y lo dice', () => {
    const r = recortarGrupos([g('lun', 2)], 0)
    expect(r.grupos).toEqual([])
    expect(r.restantes).toBe(2)
  })
})
