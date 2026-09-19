import { describe, expect, it } from 'vitest'
import type { EstadoIp, VisitIpStatusRow } from '../../data/visitIp'
import {
  accionesIp, cierreListo, cuentaIp, desenlaceIp, detalleIp, ipHecho, MOTIVOS_NO_CORRESPONDE, motivoAlertaIp, rotuloMotivo,
} from './ipEstado'

/**
 * Lo que la fila del IP le dice y le ofrece a la coordinadora.
 *
 * Se testea porque todo puede quedar al revés sin verse: la fila se dibuja igual de prolija si
 * ofrece "No corresponde" sobre un IP ya entregado, si suma al contador un IP que no correspondía, o
 * si dice "Entregado" sin nombrar a quién lo confirmó. La regla del estado en sí vive en la base
 * (`v_visit_ip_status`, 0119) y se prueba logueado; acá se fija la traducción.
 *
 * Los timestamps van en `+00:00`, que es como los manda PostgREST: un test con `-03:00` ya pasó una
 * vez con la implementación rota (2026-09-08).
 */

const TODOS: EstadoIp[] = ['sin_pedir', 'pedido', 'rechazado', 'entregado', 'entregado_en_otra_visita', 'no_corresponde']

const fila = (over: Partial<VisitIpStatusRow>): VisitIpStatusRow => ({
  visit_id: 'v1', enrollment_id: 'e1', protocol_id: 'p1', sellada: true,
  estado: 'sin_pedir', abierto: true, ancla: null, pedido_at: null, solicitantes: null,
  entregado_dispensation_id: null, entregado_at: null, entregado_por_name: null, entregado_ip_kits: null,
  cierre: null, cierre_motivo: null, cierre_detalle: null, cerrado_por_name: null, cerrado_at: null,
  otra_visita_entregado_at: null, otra_visita_ip_kits: null, otra_visita_code: null, otra_visita_name: null,
  otra_visita_real_date: null,
  ...over,
})

describe('cuentaIp — el contador "n/total realizados"', () => {
  it('"No corresponde" no suma al total: no es un procedimiento que se deba', () => {
    expect(cuentaIp('no_corresponde')).toEqual({ total: 0, hecho: 0 })
  })

  it('las dos entregas cuentan como hechas', () => {
    expect(cuentaIp('entregado')).toEqual({ total: 1, hecho: 1 })
    expect(cuentaIp('entregado_en_otra_visita')).toEqual({ total: 1, hecho: 1 })
  })

  it('pedido, rechazado y sin pedir cuentan como pendientes', () => {
    for (const e of ['sin_pedir', 'pedido', 'rechazado'] as EstadoIp[]) {
      expect(cuentaIp(e)).toEqual({ total: 1, hecho: 0 })
      expect(ipHecho(e)).toBe(false)
    }
  })
})

describe('accionesIp — qué se le ofrece', () => {
  it('en la ficha (sólo lectura) no se ofrece nada, en ningún estado', () => {
    for (const e of TODOS) expect(accionesIp(e, true)).toEqual({ puedeCerrar: false, puedeDeshacer: false })
  })

  it('con un pedido vivo en Farmacia NO se ofrece cerrar: serían dos verdades', () => {
    expect(accionesIp('pedido', false)).toEqual({ puedeCerrar: false, puedeDeshacer: false })
  })

  it('un IP entregado de verdad no se cierra ni se deshace desde acá', () => {
    expect(accionesIp('entregado', false)).toEqual({ puedeCerrar: false, puedeDeshacer: false })
  })

  it('sin pedir y rechazado se pueden cerrar; los dos cierres se pueden deshacer', () => {
    expect(accionesIp('sin_pedir', false).puedeCerrar).toBe(true)
    expect(accionesIp('rechazado', false).puedeCerrar).toBe(true)
    expect(accionesIp('no_corresponde', false).puedeDeshacer).toBe(true)
    expect(accionesIp('entregado_en_otra_visita', false).puedeDeshacer).toBe(true)
  })
})

