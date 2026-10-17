/**
 * El resaltado y los rótulos de la Ayuda (`texto.ts`). Fallan en silencio: un resaltado corrido o vacío se ve
 * «raro», no roto, y un rótulo mal cortado se come una palabra. El caso que justifica el mapa de posiciones es
 * el de la tilde escrita como letra + acento suelto (ver la cabecera de `texto.ts`).
 */
import { describe, expect, it } from 'vitest'
import { conRotulos, pedazosDeAyuda, resaltar } from './texto'

const marcados = (p: { texto: string; marcado: boolean }[]) => p.filter((x) => x.marcado).map((x) => x.texto)
const unido = (p: { texto: string }[]) => p.map((x) => x.texto).join('')

describe('resaltar', () => {
  it('sin tilde encuentra y marca el texto CON tilde, completo', () => {
    const p = resaltar('¿Cómo registro una recepción de medicación?', 'recepcion')
    expect(marcados(p)).toEqual(['recepción'])
    expect(unido(p)).toBe('¿Cómo registro una recepción de medicación?')
  })
  it('y al revés: con tilde encuentra el texto sin ella; mayúsculas tampoco importan', () => {
    expect(marcados(resaltar('Recepcion de stock', 'recepción'))).toEqual(['Recepcion'])
    expect(marcados(resaltar('Pulsá el botón «Preparar»', 'PREPARAR'))).toEqual(['Preparar'])
  })
  it('las tildes ANTES de la coincidencia no corren el corte', () => {
    expect(marcados(resaltar('Dispensación, recepción y lote', 'lote'))).toEqual(['lote'])
  })
  it('CRÍTICO · una tilde escrita como letra + acento suelto no corre la marca (el caso que justifica el mapa)', () => {
    const descompuesto = 'recepción'
    expect(marcados(resaltar(descompuesto, 'recepcion'))).toEqual([descompuesto])
  })
  it('marca todas las apariciones, sin superponerlas', () => {
    expect(marcados(resaltar('lote, otro lote y lotes', 'lote'))).toEqual(['lote', 'lote', 'lote'])
    expect(marcados(resaltar('aaaa', 'aa'))).toEqual(['aa', 'aa'])
  })
  it('un término con caracteres de expresión regular no rompe nada', () => {
    expect(marcados(resaltar('El campo (opcional).', '(opcional).'))).toEqual(['(opcional).'])
  })
  it('sin término, o sin coincidencias, el texto queda entero y sin marcar; texto vacío no da pedazos', () => {
    expect(resaltar('Hola', '  ')).toEqual([{ texto: 'Hola', marcado: false }])
    expect(resaltar('Hola', 'chau')).toEqual([{ texto: 'Hola', marcado: false }])
    expect(resaltar('', 'x')).toEqual([])
  })
})

describe('conRotulos', () => {
  it('lo que va entre «» sale como rótulo, sin las comillas', () => {
    expect(conRotulos('Pulsá el botón «Volver» o «Confirmar igual».')).toEqual([
      { texto: 'Pulsá el botón ', rotulo: false },
      { texto: 'Volver', rotulo: true },
      { texto: ' o ', rotulo: false },
      { texto: 'Confirmar igual', rotulo: true },
      { texto: '.', rotulo: false },
    ])
  })
  it('una « sin cerrar queda como texto, y un texto sin comillas sale entero', () => {
    expect(conRotulos('Mirá «esto')).toEqual([{ texto: 'Mirá «esto', rotulo: false }])
    expect(conRotulos('Sin rótulos')).toEqual([{ texto: 'Sin rótulos', rotulo: false }])
  })
})

describe('pedazosDeAyuda', () => {
  it('resalta adentro de un rótulo y afuera, sin perder letras', () => {
    const p = pedazosDeAyuda('Pulsá el botón «Preparar» y prepará el pedido', 'prepar')
    expect(p.filter((x) => x.marcado).map((x) => [x.texto, x.rotulo])).toEqual([['Prepar', true], ['prepar', false]])
    expect(unido(p)).toBe('Pulsá el botón Preparar y prepará el pedido')
  })
})
