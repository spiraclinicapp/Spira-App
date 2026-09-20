import { describe, expect, it } from 'vitest'
import { agruparPorDia, detalleDeFila, tituloDeFila } from './historialModel'
import type { HistorialFilaRow } from './historialModel'

/**
 * Las reglas puras del historial unificado.
 *
 * POR QUÉ ÉSTAS Y NO OTRAS: son las que fallan EN SILENCIO. Un renglón mal armado no se ve roto —
 * se ve prolijo diciendo otra cosa: "autorizó" sin nombre parece un dato que se perdió, un
 * separador colgando parece un campo vacío, y una fila agrupada bajo el día equivocado hace que
 * alguien busque una entrega en el día que no fue. El resto de la lista (la grilla, el chip, el
 * badge) falla de manera visible y se verifica mirando.
 *
 * Sin base y sin navegador: son funciones puras sobre una fila.
 */

const fila = (over: Partial<HistorialFilaRow> = {}): HistorialFilaRow => ({
  tipo: 'protocolo',
  id: 'r1',
  ordenado_por: '2026-09-08T17:30:00+00:00',
  codigo: 'D-0417',
  correlativo: 17,
  destinatario: 'Juan Pérez',
  destinatario_id: 'p1',
  destinatario_ref: 'IVRS-001',
  protocol_code: 'PROT-A',
  protocol_id: 'pr1',
  medicamentos: 'Alvetide, Seretide',
  unidades: 5,
  estado_solicitud: 'atendida',
  estado_dispensacion: 'entregada',
  autorizado_por: null,
  ...over,
})

const ambulatoria = (over: Partial<HistorialFilaRow> = {}): HistorialFilaRow =>
  fila({
    tipo: 'ambulatoria',
    codigo: null,
    correlativo: null,
    destinatario: 'Ana Gómez',
    destinatario_id: null,
    destinatario_ref: '30111222',
    protocol_code: null,
    protocol_id: null,
    medicamentos: 'Seretide',
    unidades: 2,
    estado_solicitud: null,
    estado_dispensacion: null,
    autorizado_por: 'Dra. Molina',
    ...over,
  })

describe('detalleDeFila', () => {
  it('la de protocolo dice qué salió y cuánto', () => {
    expect(detalleDeFila(fila())).toBe('Alvetide, Seretide · 5 u.')
  })

  it('la ambulatoria suma quién autorizó', () => {
    expect(detalleDeFila(ambulatoria())).toBe('Seretide · 2 u. · autorizó Dra. Molina')
  })

  /* Un pedido de IP solo NO tiene renglones de medicación (el escaneo va por otro lado), así que
     `medicamentos` llega vacío. Concatenando a ciegas la línea arrancaba con " · 0 u." — un
     separador colgando que se lee como un campo que no cargó. */
  it('no deja el separador colgando cuando no hay medicación (pedido de IP solo)', () => {
    expect(detalleDeFila(fila({ medicamentos: '', unidades: 0 }))).toBe('0 u.')
  })

  /* La columna es `not null` en la base, así que esto no debería pasar — y por eso mismo se fija:
     "autorizó" a secas afirma que hubo alguien y que no sabemos quién, en la pantalla donde se
     viene a averiguar exactamente eso. */
  it('no escribe "autorizó" sin nombre', () => {
    expect(detalleDeFila(ambulatoria({ autorizado_por: '   ' }))).toBe('Seretide · 2 u.')
  })
})

describe('tituloDeFila', () => {
  it('la de protocolo se identifica por su código, que es lo que se dicta por teléfono', () => {
    expect(tituloDeFila(fila())).toBe('D-0417')
  })

  /* El código se sella recién al marcar la dispensación lista (0055). Una rechazada, una
     cancelada o una todavía en preparación nunca lo tiene, y tiene que poder mostrarse igual. */
  it('sin código sellado dice "Solicitud", no un hueco', () => {
    expect(tituloDeFila(fila({ codigo: null }))).toBe('Solicitud')
  })

  /* Una ambulatoria no emite comprobante, así que no hay código que pueda llegar nunca: su
     identidad es la persona que retiró, que es el único dato por el que alguien la va a buscar. */
  it('la ambulatoria se identifica por quién retiró', () => {
    expect(tituloDeFila(ambulatoria())).toBe('Ana Gómez')
  })
})

