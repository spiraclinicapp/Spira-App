import { describe, expect, it } from 'vitest'
import { formatNumberAR, formatPctAR, formatShareAR, sharePct } from './numbers'

/**
 * El formato numérico es-AR.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son de las que fallan EN SILENCIO. Un separador invertido
 * no se ve mal en pantalla — se ve perfecto, alineado y tabular, diciendo otro número. El resto
 * de la pantalla de Reportes (el gráfico, las tarjetas, las tablas) falla de manera visible y se
 * verifica mirando.
 *
 * Sin base y sin navegador: son funciones puras.
 */

describe('formatNumberAR', () => {
  it('usa PUNTO para los miles, no coma', () => {
    // El caso que motiva el archivo entero: en es-AR son tres mil cuatrocientos ochenta y dos.
    expect(formatNumberAR(3482)).toBe('3.482')
    expect(formatNumberAR(1000)).toBe('1.000')
    expect(formatNumberAR(1234567)).toBe('1.234.567')
  })

  it('no separa por debajo de mil', () => {
    expect(formatNumberAR(0)).toBe('0')
    expect(formatNumberAR(7)).toBe('7')
    expect(formatNumberAR(999)).toBe('999')
  })

  it('redondea, porque un promedio calculado en el cliente no viene entero', () => {
    expect(formatNumberAR(112.4)).toBe('112')
    expect(formatNumberAR(112.5)).toBe('113')
  })

  it('mantiene el signo de los negativos (el balance puede cerrar en rojo)', () => {
    expect(formatNumberAR(-668)).toBe('-668')
    expect(formatNumberAR(-3482)).toBe('-3.482')
  })

  it('devuelve el guion en vez de "NaN" cuando el número no es un número', () => {
    // Sin esto la hoja impresa sale con la palabra NaN adentro de una tabla.
    expect(formatNumberAR(Number.NaN)).toBe('—')
    expect(formatNumberAR(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatPctAR', () => {
  it('usa COMA para el decimal', () => {
    expect(formatPctAR(31.8)).toBe('31,8%')
    expect(formatPctAR(5.2)).toBe('5,2%')
  })

  it('siempre muestra un decimal, aunque sea cero', () => {
    // "22,0%" y no "22%": las columnas de participación tienen que alinear verticalmente.
    expect(formatPctAR(22)).toBe('22,0%')
  })

  it('sabe redondear a entero cuando el decimal es ruido', () => {
    expect(formatPctAR(100, { entero: true })).toBe('100%')
    expect(formatPctAR(31.8, { entero: true })).toBe('32%')
  })

  it('devuelve el guion cuando no es un número', () => {
    expect(formatPctAR(Number.NaN)).toBe('—')
  })
})

describe('formatShareAR', () => {
  it('calcula la parte sobre el total', () => {
    expect(formatShareAR(1120, 3482)).toBe('32,2%')
    expect(formatShareAR(3482, 3482)).toBe('100,0%')
  })

  it('devuelve el guion cuando el total es cero, no "NaN%"', () => {
    // Pasa de verdad: un período sin movimientos deja todos los totales en 0 y la tabla
    // igual se renderiza. Sin este caso la pantalla vacía se llena de "NaN%".
    expect(formatShareAR(0, 0)).toBe('—')
    expect(formatShareAR(5, 0)).toBe('—')
  })
})

describe('sharePct', () => {
  it('devuelve la escala 0-100 para el ancho de la barra', () => {
    expect(sharePct(1120, 3482)).toBeCloseTo(32.17, 2)
    expect(sharePct(3482, 3482)).toBe(100)
  })

  it('acota arriba y abajo, para que la barra no se salga del carril', () => {
    expect(sharePct(500, 100)).toBe(100)
    expect(sharePct(-50, 100)).toBe(0)
  })

  it('devuelve 0 en vez de NaN cuando el total es cero', () => {
    expect(sharePct(0, 0)).toBe(0)
    expect(sharePct(10, 0)).toBe(0)
  })
})
