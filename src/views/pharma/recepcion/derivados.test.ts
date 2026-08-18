import { describe, expect, it } from 'vitest'
import type { FilaRecepcion } from './derivados'
import { armarMotivo, coincideBusqueda, contenidoDe, esCodigoDeBarras, medicamentosDistintos, resumenContenido, totalesDelDia, unidadesDe } from './derivados'

/**
 * Los derivados de Recepción.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que pueden fallar EN SILENCIO. "2 medicamentos"
 * se lee igual de prolijo cuando es uno solo en dos lotes, y una búsqueda que no mira el EAN
 * responde "nada con esos filtros" sin decir que nunca miró ese campo. La banda, el header en
 * grilla y la tabla fallan de manera visible: eso se verifica mirando la pantalla, no acá.
 *
 * Sin base y sin navegador: funciones puras sobre una fila.
 */

/** Renglón mínimo. `med` es el id: repetirlo es lo que simula el mismo fármaco en dos lotes. */
function item(over: { med?: string; lote?: string; qty?: number; nombre?: string; codes?: string[] } = {}) {
  return {
    medication_id: over.med ?? 'm1',
    lot_number: over.lote ?? 'LOTE-1',
    quantity: over.qty ?? 1,
    medication: {
      name: over.nombre ?? 'Alvetide 184/22 mcg',
      codes: (over.codes ?? ['7795373012288']).map((code) => ({ code })),
    },
  }
}

function fila(over: Partial<FilaRecepcion> = {}): FilaRecepcion {
  return {
    tipo: 'protocolo',
    status: 'pendiente',
    notes: null,
    total_kits: null,
    protocol: { code: 'EFC18419' },
    items: [item()],
    ...over,
  }
}

const ip = (over: Partial<FilaRecepcion> = {}) =>
  fila({ tipo: 'investigacion', total_kits: 24, items: [], ...over })

describe('medicamentosDistintos', () => {
  it('cuenta MEDICAMENTOS, no renglones: el mismo fármaco en dos lotes es uno solo', () => {
    // El unique de reception_items es por (recepción, medicamento, lote) — 0002:267 —, así que
    // esta fila es perfectamente válida y es la que rompe el conteo ingenuo.
    const r = fila({ items: [item({ med: 'm1', lote: 'L-8' }), item({ med: 'm1', lote: 'L-9' })] })
    expect(medicamentosDistintos(r)).toBe(1)
    expect(r.items.length).toBe(2)   // el valor que NO hay que mostrar
  })

  it('dos fármacos distintos son dos', () => {
    expect(medicamentosDistintos(fila({ items: [item({ med: 'm1' }), item({ med: 'm2' })] }))).toBe(2)
  })
})

describe('unidadesDe', () => {
  it('suma las cantidades de todos los renglones', () => {
    expect(unidadesDe(fila({ items: [item({ qty: 4 }), item({ med: 'm2', qty: 5 })] }))).toBe(9)
  })

  it('una recepción de IP no tiene renglones, así que no tiene unidades', () => {
    expect(unidadesDe(ip())).toBe(0)
  })
})

describe('resumenContenido', () => {
  it('pendiente: el verbo dice que todavía no entró a stock', () => {
    const r = fila({ items: [item({ med: 'm1', qty: 6 }), item({ med: 'm2', qty: 9 })] })
    expect(resumenContenido(r)).toBe('trae 2 medicamentos · 15 unidades')
  })

  it('verificada: las unidades ya ingresaron', () => {
    const r = fila({ status: 'verificada', items: [item({ med: 'm1', qty: 6 }), item({ med: 'm2', qty: 9 })] })
    expect(resumenContenido(r)).toBe('2 medicamentos · 15 unidades ingresadas')
  })

  it('el mismo fármaco en dos lotes dice UN medicamento', () => {
    const r = fila({ items: [item({ med: 'm1', lote: 'L-8', qty: 6 }), item({ med: 'm1', lote: 'L-9', qty: 9 })] })
    expect(resumenContenido(r)).toBe('trae 1 medicamento · 15 unidades')
  })

  it('singular en las dos magnitudes, con el participio concordado', () => {
    const r = fila({ status: 'verificada', items: [item({ qty: 1 })] })
    expect(resumenContenido(r)).toBe('1 medicamento · 1 unidad ingresada')
  })

  it('IP pendiente: kits, no unidades', () => {
    expect(resumenContenido(ip())).toBe('trae 24 kits')
  })

  it('IP verificada, con el participio en masculino', () => {
    expect(resumenContenido(ip({ status: 'verificada' }))).toBe('24 kits ingresados')
  })

  it('IP de un solo kit', () => {
    expect(resumenContenido(ip({ status: 'verificada', total_kits: 1 }))).toBe('1 kit ingresado')
  })

  it('recepción de base sin renglones: no inventa un conteo', () => {
    expect(resumenContenido(fila({ items: [] }))).toBe('trae 0 renglones')
  })
})

