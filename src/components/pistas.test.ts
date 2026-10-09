import { describe, expect, it } from 'vitest'
import { DEMORA_MS, demoraDeApertura, esRotulo, formaDePista, quitarId, sumarId, ubicarPista } from './pistas'

/**
 * Las reglas de la pista que reemplaza al globo del navegador (`Pistas.tsx`).
 *
 * POR QUÉ ESTAS Y NO OTRAS: son las que fallan EN SILENCIO. Una `formaDePista` que devuelve `null`
 * de más hace desaparecer una ayuda sin que nada se vea roto —la pantalla queda perfecta, y la
 * coordinadora nueva se queda sin saber qué es «Adherencia»—; un `quitarId` que no devuelve el
 * `aria-describedby` como estaba le cambia al lector de pantalla lo que anuncia, y eso no lo ve
 * nadie que mire. El resto (colores, la animación, el portal) falla de manera visible y se verifica
 * mirando.
 */

const base = { texto: '', esTermino: false, textoVisible: '', cortado: false }

describe('formaDePista', () => {
  it('un término del glosario va con título, aunque la definición sea corta', () => {
    expect(formaDePista({ ...base, texto: 'Qué porcentaje…', esTermino: true, textoVisible: 'Adherencia' })).toBe('termino')
  })
  it('el nombre que repite el texto visible sólo se explica si está cortado', () => {
    const nombre = { ...base, texto: 'Juan Pérez', textoVisible: 'Juan Pérez' }
    expect(formaDePista(nombre)).toBeNull()
    expect(formaDePista({ ...nombre, cortado: true })).toBe('rotulo')
  })
  it('compara sin espacios de más (el JSX deja saltos alrededor del texto)', () => {
    expect(formaDePista({ ...base, texto: 'Juan Pérez', textoVisible: '\n  Juan Pérez  ' })).toBeNull()
  })
  it('un rótulo corto de ícono es rótulo; una oración es frase', () => {
    expect(formaDePista({ ...base, texto: 'Cerrar (Esc)' })).toBe('rotulo')
    expect(formaDePista({ ...base, texto: 'La fecha real cayó fuera de la ventana del cronograma' })).toBe('frase')
  })
  it('sin texto no hay pista', () => {
    expect(formaDePista({ ...base, texto: '   ' })).toBeNull()
  })
})

describe('esRotulo', () => {
  it('acepta el atajo entre paréntesis', () => {
    expect(esRotulo('Visita anterior (↑)')).toBe(true)
  })
  it('rechaza lo que tiene puntuación de oración, saltos o es largo', () => {
    expect(esRotulo('Fuera de ventana. La ventana es el rango…')).toBe(false)
    expect(esRotulo('Commit 1a2b3c4\nBuild de producción')).toBe(false)
    expect(esRotulo('Abrir el portal del sponsor en una pestaña nueva')).toBe(false)
  })
})

describe('ubicarPista', () => {
  const ventana = { width: 1000, height: 800 }
  it('abajo y centrada, a 6 px', () => {
    expect(ubicarPista({ top: 100, bottom: 120, left: 400, width: 40 }, { width: 100, height: 30 }, ventana))
      .toEqual({ top: 126, left: 370 })
  })
  it('arriba si abajo no entra', () => {
    expect(ubicarPista({ top: 760, bottom: 780, left: 400, width: 40 }, { width: 100, height: 30 }, ventana).top).toBe(724)
  })
  it('se queda abajo si tampoco entra arriba (no se sale por el techo)', () => {
    expect(ubicarPista({ top: 10, bottom: 790, left: 400, width: 40 }, { width: 100, height: 30 }, ventana).top).toBe(796)
  })
  it('nunca a menos de 8 px de los bordes', () => {
    expect(ubicarPista({ top: 100, bottom: 120, left: 0, width: 20 }, { width: 280, height: 30 }, ventana).left).toBe(8)
    expect(ubicarPista({ top: 100, bottom: 120, left: 990, width: 10 }, { width: 280, height: 30 }, ventana).left).toBe(712)
  })
})

describe('demoraDeApertura', () => {
  it('la primera pista espera; la que sigue a otra recién cerrada sale ya', () => {
    expect(demoraDeApertura(10_000, -Infinity, false)).toBe(DEMORA_MS)
    expect(demoraDeApertura(10_000, 9_800, false)).toBe(0)
    expect(demoraDeApertura(10_000, 9_000, false)).toBe(DEMORA_MS)
    expect(demoraDeApertura(10_000, -Infinity, true)).toBe(0)
  })
})

describe('sumarId / quitarId', () => {
  it('suma sin pisar lo que había y lo devuelve como estaba', () => {
    expect(sumarId(null, 'p')).toBe('p')
    expect(sumarId('ayuda', 'p')).toBe('ayuda p')
    expect(sumarId('ayuda p', 'p')).toBe('ayuda p')
    expect(quitarId('ayuda p', 'p')).toBe('ayuda')
    expect(quitarId('p', 'p')).toBeNull()
  })
})
