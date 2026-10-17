import { describe, expect, it } from 'vitest'
import type { DetalleDelSync, SchedulePlan } from '../../data/visitDefinitions'
import { avisoFueraDeVentana, gruposDelDetalle, lineasDelPlan, planSinCambios, textoDelRenglon } from './sincronizar'

/**
 * Las líneas del preview del sync del cronograma (0163).
 *
 * POR QUÉ ESTAS FUNCIONES: son lo único del modal que puede fallar en silencio. Si «nada que aplicar» se
 * calcula sin las ventanas, un cambio de tamaño de ventana queda con «Aplicar» apagado y la pantalla dice
 * «al día»; si el front llega antes que la migración, una clave que falta se pinta como «undefined».
 */

/** Un plan de la 0163 sin nada; cada caso pisa lo suyo. */
function plan(over: Partial<SchedulePlan> = {}): SchedulePlan {
  return {
    creates: 0, moves: 0, deletes: 0, attended_divergent: 0, applied: false,
    fechas: 0, respetadas: 0, con_marcas: 0, fuera_de_ventana: [],
    ...over,
  }
}
const textos = (p: SchedulePlan) => lineasDelPlan(p).map((l) => `${l.n} ${l.texto}`)

describe('planSinCambios', () => {
  it('sin crear, mover ni borrar: al día', () => {
    expect(planSinCambios(plan())).toBe(true)
  })
  it('un cambio sólo de ventana (moves sin fechas) deja «Aplicar» habilitado', () => {
    expect(planSinCambios(plan({ moves: 4, fechas: 0 }))).toBe(false)
  })
  it('las fechas conservadas solas no son un cambio', () => {
    expect(planSinCambios(plan({ respetadas: 3, con_marcas: 1 }))).toBe(true)
  })
})

describe('lineasDelPlan', () => {
  it('al día y sin nada conservado: ninguna línea (el modal dice «ya está al día»)', () => {
    expect(lineasDelPlan(plan())).toEqual([])
  })

  it('al día con fechas conservadas: sólo las de «conservan», para que no parezca un olvido', () => {
    expect(textos(plan({ respetadas: 3, con_marcas: 1 }))).toEqual([
      '3 conservan la fecha que se les dio a mano',
      '1 conserva su fecha porque ya tiene algo marcado',
    ])
  })

  it('con cambios: crear, fechas, ventanas, conservan y borrar, en ese orden', () => {
    expect(textos(plan({ creates: 2, moves: 9, fechas: 5, respetadas: 3, con_marcas: 1 }))).toEqual([
      '2 visitas a crear',
      '5 cambian de fecha (no atendidas)',
      '4 sólo ajustan su ventana',
      '3 conservan la fecha que se les dio a mano',
      '1 conserva su fecha porque ya tiene algo marcado',
      '0 visitas a borrar (no atendidas)',
    ])
  })

  it('crear, fechas y borrar salen siempre; ventanas y conservan, sólo si hay', () => {
    expect(lineasDelPlan(plan({ creates: 1 })).map((l) => l.clave)).toEqual(['crear', 'fechas', 'borrar'])
  })

  it('en singular', () => {
    expect(textos(plan({ creates: 1, moves: 2, fechas: 1, deletes: 1, respetadas: 1 }))).toEqual([
      '1 visita a crear',
      '1 cambia de fecha (no atendida)',
      '1 sólo ajusta su ventana',
      '1 conserva la fecha que se le dio a mano',
      '1 visita a borrar (no atendida)',
    ])
  })

  it('sin la 0163 (la respuesta no trae `fechas`): las tres líneas de antes, sin «undefined»', () => {
    const viejo: SchedulePlan = { creates: 2, moves: 3, deletes: 0, attended_divergent: 0, applied: false }
    expect(textos(viejo)).toEqual(['2 visitas a crear', '3 visitas a mover (no atendidas)', '0 visitas a borrar (no atendidas)'])
  })
})

