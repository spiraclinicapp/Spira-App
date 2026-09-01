import { describe, expect, it } from 'vitest'
import type { VisitStatus } from '../data/visits'
import { GRAVEDAD, SEVERIDAD_TINTA, severidadMaxima } from './alertSeverity'

/**
 * La severidad que muestra la cabecera de la tarjeta de Alertas.
 *
 * ES LA REGLA MÁS PELIGROSA DE ESTE REDISEÑO, y por eso es la que más casos tiene. Su modo de falla
 * es el peor posible: si la comparación queda al revés, la tarjeta se pinta ÁMBAR habiendo una
 * ventana vencida. No hay error, no hay pantalla rota, no hay nada raro que mirar — la card se ve
 * impecable y subestima un desvío clínico en la primera pantalla que abre quien coordina.
 *
 * Un test de dos líneas contra eso es barato; descubrirlo en producción, no.
 *
 * Sin base y sin navegador: es una función pura.
 */

const alerta = (s: VisitStatus) => ({ computed_status: s })

describe('severidadMaxima', () => {
  it('sin alertas devuelve null (cabecera neutra, no roja)', () => {
    expect(severidadMaxima([])).toBeNull()
  })

  it('sólo pendientes vencidos → ámbar', () => {
    expect(severidadMaxima([alerta('item_vencido'), alerta('item_vencido')])).toBe('item_vencido')
  })

  it('sólo ventanas vencidas → roja', () => {
    expect(severidadMaxima([alerta('ventana_vencida')])).toBe('ventana_vencida')
  })

  it('mezcla → manda la ventana vencida, esté donde esté en la lista', () => {
    // Las dos posiciones importan: una implementación que mire sólo la primera fila pasa una y falla
    // la otra, y la lista viene ordenada por fecha, no por gravedad.
    expect(severidadMaxima([alerta('ventana_vencida'), alerta('item_vencido')])).toBe('ventana_vencida')
    expect(severidadMaxima([alerta('item_vencido'), alerta('ventana_vencida')])).toBe('ventana_vencida')
    expect(
      severidadMaxima([alerta('item_vencido'), alerta('item_vencido'), alerta('ventana_vencida')]),
    ).toBe('ventana_vencida')
  })

  it('ignora estados que no son de alerta en vez de teñir mal', () => {
    // `useActiveAlerts` filtra por los dos estados de alerta, así que esto no debería llegar. Si
    // algún día llega —un estado nuevo del enum, una consulta que cambie— preferimos cabecera
    // neutra antes que una gravedad inventada.
    expect(severidadMaxima([alerta('completa'), alerta('proxima')])).toBeNull()
    expect(severidadMaxima([alerta('realizada'), alerta('item_vencido')])).toBe('item_vencido')
  })

  it('el orden de GRAVEDAD va de la más grave a la menos', () => {
    // Fija la invariante de la que depende el `for` de la implementación: si alguien agrega un
    // estado nuevo al principio de la lista sin pensarlo, este test le avisa que acaba de cambiar
    // qué gana.
    expect(GRAVEDAD[0]).toBe('ventana_vencida')
    expect(GRAVEDAD[GRAVEDAD.length - 1]).toBe('item_vencido')
  })
})

describe('SEVERIDAD_TINTA', () => {
  it('tiene tinta para todas las severidades que GRAVEDAD declara', () => {
    for (const nivel of GRAVEDAD) {
      expect(SEVERIDAD_TINTA[nivel], `falta la tinta de "${nivel}"`).toBeDefined()
    }
  })

  it('son tokens y nunca un hex crudo', () => {
    /* El hex del ámbar de `VISIT_STATES` (#B0823F) es correcto como FONDO y no llega a 4,5:1 como
       TEXTO; y ningún hex crudo se aclara en tema oscuro. Si alguien copia el color del chip acá,
       este test lo caza. */
    for (const nivel of GRAVEDAD) {
      expect(SEVERIDAD_TINTA[nivel]).toMatch(/^var\(--spira-acc-deep-[a-z]+\)$/)
    }
  })
})
