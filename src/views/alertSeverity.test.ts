import { describe, expect, it } from 'vitest'
import type { VisitStatus } from '../data/visits'
import { GRAVEDAD, SEVERIDAD_ICONO, SEVERIDAD_TINTA, severidadMaxima } from './alertSeverity'

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

  /* ── El grado nuevo (0107) ───────────────────────────────────────────────────────────────────
     "No vino" entró como tercera clase y NO al final: va entre la ventana vencida y el reporte
     fuera de plazo. Es una decisión (D4 del plan) y su modo de falla es mudo — un orden mal puesto
     tiñe la cabecera con la gravedad equivocada y la pantalla se ve perfecta. */
  it('sólo "no vino" → su propio grado, no null', () => {
    expect(severidadMaxima([alerta('por_reprogramar')])).toBe('por_reprogramar')
  })

  it('la ventana vencida le gana a "no vino"', () => {
    expect(severidadMaxima([alerta('por_reprogramar'), alerta('ventana_vencida')])).toBe('ventana_vencida')
    expect(severidadMaxima([alerta('ventana_vencida'), alerta('por_reprogramar')])).toBe('ventana_vencida')
  })

  it('"no vino" le gana al reporte fuera de plazo', () => {
    // Una visita del protocolo que NO ocurrió pesa más que un dato sin cargar sobre una que sí.
    expect(severidadMaxima([alerta('item_vencido'), alerta('por_reprogramar')])).toBe('por_reprogramar')
    expect(severidadMaxima([alerta('por_reprogramar'), alerta('item_vencido')])).toBe('por_reprogramar')
  })

  it('las tres juntas → manda la ventana vencida', () => {
    expect(
      severidadMaxima([alerta('item_vencido'), alerta('por_reprogramar'), alerta('ventana_vencida')]),
    ).toBe('ventana_vencida')
  })

  it('ignora estados que no son de alerta en vez de teñir mal', () => {
    // `useActiveAlerts` filtra por los TRES estados de alerta, así que esto no debería llegar. Si
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
    // Y el del medio, que es el que se agregó: fija la D4 contra un reordenamiento distraído.
    expect([...GRAVEDAD]).toEqual(['ventana_vencida', 'por_reprogramar', 'item_vencido'])
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

describe('SEVERIDAD_ICONO', () => {
  it('tiene ícono para todas las severidades que GRAVEDAD declara', () => {
    // Lo mismo que se le pide a la tinta: un grado nuevo sin ícono rompería en la lectura
    // (`CLASES[...].icono` sería undefined) y no al compilar, porque el Record se completa solo si
    // alguien se acuerda. Que no dependa de acordarse.
    for (const nivel of GRAVEDAD) {
      expect(SEVERIDAD_ICONO[nivel], `falta el ícono de "${nivel}"`).toBeDefined()
    }
  })

  it('cada severidad tiene un ícono DISTINTO', () => {
    /* Es la razón de existir de esta tabla. `TrackAlertsView` resolvía por dos vías —ventana
       vencida o "clock" para todo lo demás—, así que "no vino" y "pendiente vencido" compartían
       glifo y la lista no los distinguía. El tipo no puede impedir eso: dos claves con el mismo
       valor compilan perfecto. */
    const iconos = GRAVEDAD.map((n) => SEVERIDAD_ICONO[n])
    expect(new Set(iconos).size).toBe(GRAVEDAD.length)
  })

  it('"no vino" no usa la campana', () => {
    /* Fija la decisión: `bell` es el marco del desplegable de notificaciones, así que adentro de
       ese panel no distingue nada. Si alguien lo devuelve al valor que tenía `AlertCardHeader`,
       este test le cuenta por qué se cambió. */
    expect(SEVERIDAD_ICONO.por_reprogramar).not.toBe('bell')
    expect(SEVERIDAD_ICONO.por_reprogramar).toBe('calendar')
  })
})
