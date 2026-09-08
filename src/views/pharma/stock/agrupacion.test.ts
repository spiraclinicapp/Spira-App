import { describe, expect, it } from 'vitest'
import type { LotDetailRow } from '../../../data/pharma'
import {
  agruparPorMedicamentoYAmbito,
  claveDeGrupo,
  claveDePlegado,
  construirGrupos,
  contarGrupos,
  debeAbrirse,
  esPlegable,
  estadoDelGrupo,
  etiquetaLotes,
  loteMatchea,
  nivelDelGrupo,
  stockTotal,
  vencimientoDelGrupo,
} from './agrupacion'

/**
 * Las reglas de la lista de Stock agrupada por medicamento.
 *
 * POR QUÉ ESTAS FUNCIONES Y NO OTRAS: son las que fallan EN SILENCIO. Un grupo que debería
 * abrirse porque tiene un lote vencido y arranca cerrado se ve impecable — sólo esconde un dato
 * clínico en la pantalla desde la que se decide qué dispensar. Lo mismo el "Bajo" que
 * desaparece al sumar, o el "1 de 3 lotes" que no avisa que el filtro recortó. El conector de
 * árbol, la elevación y el chevron fallan de manera VISIBLE y se verifican mirando.
 *
 * Las que empiezan con "REGRESIÓN" cubren conducta que YA funciona hoy con la lista plana y que
 * agrupar podría romper. Las que empiezan con "ÁMBITO" cubren lo contrario: conducta que hoy
 * está MAL y no se veía, porque hasta que la clave incluyó el protocolo un mismo medicamento con
 * lotes en dos estudios se fusionaba en un grupo — sumando stock ajeno y desapareciendo de uno
 * de los dos. Ningún fixture las tocaba: la factory pone `protocol_id: 'p1'` en todo.
 *
 * Sin base y sin navegador: son funciones puras sobre filas de `v_medication_lots_detail`.
 */

/** Lote mínimo. Los flags de vencimiento son los que emite la vista 0041, no se derivan de la
 *  fecha: por eso `vencido`/`por_vencer` se pasan aparte y pueden no coincidir con `expiry`. */
function lote(over: {
  id?: string
  med?: string
  nombre?: string
  droga?: string | null
  numero?: string
  expiry?: string | null
  qty?: number
  code?: string | null
  vencido?: boolean
  pronto?: boolean
  protocolo?: string | null
} = {}): LotDetailRow {
  return {
    lot_id: over.id ?? 'l1',
    medication_id: over.med ?? 'm1',
    protocol_id: over.protocolo === undefined ? 'p1' : over.protocolo,
    tipo: 'protocolo',
    name: over.nombre ?? 'Alvetide 92/22 mcg',
    dosis: null,
    unit: 'u',
    drug_name: over.droga === undefined ? 'Fluticasona furoato + Vilanterol' : over.droga,
    lot_number: over.numero ?? 'TEST01',
    expiry_date: over.expiry === undefined ? '2027-06-16' : over.expiry,
    quantity_on_hand: over.qty ?? 10,
    code: over.code === undefined ? '7795378006268' : over.code,
    vencido: over.vencido ?? false,
    por_vencer: over.pronto ?? false,
  }
}

describe('claveDeGrupo', () => {
  it('junta medicamento y protocolo', () => {
    expect(claveDeGrupo('m1', 'p1')).toBe('m1:p1')
  })

  /* Sin protocolo no es "sin dato": es el ámbito ambulatorio (CHECK de la 0035). Serializarlo a
     cadena vacía lo haría indistinguible de un protocolo sin id, y las dos claves colisionarían. */
  it('nombra el ámbito ambulatorio en vez de dejar el hueco vacío', () => {
    expect(claveDeGrupo('m1', null)).toBe('m1:ambulatoria')
    expect(claveDeGrupo('m1', null)).not.toBe(claveDeGrupo('m1', ''))
  })

  it('el mismo medicamento en dos protocolos da dos claves', () => {
    expect(claveDeGrupo('m1', 'p1')).not.toBe(claveDeGrupo('m1', 'p2'))
  })
})