describe('avisoFueraDeVentana', () => {
  it('ninguna, o una respuesta sin la clave: sin aviso', () => {
    expect(avisoFueraDeVentana(plan())).toBeNull()
    expect(avisoFueraDeVentana({ creates: 0, moves: 0, deletes: 0, attended_divergent: 0, applied: false })).toBeNull()
  })
  it('una y varias', () => {
    expect(avisoFueraDeVentana(plan({ fuera_de_ventana: ['a'] }))).toBe('1 de las que conservan su fecha queda fuera de su ventana nueva')
    expect(avisoFueraDeVentana(plan({ fuera_de_ventana: ['a', 'b'] }))).toBe('2 de las que conservan su fecha quedan fuera de su ventana nueva')
  })
})

/** Un renglón del detalle (0164); cada caso pisa lo suyo. */
function renglon(over: Partial<DetalleDelSync> = {}): DetalleDelSync {
  return {
    grupo: 'fecha', visita_id: 'v1', inscripcion_id: 'i1', visita: 'V5 W12',
    fecha: '2026-10-20', fecha_nueva: '2026-10-27', motivo: null, fuera_de_ventana: false,
    ...over,
  }
}

describe('gruposDelDetalle', () => {
  it('crea, fecha, conserva y ventana, en ese orden, sólo los que tienen renglones', () => {
    const detalle = [
      renglon({ grupo: 'ventana', visita_id: 'v4', fecha_nueva: null }),
      renglon({ grupo: 'conserva', visita_id: 'v3', fecha_nueva: null, motivo: 'a_mano' }),
      renglon({ grupo: 'crea', visita_id: null, fecha: null }),
    ]
    expect(gruposDelDetalle(detalle).map((g) => g.grupo)).toEqual(['crea', 'conserva', 'ventana'])
  })

  it('los renglones de cada grupo quedan en el orden en que los manda el servidor', () => {
    const detalle = [renglon({ visita_id: 'b' }), renglon({ grupo: 'crea', visita_id: null }), renglon({ visita_id: 'a' })]
    expect(gruposDelDetalle(detalle).find((g) => g.grupo === 'fecha')?.filas.map((d) => d.visita_id)).toEqual(['b', 'a'])
  })

  it('el título del grupo, en singular y en plural', () => {
    const uno = gruposDelDetalle([renglon({ grupo: 'conserva', motivo: 'a_mano' })])
    const dos = gruposDelDetalle([renglon(), renglon({ visita_id: 'v2' })])
    expect(uno[0].titulo).toBe('conserva su fecha')
    expect(dos[0].titulo).toBe('cambian de fecha (no atendidas)')
  })

  it('sin detalle, sin grupos', () => {
    expect(gruposDelDetalle([])).toEqual([])
  })
})

describe('textoDelRenglon', () => {
  it('cambia de fecha: la de hoy → la nueva', () => {
    expect(textoDelRenglon(renglon()).texto).toBe('20 oct → 27 oct')
  })

  it('se crea: la fecha que va a tener', () => {
    expect(textoDelRenglon(renglon({ grupo: 'crea', visita_id: null, fecha: null, fecha_nueva: '2026-11-12' })).texto).toBe('12 nov')
  })

  it('conserva: su fecha y por qué, para cada motivo', () => {
    const conserva = (motivo: DetalleDelSync['motivo']) =>
      textoDelRenglon(renglon({ grupo: 'conserva', fecha: '2026-10-23', fecha_nueva: null, motivo })).texto
    expect(conserva('a_mano')).toBe('23 oct · se la dieron a mano')
    expect(conserva('no_vino')).toBe('23 oct · tiene «No vino»')
    expect(conserva('llegada')).toBe('23 oct · ya tiene la llegada marcada')
    expect(conserva('listo')).toBe('23 oct · ya está lista para irse')
  })

  it('sólo ventana: su fecha, o «turno cancelado» si no tiene', () => {
    expect(textoDelRenglon(renglon({ grupo: 'ventana', fecha_nueva: null })).texto).toBe('20 oct')
    expect(textoDelRenglon(renglon({ grupo: 'ventana', fecha: null, fecha_nueva: null, motivo: 'cancelada' })).texto).toBe('turno cancelado')
  })

  it('la que queda fuera de su ventana nueva lo dice aparte (para pintarlo en ámbar); las demás, no', () => {
    expect(textoDelRenglon(renglon({ grupo: 'conserva', motivo: 'a_mano', fuera_de_ventana: true })).fueraDeVentana).toBe('queda fuera de su ventana nueva')
    expect(textoDelRenglon(renglon()).fueraDeVentana).toBeNull()
  })
})