describe('esCodigoDeBarras', () => {
  // Se decide por la FORMA porque `code_type` miente: nació con default 'ean13' y nadie eligió
  // nunca el tipo. En producción, tres de seis códigos de esta pantalla están mal tipados.
  it('trece dígitos es el código de la caja', () => {
    expect(esCodigoDeBarras('7795373012288')).toBe(true)
  })

  it('los códigos cortos del centro no lo son, aunque la base los declare EAN', () => {
    expect(esCodigoDeBarras('01')).toBe(false)
    expect(esCodigoDeBarras('02')).toBe(false)
    expect(esCodigoDeBarras('0')).toBe(false)
  })

  it('doce o catorce dígitos tampoco: EAN-13 son trece exactos', () => {
    expect(esCodigoDeBarras('779537301228')).toBe(false)
    expect(esCodigoDeBarras('77953730122889')).toBe(false)
  })

  it('trece caracteres con una letra no es un EAN', () => {
    expect(esCodigoDeBarras('779537301228X')).toBe(false)
  })

  it('ignora los espacios de los costados', () => {
    expect(esCodigoDeBarras(' 7795373012288 ')).toBe(true)
  })

  it('el vacío no es nada', () => {
    expect(esCodigoDeBarras('')).toBe(false)
  })
})

describe('coincideBusqueda', () => {
  const r = fila({
    folio: 1043,
    notes: 'Entrega parcial del sponsor',
    protocol: { code: 'EFC18419' },
    items: [item({ lote: 'TRE-4412', nombre: 'Trelegy Ellipta', codes: ['7795373012288', '01'] })],
  })

  it('sin texto, entra todo', () => {
    expect(coincideBusqueda(r, '')).toBe(true)
    expect(coincideBusqueda(r, '   ')).toBe(true)
  })

  it('encuentra por EAN — el campo que el filtro no miraba', () => {
    expect(coincideBusqueda(r, '7795373012288')).toBe(true)
    expect(coincideBusqueda(r, '77953')).toBe(true)
  })

  it('mira TODOS los códigos del medicamento, no sólo el primero', () => {
    // medication_codes es 1-a-N: un producto puede tener su EAN y además un código interno.
    expect(coincideBusqueda(r, '01')).toBe(true)
  })

  it('encuentra por folio', () => {
    expect(coincideBusqueda(r, '1043')).toBe(true)
  })

  it('encuentra por lote, medicamento, protocolo y notas', () => {
    expect(coincideBusqueda(r, 'TRE-4412')).toBe(true)
    expect(coincideBusqueda(r, 'trelegy')).toBe(true)
    expect(coincideBusqueda(r, 'efc18419')).toBe(true)
    expect(coincideBusqueda(r, 'sponsor')).toBe(true)
  })

  it('no distingue mayúsculas', () => {
    expect(coincideBusqueda(r, 'TRELEGY')).toBe(true)
    expect(coincideBusqueda(r, 'tre-4412')).toBe(true)
  })

  it('lo que no está, no está', () => {
    expect(coincideBusqueda(r, 'ibuprofeno')).toBe(false)
  })

  it('sin folio no matchea la palabra "undefined"', () => {
    // Defensivo: mientras la 0085 no esté aplicada, `folio` no viaja en la fila. Un String()
    // descuidado dejaría que buscar "undefined" devolviera todas las recepciones.
    const sinFolio = fila({ folio: null })
    expect(coincideBusqueda(sinFolio, 'undefined')).toBe(false)
    expect(coincideBusqueda(sinFolio, 'null')).toBe(false)
  })
})