describe('agruparPorMedicamentoYAmbito', () => {
  it('sin lotes devuelve un mapa vacío', () => {
    expect(agruparPorMedicamentoYAmbito([]).size).toBe(0)
  })

  it('junta los lotes del mismo medicamento en un solo grupo', () => {
    const g = agruparPorMedicamentoYAmbito([
      lote({ id: 'a', numero: 'TEST01' }),
      lote({ id: 'b', numero: 'DFA-6545' }),
    ])
    expect(g.size).toBe(1)
    expect(g.get(claveDeGrupo('m1', 'p1'))).toHaveLength(2)
  })

  it('separa medicamentos distintos', () => {
    const g = agruparPorMedicamentoYAmbito([lote({ med: 'm1' }), lote({ med: 'm2' })])
    expect([...g.keys()]).toEqual([claveDeGrupo('m1', 'p1'), claveDeGrupo('m2', 'p1')])
  })

  /* Dos productos distintos pueden llamarse igual. Agrupar por nombre sumaría el stock de los
     dos y mostraría un solo medicamento donde hay dos. */
  it('agrupa por medication_id, NUNCA por nombre', () => {
    const g = agruparPorMedicamentoYAmbito([
      lote({ med: 'm1', nombre: 'Alvetide 92/22 mcg' }),
      lote({ med: 'm2', nombre: 'Alvetide 92/22 mcg' }),
    ])
    expect(g.size).toBe(2)
  })

  /* El catálogo es global (0032) y recibir asigna solo (0040): dos estudios que usen el mismo
     producto comparten medication_id. Con la clave vieja esto daba UN grupo. */
  it('ÁMBITO: el mismo medicamento en dos protocolos son DOS grupos', () => {
    const g = agruparPorMedicamentoYAmbito([
      lote({ id: 'a', med: 'm1', protocolo: 'p1' }),
      lote({ id: 'b', med: 'm1', protocolo: 'p2' }),
    ])
    expect(g.size).toBe(2)
    expect(g.get(claveDeGrupo('m1', 'p1'))).toHaveLength(1)
    expect(g.get(claveDeGrupo('m1', 'p2'))).toHaveLength(1)
  })

  it('ÁMBITO: protocolo y ambulatoria tampoco se fusionan', () => {
    const g = agruparPorMedicamentoYAmbito([
      lote({ id: 'a', med: 'm1', protocolo: 'p1' }),
      lote({ id: 'b', med: 'm1', protocolo: null }),
    ])
    expect(g.size).toBe(2)
  })

  it('conserva el orden de llegada de la query', () => {
    const g = agruparPorMedicamentoYAmbito([lote({ med: 'm2' }), lote({ med: 'm1' })])
    expect([...g.keys()]).toEqual([claveDeGrupo('m2', 'p1'), claveDeGrupo('m1', 'p1')])
  })
})

describe('stockTotal', () => {
  it('suma las unidades de todos los lotes', () => {
    expect(stockTotal([lote({ qty: 4 }), lote({ qty: 5 })])).toBe(9)
  })

  it('un lote en cero no rompe la suma', () => {
    expect(stockTotal([lote({ qty: 0 }), lote({ qty: 12 })])).toBe(12)
  })
})

describe('estadoDelGrupo — el PEOR de sus lotes', () => {
  it('todos vigentes → vigente', () => {
    expect(estadoDelGrupo([lote(), lote()])).toBe('ok')
  })

  it('uno por vencer → por vencer', () => {
    expect(estadoDelGrupo([lote(), lote({ pronto: true })])).toBe('pronto')
  })

  /* El caso que motiva toda la regla: si el resumen heredara el estado del primer lote, un
     vencido escondido detrás de uno sano quedaría invisible hasta desplegar. */
  it('uno vencido y uno vigente → vencido', () => {
    expect(estadoDelGrupo([lote(), lote({ vencido: true })])).toBe('vencido')
  })

  it('vencido le gana a por vencer', () => {
    expect(estadoDelGrupo([lote({ pronto: true }), lote({ vencido: true })])).toBe('vencido')
  })

  it('sin fecha de vencimiento → vigente (los flags vienen en false)', () => {
    expect(estadoDelGrupo([lote({ expiry: null })])).toBe('ok')
  })
})

