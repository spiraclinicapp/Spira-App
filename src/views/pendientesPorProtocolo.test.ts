import { describe, expect, it } from 'vitest'
import { pendientesPorProtocolo } from './pendientesPorProtocolo'
import type { ReporteConProtocolo, VisitaConProtocolo } from './pendientesPorProtocolo'

/**
 * El conteo por protocolo de las tarjetas de Pendientes.
 *
 * ES ARITMÉTICA QUE SE LEE COMO VERDAD: una tarjeta que dice "3" cuando hay 5 no rompe nada, nadie
 * la va a contar a mano, y lo que esconde es trabajo clínico. Por eso tiene test y el JSX no.
 *
 * EL CASO QUE MÁS IMPORTA es el cruce de las DOS listas: la pantalla mezcla alertas de visita con
 * reportes pendientes, que vienen de consultas distintas y no comparten tipo. Un conteo que se
 * olvide de una de las dos se ve perfectamente normal — es el mismo modo de falla que la 0103
 * documenta para los menús de Médico y Coordinador.
 *
 * Sin base y sin navegador: es una función pura.
 */

const v = (protocol_code: string, computed_status: VisitaConProtocolo['computed_status']): VisitaConProtocolo =>
  ({ protocol_id: `id-${protocol_code}`, protocol_code, computed_status })
const r = (protocol_code: string): ReporteConProtocolo =>
  ({ protocol_id: `id-${protocol_code}`, protocol_code })

describe('pendientesPorProtocolo', () => {
  it('sin nada, no hay tarjetas', () => {
    expect(pendientesPorProtocolo([], [])).toEqual([])
  })

  it('suma las DOS listas en el mismo protocolo', () => {
    const [p] = pendientesPorProtocolo([v('A', 'ventana_vencida'), v('A', 'por_reprogramar')], [r('A'), r('A')])
    expect(p.total).toBe(4)
    expect(p.reportes).toBe(2)
    expect(p.porEstado).toEqual([
      { estado: 'ventana_vencida', n: 1 },
      { estado: 'por_reprogramar', n: 1 },
    ])
  })

  it('un protocolo que SÓLO tiene reportes existe igual', () => {
    // Si la función se armara recorriendo únicamente las visitas, este protocolo no tendría tarjeta
    // y sus reportes quedarían inalcanzables por atajo.
    const [p] = pendientesPorProtocolo([], [r('Z')])
    expect(p.code).toBe('Z')
    expect(p.total).toBe(1)
    expect(p.peor).toBeNull()
  })

  it('no inventa ceros: los estados sin filas no aparecen', () => {
    const [p] = pendientesPorProtocolo([v('A', 'item_vencido')], [])
    expect(p.porEstado).toEqual([{ estado: 'item_vencido', n: 1 }])
    expect(p.reportes).toBe(0)
  })

  it('el desglose sale en el orden de GRAVEDAD, no en el de aparición', () => {
    // Entran al revés a propósito: dos protocolos con los mismos estados tienen que mostrarlos
    // igual, o las tarjetas dejan de compararse de un vistazo.
    const [p] = pendientesPorProtocolo(
      [v('A', 'item_vencido'), v('A', 'por_reprogramar'), v('A', 'ventana_vencida')], [],
    )
    expect(p.porEstado.map((x) => x.estado)).toEqual(['ventana_vencida', 'por_reprogramar', 'item_vencido'])
    expect(p.peor).toBe('ventana_vencida')
  })

  /* ── El orden de las tarjetas ────────────────────────────────────────────────────────────────
     No es alfabético y es una decisión: primero el protocolo con la alerta más grave. Un tablero
     que ponga arriba al que empieza con "A" está ordenando por un dato que no significa nada. */
  it('ordena por la peor alerta presente, no por código', () => {
    const filas = pendientesPorProtocolo(
      [v('AAA', 'item_vencido'), v('ZZZ', 'ventana_vencida'), v('MMM', 'por_reprogramar')], [],
    )
    expect(filas.map((p) => p.code)).toEqual(['ZZZ', 'MMM', 'AAA'])
  })

  it('a igual gravedad, primero el que tiene más', () => {
    const filas = pendientesPorProtocolo(
      [v('A', 'ventana_vencida'), v('B', 'ventana_vencida'), v('B', 'ventana_vencida')], [],
    )
    expect(filas.map((p) => p.code)).toEqual(['B', 'A'])
  })

  it('los que sólo tienen reportes van al final, detrás de cualquier alerta de visita', () => {
    const filas = pendientesPorProtocolo([v('B', 'item_vencido')], [r('A'), r('A'), r('A')])
    expect(filas.map((p) => p.code)).toEqual(['B', 'A'])
  })

  it('a igual gravedad y cantidad, el código desempata para que el orden sea estable', () => {
    const filas = pendientesPorProtocolo([v('B', 'ventana_vencida'), v('A', 'ventana_vencida')], [])
    expect(filas.map((p) => p.code)).toEqual(['A', 'B'])
  })

  it('un estado que no es de alerta no rompe el conteo ni trepa al tope', () => {
    // No debería llegar (la consulta filtra por los tres estados), pero si llega: cuenta en el
    // total y no se cuela en el desglose ni en la ordenación.
    const [p] = pendientesPorProtocolo([v('A', 'completa'), v('A', 'ventana_vencida')], [])
    expect(p.total).toBe(2)
    expect(p.porEstado).toEqual([{ estado: 'ventana_vencida', n: 1 }])
    expect(p.peor).toBe('ventana_vencida')
  })
})