describe('totalesDelDia', () => {
  it('un día de recepciones de base', () => {
    const rows = [fila({ items: [item({ qty: 9 })] }), fila({ items: [item({ qty: 15 })] })]
    expect(totalesDelDia(rows)).toBe('2 recepciones · 24 unidades')
  })

  it('un día de IP habla en kits', () => {
    expect(totalesDelDia([ip()])).toBe('1 recepción · 24 kits')
  })

  it('kits y unidades NUNCA se suman: van en segmentos separados', () => {
    // Principio del Director Médico (0038): la composición de un kit la declara el sponsor y
    // Spira no la reinterpreta. Sumarlos daría un número que no significa nada.
    const rows = [fila({ items: [item({ qty: 15 })] }), ip()]
    expect(totalesDelDia(rows)).toBe('2 recepciones · 15 unidades · 24 kits')
  })

  it('singular en las tres magnitudes', () => {
    expect(totalesDelDia([fila({ items: [item({ qty: 1 })] })])).toBe('1 recepción · 1 unidad')
    expect(totalesDelDia([ip({ total_kits: 1 })])).toBe('1 recepción · 1 kit')
  })

  it('un día sin recepciones no enuncia magnitudes en cero', () => {
    expect(totalesDelDia([])).toBe('0 recepciones')
  })
})

describe('contenidoDe', () => {
  it('devuelve el cuerpo SIN verbo, para que lo use el que arma la frase', () => {
    const r = fila({ items: [item({ med: 'm1', qty: 10 }), item({ med: 'm2', qty: 5 })] })
    expect(contenidoDe(r)).toBe('2 medicamentos · 15 unidades')
  })

  it('en IP habla de kits', () => {
    expect(contenidoDe(ip({ total_kits: 24 }))).toBe('24 kits')
  })
})

describe('resumenContenido · la voz de la anulada', () => {
  // La banda ya lleva el rótulo ANULADA al lado, así que el resumen no lo repite: lo dice el
  // VERBO, igual que distingue "trae" (pendiente) de "ingresadas" (verificada).
  it('habla en pasado: traía, no trae', () => {
    const r = fila({ status: 'anulada', items: [item({ qty: 15 })] })
    expect(resumenContenido(r)).toBe('traía 1 medicamento · 15 unidades')
  })

  it('una anulada NO dice que ingresó nada', () => {
    const r = fila({ status: 'anulada', items: [item({ qty: 15 })] })
    expect(resumenContenido(r)).not.toMatch(/ingresad/)
  })

  it('en IP anulada también va en pasado', () => {
    expect(resumenContenido(ip({ status: 'anulada', total_kits: 24 }))).toBe('traía 24 kits')
  })
})

describe('totalesDelDia · con una anulada en el grupo', () => {
  // Cuenta los DOCUMENTOS que hay a la vista —la anulada sigue en la lista (D3)— pero no suma sus
  // unidades, y nombra el descuento. Si contara 2 con tres cards en pantalla, se leería como un bug.
  it('cuenta la anulada como recepción, no como unidades, y la nombra', () => {
    const rows = [
      fila({ items: [item({ qty: 10 })] }),
      fila({ items: [item({ qty: 5 })] }),
      fila({ status: 'anulada', items: [item({ qty: 99 })] }),
    ]
    expect(totalesDelDia(rows)).toBe('3 recepciones · 15 unidades · 1 anulada')
  })

  it('no descuenta kits de una IP vigente, sí de una anulada', () => {
    const rows = [ip({ total_kits: 24 }), ip({ status: 'anulada', total_kits: 100 })]
    expect(totalesDelDia(rows)).toBe('2 recepciones · 24 kits · 1 anulada')
  })

  it('sin anuladas, el texto queda exactamente como antes', () => {
    expect(totalesDelDia([fila({ items: [item({ qty: 4 })] })])).toBe('1 recepción · 4 unidades')
  })

  it('un día entero de anuladas no inventa unidades', () => {
    const rows = [fila({ status: 'anulada', items: [item({ qty: 9 })] })]
    expect(totalesDelDia(rows)).toBe('1 recepción · 1 anulada')
  })
})

describe('armarMotivo', () => {
  it('pega la nota con raya', () => {
    expect(armarMotivo('Duplicada', 'la cargó también Ana')).toBe('Duplicada — la cargó también Ana')
  })

  it('sin nota, el motivo va solo: nada de rayas colgando', () => {
    expect(armarMotivo('Duplicada', '')).toBe('Duplicada')
    expect(armarMotivo('Duplicada', '   ')).toBe('Duplicada')
  })
})

describe('coincideBusqueda · una anulada se sigue encontrando', () => {
  // D3: la anulada queda en el talonario. Si el buscador la escondiera, el hueco en los folios no
  // se explicaría solo.
  it('la encuentra por folio y por lote', () => {
    const r = fila({ status: 'anulada', folio: 11, items: [item({ lote: 'L-2291' })] })
    expect(coincideBusqueda(r, '11')).toBe(true)
    expect(coincideBusqueda(r, 'L-2291')).toBe(true)
  })
})