describe('vencimientoDelGrupo — la fecha MÁS PRÓXIMA (FEFO)', () => {
  it('con dos fechas devuelve la menor', () => {
    expect(vencimientoDelGrupo([lote({ expiry: '2027-07-29' }), lote({ expiry: '2027-06-16' })]))
      .toBe('2027-06-16')
  })

  it('ignora los lotes sin fecha', () => {
    expect(vencimientoDelGrupo([lote({ expiry: null }), lote({ expiry: '2027-06-16' })]))
      .toBe('2027-06-16')
  })

  it('si ninguno tiene fecha devuelve null (la columna muestra "—")', () => {
    expect(vencimientoDelGrupo([lote({ expiry: null }), lote({ expiry: null })])).toBeNull()
  })
})

describe('nivelDelGrupo', () => {
  /* Sumar sería lo intuitivo y está mal: 4 + 5 = 9 apagaría el badge aunque los DOS lotes estén
     bajos. Agrupar no puede apagar una advertencia que hoy se ve. */
  it('marca "bajo" si ALGÚN lote está bajo, aunque la suma no lo esté', () => {
    expect(nivelDelGrupo([lote({ qty: 4 }), lote({ qty: 5 })])).toBe('bajo')
  })

  it('un solo lote de 9 no está bajo', () => {
    expect(nivelDelGrupo([lote({ qty: 9 })])).toBe('ok')
  })

  it('"agotado" pide que TODOS los lotes estén en cero', () => {
    expect(nivelDelGrupo([lote({ qty: 0 }), lote({ qty: 0 })])).toBe('agotado')
  })

  /* La asimetría con "bajo", explícita: un lote vacío al lado de uno con 10 no es un
     medicamento agotado. */
  it('un lote en cero junto a uno con stock NO es agotado', () => {
    expect(nivelDelGrupo([lote({ qty: 0 }), lote({ qty: 10 })])).toBe('ok')
  })
})

describe('debeAbrirse — el despliegue automático', () => {
  it('un lote vencido abre el grupo', () => {
    expect(debeAbrirse([lote(), lote({ vencido: true })], '')).toBe(true)
  })

  it('un lote por vencer abre el grupo', () => {
    expect(debeAbrirse([lote({ pronto: true })], '')).toBe(true)
  })

  it('un grupo sano y sin búsqueda arranca plegado', () => {
    expect(debeAbrirse([lote(), lote()], '')).toBe(false)
  })

  it('un lote que matchea la búsqueda abre el grupo', () => {
    expect(debeAbrirse([lote({ numero: 'TEST01' }), lote({ numero: 'DFA-6545' })], 'DFA-6545')).toBe(true)
  })

  it('una búsqueda que no matchea ningún lote no lo abre', () => {
    expect(debeAbrirse([lote({ numero: 'TEST01' })], 'zzz')).toBe(false)
  })
})

describe('claveDePlegado — cuándo se olvidan los cierres a mano', () => {
  it('la misma búsqueda y el mismo filtro dan la misma clave', () => {
    expect(claveDePlegado('  DFA  ', 'todos')).toBe(claveDePlegado('dfa', 'todos'))
  })

  it('cambiar el filtro cambia la clave', () => {
    expect(claveDePlegado('', 'todos')).not.toBe(claveDePlegado('', 'vencido'))
  })

  it('cambiar la búsqueda cambia la clave', () => {
    expect(claveDePlegado('a', 'todos')).not.toBe(claveDePlegado('b', 'todos'))
  })
})

