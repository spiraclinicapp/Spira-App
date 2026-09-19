import { describe, expect, it } from 'vitest'
import { contenidoSeccionIp, esVisitaHistorica, mostrarAvisoIp, ofrecerRegistrarIp } from './seccionIpModel'
import type { SituacionIp } from './seccionIpModel'

/**
 * Qué muestra la sección del producto en investigación (plan D18 y R11, Tanda 3a; spec del
 * 2026-09-19 para el desenlace).
 *
 * Se testea porque cada rama se ve prolija aunque sea la equivocada: un dropzone sobre una visita
 * que ya se cerró como «No corresponde», «Visita anterior al registro del IP» sobre una del 17/09 con
 * el IP sin entregar, o el aviso de entrega repetida sobre la propia entrega.
 */

const base: SituacionIp = {
  hayArchivo: false,
  hayPedidoAbierto: false,
  pedidoAbiertoLaAcepta: false,
  entregadoConConstancia: false,
  cargando: false,
  cerrada: false,
  prevista: false,
  readOnly: false,
  estadoIp: null,
  historica: false,
}
const con = (s: Partial<SituacionIp>) => contenidoSeccionIp({ ...base, ...s })

describe('contenidoSeccionIp', () => {
  it('sin cronograma, sin pedido y sin cierre: el estado vacío que ofrece pedirlo', () => {
    expect(con({})).toBe('no_prevista')
    expect(con({ readOnly: true })).toBe('no_prevista')
  })

  it('prevista y con permiso de carga: el dropzone, aunque haya estado o sea histórica', () => {
    expect(con({ prevista: true })).toBe('adjuntar')
    expect(con({ prevista: true, estadoIp: 'sin_pedir', historica: true })).toBe('adjuntar')
  })

  it('prevista en lectura, con fila en v_visit_ip_status: el desenlace', () => {
    expect(con({ prevista: true, readOnly: true, estadoIp: 'sin_pedir' })).toBe('desenlace')
    expect(con({ prevista: true, readOnly: true, estadoIp: 'rechazado' })).toBe('desenlace')
    // Entregado SIN constancia (entregas viejas): la frase «Entregado por…», no un papel que falta.
    expect(con({ prevista: true, readOnly: true, estadoIp: 'entregado' })).toBe('desenlace')
  })

  it('prevista en lectura, sin fila: histórica si se fechó antes de la 0119, si no «sin registro»', () => {
    expect(con({ prevista: true, readOnly: true, historica: true })).toBe('historica')
    expect(con({ prevista: true, readOnly: true })).toBe('sin_registro')
  })

  it('el estado de la vista le gana a la marca histórica: si la base sabe algo, se dice eso', () => {
    expect(con({ prevista: true, readOnly: true, estadoIp: 'pedido', historica: true })).toBe('desenlace')
  })

  it('una histórica sin IP previsto sigue en el estado vacío', () => {
    expect(con({ historica: true, readOnly: true })).toBe('no_prevista')
  })

  it('con un cierre de la 0119 no se ofrece nada, aunque el cronograma lo prevea', () => {
    expect(con({ cerrada: true, prevista: true })).toBe('cierre')
    expect(con({ cerrada: true })).toBe('cierre')
    expect(con({ cerrada: true, prevista: true, readOnly: true, estadoIp: 'no_corresponde', historica: true })).toBe('cierre')
  })

  it('mientras carga no se afirma nada: ni dropzone, ni cierre, ni «anterior al registro»', () => {
    expect(con({ cargando: true, prevista: true })).toBe('cargando')
    expect(con({ cargando: true })).toBe('cargando')
    expect(con({ cargando: true, prevista: true, readOnly: true, historica: true })).toBe('cargando')
  })

  it('lo que ya pasó se muestra aunque haya cierre: la constancia es nota fuente', () => {
    expect(con({ entregadoConConstancia: true, cerrada: true })).toBe('entregado')
    expect(con({ entregadoConConstancia: true, prevista: true, readOnly: true, estadoIp: 'entregado' })).toBe('entregado')
    expect(con({ hayPedidoAbierto: true, pedidoAbiertoLaAcepta: true, cerrada: true })).toBe('en_curso')
  })

  it('un pedido abierto que no toma la constancia no abre el dropzone: dice el pedido', () => {
    expect(con({ hayPedidoAbierto: true, prevista: true, estadoIp: 'pedido' })).toBe('desenlace')
    expect(con({ hayPedidoAbierto: true, prevista: true })).toBe('sin_registro')
    // Sin cronograma: el estado vacío, que abre la excepción y manda el IP en su propio pedido.
    expect(con({ hayPedidoAbierto: true })).toBe('no_prevista')
  })

  it('la constancia elegida y sin enviar manda sobre todo', () => {
    expect(con({ hayArchivo: true, entregadoConConstancia: true, cerrada: true })).toBe('pendiente')
  })
})

