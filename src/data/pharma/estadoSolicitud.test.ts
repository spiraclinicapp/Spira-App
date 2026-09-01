import { describe, expect, it } from 'vitest'
import { ESTADO_SOLICITUD, ESTADOS_ABIERTOS } from './dispensationModel'
import type { RequestStatus } from './dispensationModel'

/**
 * El rótulo y el color del estado de una solicitud, tal como aparecen en la línea de texto de la
 * tarjeta "Dispensaciones solicitadas" del Resumen de Coordinación.
 *
 * DOS FALLAS SILENCIOSAS, las dos cubiertas acá:
 *
 * 1. **Una clave faltante.** El día que el enum de la base gane un sexto estado, un mapa incompleto
 *    no tira error: `ESTADO_SOLICITUD[nuevo]` rinde `undefined`, el rótulo sale vacío y el texto
 *    sin color. La pantalla se ve bien y le falta una palabra. `EXHAUSTIVO` de abajo hace que eso
 *    rompa la COMPILACIÓN, que es donde tiene que romper.
 *
 * 2. **Un hex crudo en vez de un token.** Es el gotcha que ya pasó en esta app: sólo la familia
 *    `--spira-acc-deep-*` tiene versión aclarada para el tema oscuro. Un `#3A6B8C` escrito a mano
 *    se ve perfecto en tema claro y queda casi invisible en oscuro — y nadie lo nota, porque quien
 *    escribe el color suele estar mirando el tema claro.
 *
 * Sin base y sin navegador: son constantes.
 */

/* Fuerza la exhaustividad en tiempo de compilación: si el enum gana un estado y no se agrega acá,
   este objeto deja de satisfacer el Record y `tsc` falla. Es el guard de verdad; el `it` de abajo
   sólo lo hace visible al correr la suite. */
const EXHAUSTIVO: Record<RequestStatus, true> = {
  solicitada: true,
  preparando: true,
  atendida: true,
  rechazada: true,
  cancelada: true,
}
const TODOS = Object.keys(EXHAUSTIVO) as RequestStatus[]

describe('ESTADO_SOLICITUD', () => {
  it('cubre los cinco estados de una solicitud', () => {
    for (const estado of TODOS) {
      expect(ESTADO_SOLICITUD[estado], `falta el estado "${estado}"`).toBeDefined()
    }
    expect(Object.keys(ESTADO_SOLICITUD).sort()).toEqual([...TODOS].sort())
  })

  it('todos tienen rótulo en castellano, no vacío', () => {
    for (const estado of TODOS) {
      expect(ESTADO_SOLICITUD[estado].label.trim()).not.toBe('')
    }
  })

  it('todos los tonos son tokens, nunca un hex crudo', () => {
    // Un hex acá se vería bien en claro y desaparecería en oscuro: los `--spira-acc-deep-*` son los
    // únicos acentos con variante aclarada para el tema oscuro.
    for (const estado of TODOS) {
      const tono = ESTADO_SOLICITUD[estado].tono
      expect(tono, `"${estado}" usa un color literal en vez de un token`).toMatch(
        /^var\(--spira-[a-z-]+\)$/,
      )
      expect(tono).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })

  it('los estados abiertos son exactamente los dos que la coordinadora está esperando', () => {
    // Si acá entrara `atendida`, el Resumen listaría pedidos ya resueltos como si faltara algo.
    expect([...ESTADOS_ABIERTOS].sort()).toEqual(['preparando', 'solicitada'])
    for (const estado of ESTADOS_ABIERTOS) {
      expect(ESTADO_SOLICITUD[estado]).toBeDefined()
    }
  })
})