describe('etiquetaLotes', () => {
  const g = (visibles: number, total: number) => ({
    key: claveDeGrupo('m1', 'p1'),
    medicationId: 'm1', name: 'x', drugName: null, code: null, protocolId: 'p1',
    lotes: Array.from({ length: visibles }, (_, i) => lote({ id: `l${i}` })),
    totalLotes: total, abiertoPorDefecto: false,
  })

  it('sin filtro dice cuántos lotes hay', () => {
    expect(etiquetaLotes(g(3, 3))).toBe('3 lotes')
  })

  /* La honestidad de D14: bajo un filtro el resumen habla de menos lotes de los que el
     medicamento tiene, y tiene que decirlo. */
  it('con el filtro recortando dice "M de N lotes"', () => {
    expect(etiquetaLotes(g(1, 3))).toBe('1 de 3 lotes')
  })

  it('singular cuando el medicamento tiene un solo lote', () => {
    expect(etiquetaLotes(g(1, 1))).toBe('1 lote')
  })
})

describe('construirGrupos — el armado completo', () => {
  const dosLotes = [
    lote({ id: 'a', med: 'm1', numero: 'TEST01', qty: 4 }),
    lote({ id: 'b', med: 'm1', numero: 'DFA-6545', qty: 5 }),
  ]

  it('sin filtros arma un grupo por medicamento con todos sus lotes', () => {
    const [g] = construirGrupos(dosLotes, '', 'todos')
    expect(g.lotes).toHaveLength(2)
    expect(g.totalLotes).toBe(2)
    expect(esPlegable(g)).toBe(true)
  })

  it('un medicamento de un solo lote no es plegable', () => {
    const [g] = construirGrupos([lote()], '', 'todos')
    expect(esPlegable(g)).toBe(false)
  })

  it('el EAN y el nombre suben al grupo (son del medicamento, no del lote)', () => {
    const [g] = construirGrupos(dosLotes, '', 'todos')
    expect(g.code).toBe('7795378006268')
    expect(g.name).toBe('Alvetide 92/22 mcg')
  })

  /* REGRESIÓN R1 — hoy, con la lista plana, buscar un número de lote muestra ESA fila. Al
     plegar, el match podía quedar escondido detrás de una fila que dice "2 lotes". */
  it('REGRESIÓN: buscar un número de lote muestra el grupo, y ABIERTO', () => {
    const [g] = construirGrupos(dosLotes, 'DFA-6545', 'todos')
    expect(g).toBeDefined()
    expect(g.abiertoPorDefecto).toBe(true)
  })

  /* El buscador SELECCIONA, no recorta: el resumen tiene que seguir diciendo 9 u., no 5. */
  it('REGRESIÓN: buscar un lote muestra TODOS los lotes del grupo', () => {
    const [g] = construirGrupos(dosLotes, 'DFA-6545', 'todos')
    expect(g.lotes).toHaveLength(2)
    expect(stockTotal(g.lotes)).toBe(9)
  })

  /* REGRESIÓN R2 — el EAN también es buscable hoy. */
  it('REGRESIÓN: buscar un EAN encuentra el grupo', () => {
    expect(construirGrupos(dosLotes, '7795378006268', 'todos')).toHaveLength(1)
  })

  /* REGRESIÓN R4 — hoy un lote vencido se ve sin tocar nada. */
  it('REGRESIÓN: un lote vencido se ve sin interacción', () => {
    const [g] = construirGrupos([lote({ id: 'a' }), lote({ id: 'b', vencido: true })], '', 'todos')
    expect(g.abiertoPorDefecto).toBe(true)
  })

  /* REGRESIÓN R3 — Ambulatoria (protocol_id null) usa el mismo armado. */
  it('REGRESIÓN: los lotes sin protocolo (Ambulatoria) se agrupan igual', () => {
    const grupos = construirGrupos(
      [lote({ id: 'a', protocolo: null }), lote({ id: 'b', protocolo: null })],
      '', 'todos',
    )
    expect(grupos).toHaveLength(1)
    expect(grupos[0].protocolId).toBeNull()
    expect(grupos[0].lotes).toHaveLength(2)
  })

  /* La query de Farmacia Protocolo trae los lotes de TODOS los protocolos de una vez y el front
     reparte después por `protocolId`. Con la clave vieja este caso daba UN grupo, colgado del
     protocolo del primer lote: sumaba 40 + 25 = 65 unidades de dos estudios distintos y el
     medicamento desaparecía del segundo. En pantalla se veía impecable. */
  it('ÁMBITO: dos estudios con el mismo medicamento no comparten grupo ni suman stock', () => {
    const grupos = construirGrupos(
      [
        lote({ id: 'a', med: 'm1', numero: 'L-11', qty: 40, protocolo: 'p1' }),
        lote({ id: 'b', med: 'm1', numero: 'L-22', qty: 25, protocolo: 'p2' }),
      ],
      '', 'todos',
    )
    expect(grupos).toHaveLength(2)
    expect(grupos.map((g) => g.protocolId)).toEqual(['p1', 'p2'])
    expect(grupos.map((g) => stockTotal(g.lotes))).toEqual([40, 25])
    expect(grupos.map((g) => g.totalLotes)).toEqual([1, 1])
  })

  /* La `key` es lo que separa a esos dos grupos en React, en el plegado y en el kebab. Si
     colisionara, plegar uno plegaría al otro y abrir un menú abriría los dos. */
  it('ÁMBITO: cada grupo trae su propia key, y el medicationId sigue siendo el del medicamento', () => {
    const grupos = construirGrupos(
      [
        lote({ id: 'a', med: 'm1', protocolo: 'p1' }),
        lote({ id: 'b', med: 'm1', protocolo: 'p2' }),
      ],
      '', 'todos',
    )
    expect(grupos[0].key).not.toBe(grupos[1].key)
    expect(grupos.map((g) => g.medicationId)).toEqual(['m1', 'm1'])
  })

  it('el filtro de vencimiento RECORTA los lotes y el total los recuerda', () => {
    const [g] = construirGrupos(
      [lote({ id: 'a' }), lote({ id: 'b', vencido: true })],
      '', 'vencido',
    )
    expect(g.lotes).toHaveLength(1)
    expect(g.totalLotes).toBe(2)
    expect(etiquetaLotes(g)).toBe('1 de 2 lotes')
  })

  it('un grupo sin ningún lote que pase el filtro no se muestra', () => {
    expect(construirGrupos([lote()], '', 'vencido')).toHaveLength(0)
  })

  it('una búsqueda sin coincidencias no devuelve grupos', () => {
    expect(construirGrupos(dosLotes, 'inexistente', 'todos')).toHaveLength(0)
  })

  it('la búsqueda por nombre de medicamento trae el grupo entero', () => {
    const [g] = construirGrupos(dosLotes, 'alvetide', 'todos')
    expect(g.lotes).toHaveLength(2)
  })
})

describe('loteMatchea', () => {
  it('sin búsqueda matchea todo', () => {
    expect(loteMatchea(lote(), '   ')).toBe(true)
  })

  it('matchea por droga', () => {
    expect(loteMatchea(lote(), 'vilanterol')).toBe(true)
  })

  it('no explota con droga o código nulos', () => {
    expect(loteMatchea(lote({ droga: null, code: null }), 'zzz')).toBe(false)
  })
})

describe('contarGrupos', () => {
  it('cuenta medicamentos y lotes visibles, en singular y plural', () => {
    const grupos = construirGrupos(
      [lote({ id: 'a', med: 'm1' }), lote({ id: 'b', med: 'm1' }), lote({ id: 'c', med: 'm2' })],
      '', 'todos',
    )
    expect(contarGrupos(grupos)).toBe('2 medicamentos · 3 lotes')
    expect(contarGrupos(grupos.slice(1))).toBe('1 medicamento · 1 lote')
  })
})
