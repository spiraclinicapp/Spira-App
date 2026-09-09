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
  ordenado_por: '2026-09-08T14:30:00-03:00',
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
        fila({ id: 'a', ordenado_por: '2026-09-08T18:00:00-03:00' }),
        fila({ id: 'b', ordenado_por: '2026-09-08T09:00:00-03:00' }),
        fila({ id: 'c', ordenado_por: '2026-09-07T11:00:00-03:00' }),
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
        fila({ id: 'p', ordenado_por: '2026-09-08T18:00:00-03:00' }),
        ambulatoria({ id: 'a', ordenado_por: '2026-09-08T17:00:00-03:00' }),
        fila({ id: 'p2', ordenado_por: '2026-09-08T16:00:00-03:00' }),
      ],
      etiqueta,
    )
    expect(out).toHaveLength(1)
    expect(out[0].filas.map((f) => f.tipo)).toEqual(['protocolo', 'ambulatoria', 'protocolo'])
  })

  /**
   * EL DÍA SE CORTA DEL TEXTO, no se construye un `Date`.
   *
   * `new Date(iso).getDate()` lo resuelve en la zona del NAVEGADOR: una entrega de las 21:30 de
   * Mendoza cae al día siguiente en UTC y desaparece del día en que se trabajó. Es exactamente el
   * bug que costó una noche el 2026-08-10 en el tablero, y la razón por la que la consulta manda
   * el offset fijo `-03:00`. Este caso lo fija: dos filas de la misma noche, una de ellas después
   * de las 21, tienen que caer en el MISMO grupo.
   */
  it('una entrega de las 22:00 de Mendoza queda en su propio día, no en el siguiente', () => {
    const out = agruparPorDia(
      [
        fila({ id: 'noche', ordenado_por: '2026-09-08T22:15:00-03:00' }),
        fila({ id: 'tarde', ordenado_por: '2026-09-08T15:00:00-03:00' }),
      ],
      etiqueta,
    )
    expect(out).toHaveLength(1)
    expect(out[0].dia).toBe('2026-09-08')
  })

  it('tolera la lista vacía', () => {
    expect(agruparPorDia([], etiqueta)).toEqual([])
  })
})