describe('desenlaceIp — qué pasó con el IP, en una frase (spec 2026-09-19, E1)', () => {
  it('sin pedir: en una visita terminada es un pendiente; en una que no terminó, todavía no', () => {
    expect(desenlaceIp(fila({ estado: 'sin_pedir' }), true)).toBe('Sin entregar: no se pidió a Farmacia.')
    expect(desenlaceIp(fila({ estado: 'sin_pedir' }), false)).toBe('Todavía no se pidió a Farmacia.')
  })

  it('rechazado: lo mismo, con Farmacia como sujeto', () => {
    expect(desenlaceIp(fila({ estado: 'rechazado' }), true)).toBe('Sin entregar: Farmacia rechazó el pedido.')
    expect(desenlaceIp(fila({ estado: 'rechazado' }), false)).toBe('Farmacia rechazó el pedido.')
  })

  it('pedido: con la fecha del pedido si la hay, y sin ella no inventa una', () => {
    // Sin comparar la hora: formatDateTimeAR usa la hora local y el CI corre en UTC.
    const con = desenlaceIp(fila({ estado: 'pedido', pedido_at: '2026-09-17T20:27:00+00:00' }), true)
    expect(con).toMatch(/^Pedido a Farmacia el .+, sin entregar todavía\.$/)
    expect(con).toContain('2026')
    expect(desenlaceIp(fila({ estado: 'pedido' }), true)).toBe('Pedido a Farmacia, sin entregar todavía.')
  })

  it('entregado nombra a quién confirmó y los kits, en singular y plural', () => {
    const uno = desenlaceIp(fila({ estado: 'entregado', entregado_por_name: 'Laura Pérez', entregado_at: '2026-09-12T17:30:00+00:00', entregado_ip_kits: 1 }), true)
    expect(uno).toContain('Entregado por Laura Pérez')
    expect(uno).toContain('· 1 kit.')
    const dos = desenlaceIp(fila({ estado: 'entregado', entregado_por_name: 'Laura Pérez', entregado_ip_kits: 2 }), true)
    expect(dos).toContain('· 2 kits.')
  })

  it('una entrega anterior a la 0119 (sin nombre guardado) no inventa a nadie', () => {
    const d = desenlaceIp(fila({ estado: 'entregado', entregado_at: '2026-08-20T12:00:00+00:00', entregado_ip_kits: 2 }), true)
    expect(d.startsWith('Entregado el ')).toBe(true)
    expect(d).not.toContain(' por ')
  })

  it('entregado en otra visita nombra cuál, y cae a "otra visita" si no tiene código', () => {
    expect(desenlaceIp(fila({ estado: 'entregado_en_otra_visita', otra_visita_code: 'VNP', otra_visita_ip_kits: 1 }), true))
      .toContain('Entregado en VNP')
    expect(desenlaceIp(fila({ estado: 'entregado_en_otra_visita' }), true)).toContain('Entregado en otra visita')
  })

  it('"No corresponde · otro" muestra lo que se contó, no la palabra "Otro"', () => {
    const d = desenlaceIp(fila({ estado: 'no_corresponde', cierre_motivo: 'otro', cierre_detalle: 'Pasó a extensión abierta', cerrado_por_name: 'Ana' }), true)
    expect(d).toBe('No corresponde: Pasó a extensión abierta. Lo marcó Ana.')
  })

  it('"No corresponde" con motivo de lista usa su rótulo', () => {
    expect(desenlaceIp(fila({ estado: 'no_corresponde', cierre_motivo: 'discontinuo_tratamiento' }), true))
      .toBe('No corresponde: Discontinuó el tratamiento.')
  })
})

describe('detalleIp — la segunda línea de la fila', () => {
  it('UNA SOLA VOZ: en todos los estados empieza con la frase de la sección', () => {
    // El candado del spec (E1): si alguien reescribe una de las dos, la fila y la sección vuelven a
    // decir cosas distintas de la misma visita, y en pantalla no se nota.
    for (const e of TODOS) {
      for (const terminada of [true, false]) {
        const row = fila({ estado: e })
        expect(detalleIp(row, terminada).startsWith(desenlaceIp(row, terminada)), `${e} · terminada=${terminada}`).toBe(true)
      }
    }
  })

  it('lo que queda por hacer dice dónde: «carga» en una visita terminada, «pide» en una que no', () => {
    expect(detalleIp(fila({ estado: 'sin_pedir' }), true)).toBe('Sin entregar: no se pidió a Farmacia. Se carga desde Dispensación.')
    expect(detalleIp(fila({ estado: 'sin_pedir' }), false)).toBe('Todavía no se pidió a Farmacia. Se pide desde Dispensación.')
    expect(detalleIp(fila({ estado: 'rechazado' }), true)).toBe('Sin entregar: Farmacia rechazó el pedido. Se carga desde Dispensación.')
    expect(detalleIp(fila({ estado: 'pedido' }), true)).toBe('Pedido a Farmacia, sin entregar todavía. Se marca cuando Farmacia confirma la entrega.')
  })

  it('lo que ya se resolvió no agrega indicación', () => {
    for (const e of ['entregado', 'entregado_en_otra_visita', 'no_corresponde'] as EstadoIp[]) {
      const row = fila({ estado: e })
      expect(detalleIp(row, true)).toBe(desenlaceIp(row, true))
    }
  })

  it('cada estado tiene su texto, sin caer a vacío', () => {
    for (const e of TODOS) {
      for (const terminada of [true, false]) {
        const d = detalleIp(fila({ estado: e }), terminada)
        expect(d.trim(), `${e} sin texto`).not.toBe('')
        expect(d, `${e} filtra un null`).not.toMatch(/undefined|null/)
      }
    }
  })
})

describe('cierreListo — espejo de close_visit_ip', () => {
  it('"No corresponde" pide motivo, y "otro" pide contarlo', () => {
    expect(cierreListo('no_corresponde', null, '', null)).toBe(false)
    expect(cierreListo('no_corresponde', 'retirado_por_sponsor', '', null)).toBe(true)
    expect(cierreListo('no_corresponde', 'otro', '   ', null)).toBe(false)
    expect(cierreListo('no_corresponde', 'otro', 'Extensión abierta', null)).toBe(true)
  })

  it('"Entregado en otra visita" pide elegir la entrega', () => {
    expect(cierreListo('entregado_en_otra_visita', null, '', null)).toBe(false)
    expect(cierreListo('entregado_en_otra_visita', null, '', 'd1')).toBe(true)
  })

  it('sin tipo elegido nunca está listo', () => {
    expect(cierreListo(null, 'otro', 'x', 'd1')).toBe(false)
  })
})

describe('catálogo de motivos', () => {
  it('son los tres que acepta el check de la 0119, sin claves repetidas', () => {
    const claves = MOTIVOS_NO_CORRESPONDE.map((m) => m.value)
    expect(new Set(claves).size).toBe(claves.length)
    expect([...claves].sort()).toEqual(['discontinuo_tratamiento', 'otro', 'retirado_por_sponsor'])
    expect(rotuloMotivo(null)).toBe('Sin motivo')
  })

  it('la alerta dice qué le pasa al IP en los tres estados abiertos', () => {
    expect(motivoAlertaIp('sin_pedir')).toBe('IP sin pedir')
    expect(motivoAlertaIp('pedido')).toBe('IP pedido, sin entregar')
    expect(motivoAlertaIp('rechazado')).toBe('IP rechazado por Farmacia')
  })
})