describe('esVisitaHistorica — la marca de la 0119', () => {
  it('fechada y sin marca: anterior al registro del IP', () => {
    expect(esVisitaHistorica({ lleva_ip: null, real_date: '2026-09-02', attended_at: null })).toBe(true)
    expect(esVisitaHistorica({ lleva_ip: null, real_date: null, attended_at: '2026-09-02T13:00:00+00:00' })).toBe(true)
  })

  it('con la marca puesta, en verdadero o en falso, no es histórica', () => {
    expect(esVisitaHistorica({ lleva_ip: true, real_date: '2026-09-17', attended_at: null })).toBe(false)
    expect(esVisitaHistorica({ lleva_ip: false, real_date: '2026-09-17', attended_at: null })).toBe(false)
  })

  it('sin fechar no es histórica: la marca se pone recién al fecharla', () => {
    expect(esVisitaHistorica({ lleva_ip: null, real_date: null, attended_at: null })).toBe(false)
  })

  it('sin la fila (la RLS filtra en silencio) no se afirma nada', () => {
    expect(esVisitaHistorica(null)).toBe(false)
  })
})

describe('ofrecerRegistrarIp — la puerta de la sección (E3)', () => {
  it('sí con el IP sin pedir o rechazado', () => {
    expect(ofrecerRegistrarIp('desenlace', 'sin_pedir')).toBe(true)
    expect(ofrecerRegistrarIp('desenlace', 'rechazado')).toBe(true)
  })

  it('no con un pedido vivo en Farmacia, ni con una entrega hecha', () => {
    expect(ofrecerRegistrarIp('desenlace', 'pedido')).toBe(false)
    expect(ofrecerRegistrarIp('desenlace', 'entregado')).toBe(false)
  })

  it('no fuera del desenlace: ni en las históricas, ni donde ya hay dropzone', () => {
    expect(ofrecerRegistrarIp('historica', null)).toBe(false)
    expect(ofrecerRegistrarIp('sin_registro', null)).toBe(false)
    expect(ofrecerRegistrarIp('adjuntar', 'sin_pedir')).toBe(false)
  })
})

describe('mostrarAvisoIp — el aviso de entrega repetida (E4)', () => {
  it('no sobre una entrega ya a la vista ni sobre un cierre', () => {
    expect(mostrarAvisoIp('entregado', 'entregado')).toBe(false)
    expect(mostrarAvisoIp('cierre', 'no_corresponde')).toBe(false)
    expect(mostrarAvisoIp('desenlace', 'entregado')).toBe(false)
  })

  it('sí mientras se pide, aunque la visita ya tenga su entrega: es justo una segunda', () => {
    expect(mostrarAvisoIp('pendiente', 'entregado')).toBe(true)
    expect(mostrarAvisoIp('adjuntar', 'sin_pedir')).toBe(true)
    expect(mostrarAvisoIp('en_curso', 'pedido')).toBe(true)
  })
})