describe('agruparPorDia', () => {
  /** Etiqueta trivial: acá se testea el AGRUPAMIENTO, no el formato de fecha (eso es de `dates`). */
  const etiqueta = (iso: string) => iso

  it('junta las filas del mismo día en un grupo y respeta el orden que vino', () => {
    const out = agruparPorDia(
      [
        fila({ id: 'a', ordenado_por: '2026-09-08T21:00:00+00:00' }),
        fila({ id: 'b', ordenado_por: '2026-09-08T12:00:00+00:00' }),
        fila({ id: 'c', ordenado_por: '2026-09-07T14:00:00+00:00' }),
      ],
      etiqueta,
    )
    expect(out.map((g) => g.dia)).toEqual(['2026-09-08', '2026-09-07'])
    expect(out[0].filas.map((f) => f.id)).toEqual(['a', 'b'])
    expect(out[1].filas.map((f) => f.id)).toEqual(['c'])
  })

  /* Intercalar las dos fuentes es el punto de la 0117: si una ambulatoria abriera grupo propio,
     la lista se leería como si hubiera pasado en otro momento. */
  it('intercala las dos fuentes en el mismo día', () => {
    const out = agruparPorDia(
      [
        fila({ id: 'p', ordenado_por: '2026-09-08T21:00:00+00:00' }),
        ambulatoria({ id: 'a', ordenado_por: '2026-09-08T20:00:00+00:00' }),
        fila({ id: 'p2', ordenado_por: '2026-09-08T19:00:00+00:00' }),
      ],
      etiqueta,
    )
    expect(out).toHaveLength(1)
    expect(out[0].filas.map((f) => f.tipo)).toEqual(['protocolo', 'ambulatoria', 'protocolo'])
  })

  /**
   * ┌────────────────────────────────────────────────────────────────────────────────────────┐
   * │ EL CASO QUE COSTÓ EL BUG, Y LA PRIMERA VERSIÓN DE ESTE TEST QUE NO LO ATRAPABA           │
   * │                                                                                         │
   * │ **Los timestamps van en UTC (`+00:00`), que es como los manda PostgREST.** La versión    │
   * │ anterior de este caso los fabricaba en `-03:00` y pasaba con la implementación ROTA:     │
   * │ recortar `'2026-09-08T22:15:00-03:00'` da `2026-09-08` de casualidad, porque el texto ya │
   * │ venía en hora local. Producción nunca manda eso. El test verificaba una premisa que no   │
   * │ ocurre, y el bug apareció igual en el QA: una salida de las 22:37 de Mendoza llega como  │
   * │ `2026-09-09T01:37:29+00:00` y se agrupaba bajo el día siguiente.                          │
   * │                                                                                         │
   * │ Pasa igual en CI, que corre en UTC: el offset de `isoDayAR` es FIJO y no sale del reloj  │
   * │ de la máquina, así que este caso no depende de dónde se ejecute.                         │
   * └────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it('una entrega de las 22:37 de Mendoza queda en su día, no en el siguiente', () => {
    const out = agruparPorDia(
      [
        // 01:37 UTC del 9 = 22:37 del 8 en Mendoza. Es la fila real del QA del 2026-09-08.
        fila({ id: 'noche', ordenado_por: '2026-09-09T01:37:29.272045+00:00' }),
        fila({ id: 'tarde', ordenado_por: '2026-09-08T18:00:00+00:00' }),
      ],
      etiqueta,
    )
    expect(out).toHaveLength(1)
    expect(out[0].dia).toBe('2026-09-08')
  })

  /* La contracara: pasada la medianoche de Mendoza el día SÍ tiene que cambiar. Sin este caso, un
     `isoDayAR` que restara de más pasaría el test de arriba y agruparía mal todo lo de la mañana. */
  it('pero pasada la medianoche de Mendoza sí cambia de día', () => {
    const out = agruparPorDia(
      [
        fila({ id: 'madrugada', ordenado_por: '2026-09-09T03:10:00+00:00' }), // 00:10 del 9 en AR
        fila({ id: 'noche', ordenado_por: '2026-09-09T02:50:00+00:00' }),     // 23:50 del 8 en AR
      ],
      etiqueta,
    )
    expect(out.map((g) => g.dia)).toEqual(['2026-09-09', '2026-09-08'])
  })

  it('tolera la lista vacía', () => {
    expect(agruparPorDia([], etiqueta)).toEqual([])
  })
})
