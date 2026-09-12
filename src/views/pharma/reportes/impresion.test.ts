import { describe, expect, it } from 'vitest'
import { REPORTES } from './impresion'
import type { ContextoReporte } from './impresion'

/**
 * Los `pares` del sistema de impresión: la aritmética que se firma.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE. Las funciones `pares` de `REPORTES` son puras, exportadas, y hacen
 * la cuenta que después se imprime y se firma. Es el arquetipo de falla silenciosa de este
 * proyecto: sale un número razonable, bien formateado, y nadie tiene con qué compararlo — a
 * diferencia de un botón roto o un layout torcido, que se ven mal a simple vista.
 *
 * ACÁ VIVIÓ EL CRÍTICO DE ESTA TANDA. Cuando se arregló el saldo inflado (`saldoDelPeriodo` pasó a
 * restar TRES términos: ingresadas − dispensadas − ambulatorias), sólo se tocó `REPORTES.balance`.
 * `REPORTES.resumen` seguía con una resta de DOS términos escrita a mano en el propio `pares`, y
 * `REPORTES.todo` —la hoja del botón "Imprimir informe completo", la más usada— hace
 * `pares: (c) => REPORTES.resumen.pares!(c)`. Resultado: la MISMA hoja firmada imprimía "+700 u. de
 * saldo" en un renglón y, tres secciones más abajo, la tabla de salidas ambulatorias con las 40
 * unidades que ese +700 nunca descontó. El typecheck y los otros 911 tests no lo veían: es
 * aritmética de dos strings sin nada al lado que la contradiga.
 *
 * Sin base y sin navegador: son funciones puras sobre un `ContextoReporte` armado a mano.
 */

type Par = [string, string]

/** Busca el valor de un par por su clave. Sin esto cada assertion tendría que indexar el array a
 *  mano y contar posiciones, que es justo el tipo de test frágil que no sobrevive a un reordenamiento
 *  inocente de renglones. */
function valorDe(pares: Par[], clave: string): string | undefined {
  return pares.find(([k]) => k === clave)?.[1]
}

/**
 * Contexto con lo justo para ejercitar los `pares`. Por defecto reproduce el caso del bug tal como
 * lo describe el spec: 1000 unidades ingresadas, 300 dispensadas, 40 salidas ambulatorias — saldo
 * correcto 660 (1000 − 300 − 40), el que la hoja `resumen` daba mal era 700 (1000 − 300).
 */
function ctx(over: Partial<ContextoReporte> = {}): ContextoReporte {
  return {
    rango: { desde: '2026-08-01', hasta: '2026-08-31' },
    filtros: 'Sin filtros: todo el período',
    generadoPor: 'Dra. Scherbovsky',
    emitidoEn: '2026-08-31T18:00:00-03:00',
    totales: { unidades: 300, dispensaciones: 40, pacientes: 12, kits: 0 },
    ingresos: { unidades: 1000, recepciones: 6, kits: 0 },
    ambulatorias: { unidades: 40, salidas: 9 },
    salidasAmbulatorias: [],
    conAmbulatoria: true,
    minutosPromedio: 22,
    cumplimientoPct: 96,
    rechazados: 2,
    vencidos: { unidades: 0, lotes: 0 },
    protocolos: [],
    medicamentos: [],
    detalle: [],
    diaMax: null,
    diaMin: null,
    dias: 31,
    ...over,
  }
}

describe('el saldo: resumen, balance y todo tienen que decir lo mismo', () => {
  it('resumen y balance imprimen el MISMO saldo, y es el de TRES términos', () => {
    // Con el código de antes de esta tanda, `saldoResumen` daba "+700 u. de saldo": la resta a
    // mano de `REPORTES.resumen.pares` no conocía las salidas ambulatorias.
    const c = ctx()
    const saldoResumen = valorDe(REPORTES.resumen.pares!(c), 'Balance del período')
    const saldoBalance = valorDe(REPORTES.balance.pares!(c), 'Saldo')
    expect(saldoResumen).toBe('+660 u. de saldo')
    expect(saldoBalance).toBe('+660 u.')
  })

  it('todo imprime el mismo saldo que resumen, porque comparte sus pares', () => {
    // `REPORTES.todo.pares` es literalmente `REPORTES.resumen.pares`: si el segundo se arregla,
    // el primero se arregla solo. Este test cierra la puerta a que alguien vuelva a divergirlos
    // escribiéndole a `todo` un cuerpo propio en el futuro.
    const c = ctx()
    expect(REPORTES.todo.pares!(c)).toEqual(REPORTES.resumen.pares!(c))
  })

  it('resumen: con conAmbulatoria: false, NO trae el renglón de Salidas ambulatorias y el saldo es de DOS términos', () => {
    // POR QUÉ ESTE TEST. Los dos de arriba —y el `ctx()` por defecto— sólo ejercitan
    // `resumen.pares` con `conAmbulatoria: true`. El `if (c.conAmbulatoria)` de `impresion.tsx:80`
    // que agrega (o no) el renglón "Salidas ambulatorias" al RESUMEN —la hoja más impresa del
    // sistema— quedaba sin ningún test que lo cazara: borrarlo o invertirlo deja los cuatro tests
    // de este archivo en verde, y la hoja vuelve a mostrar 1000 ingresadas, 300 dispensadas y un
    // saldo de +660 sin el renglón que explica las 40 unidades que faltan — irreconciliable.
    const c = ctx({ conAmbulatoria: false, ambulatorias: { unidades: 0, salidas: 0 } })
    const pares = REPORTES.resumen.pares!(c)
    expect(valorDe(pares, 'Salidas ambulatorias')).toBeUndefined()
    // Reconciliable con las dos líneas de arriba: 1000 ingresadas − 300 dispensadas, sin un
    // tercer término que restar porque acá no se midió.
    expect(valorDe(pares, 'Balance del período')).toBe('+700 u. de saldo')
  })
})

describe('balance: "no se midió" no es lo mismo que "midió cero"', () => {
  it('con conAmbulatoria: false, la hoja NO trae el renglón de Salidas ambulatorias y el saldo es de DOS términos', () => {
    // Con un protocolo elegido la pantalla YA manda `ambulatorias` en cero (ver `ambEnRecorte` en
    // ReportesView.tsx): se replica ese contrato acá para no ejercitar una combinación que el
    // llamador real nunca produce.
    const c = ctx({ conAmbulatoria: false, ambulatorias: { unidades: 0, salidas: 0 } })
    const pares = REPORTES.balance.pares!(c)
    expect(valorDe(pares, 'Salidas ambulatorias')).toBeUndefined()
    expect(pares).toHaveLength(4)
    // 1000 − 300, sin nada que restar por ambulatoria: acá no se midió, así que no hay un tercer
    // término del que descontar.
    expect(valorDe(pares, 'Saldo')).toBe('+700 u.')
  })

  it('con conAmbulatoria: true, la hoja trae los CINCO renglones y el de Salidas ambulatorias con su cifra', () => {
    const c = ctx({ conAmbulatoria: true })
    const pares = REPORTES.balance.pares!(c)
    expect(pares).toHaveLength(5)
    expect(valorDe(pares, 'Salidas ambulatorias')).toBe('40 u.')
    expect(valorDe(pares, 'Saldo')).toBe('+660 u.')
  })
})
