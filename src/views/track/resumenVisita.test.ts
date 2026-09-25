// El Resumen de la visita: qué lleva la visita, dicho en cuatro señales (plan
// `docs/plan-resumen-de-visita.md`). Se testea porque TODO lo de acá falla en silencio: la tira se
// dibuja igual de prolija diciendo «Sin sangre» en una visita con extracción, contando un kit IP que
// alguien cerró como «No corresponde», o mostrando los procedimientos de otro estudio.
import { describe, expect, it } from 'vitest'
import { armarResumenesDelDia, llevaKitIp, porCargar, resumenDeVisita, sangreDeVisita } from './resumenVisita'

/** Un procedimiento del cuadro, como se lo pasa el modal. */
const proc = (name: string, sangre: boolean | null, tieneReporte = false) => ({
  procedure_id: name, name, draws_blood: sangre, tieneReporte,
})

describe('llevaKitIp', () => {
  it('sin fila de IP, la visita no lleva kit', () => {
    expect(llevaKitIp(null)).toBe(false)
  })

  it('con IP abierto o entregado, sí', () => {
    expect(llevaKitIp({ cierre: null })).toBe(true)
  })

  it('cerrado por excepción, NO: «No corresponde» y «Se entregó en otra visita» dicen que esta visita no lo lleva', () => {
    expect(llevaKitIp({ cierre: 'no_corresponde' })).toBe(false)
    expect(llevaKitIp({ cierre: 'entregado_en_otra_visita' })).toBe(false)
  })
})

describe('sangreDeVisita', () => {
  it('con uno que la lleva, la visita lleva sangre', () => {
    expect(sangreDeVisita([proc('a', false), proc('b', true), proc('c', null)])).toBe('si')
  })

  it('con todos definidos en que no, la visita NO lleva', () => {
    expect(sangreDeVisita([proc('a', false), proc('b', false)])).toBe('no')
  })

  it('con alguno sin definir y ninguno que la lleve, no se afirma nada', () => {
    expect(sangreDeVisita([proc('a', false), proc('b', null)])).toBeNull()
  })

  it('sin procedimientos, no se afirma nada', () => {
    expect(sangreDeVisita([])).toBeNull()
  })
})

describe('resumenDeVisita', () => {
  it('sin procedimientos y sin IP devuelve null: la fila del día no dibuja nada', () => {
    expect(resumenDeVisita([], null)).toBeNull()
  })

  it('una visita que sólo lleva IP igual tiene resumen, con la entrega como único ítem', () => {
    const r = resumenDeVisita([], { cierre: null })
    expect(r?.total).toBe(1)
    expect(r?.kitIp).toBe(true)
    expect(r?.items.map((i) => i.esIp)).toEqual([true])
  })

  it('el IP suma al total y va PRIMERO, antes de los del cronograma', () => {
    const r = resumenDeVisita([proc('Signos vitales', false)], { cierre: null })
    expect(r?.total).toBe(2)
    expect(r?.items[0].esIp).toBe(true)
    expect(r?.items[1].name).toBe('Signos vitales')
  })

  it('un IP cerrado por excepción NO cuenta ni aparece en el listado', () => {
    const r = resumenDeVisita([proc('Signos vitales', false)], { cierre: 'no_corresponde' })
    expect(r?.total).toBe(1)
    expect(r?.kitIp).toBe(false)
    expect(r?.items.some((i) => i.esIp)).toBe(false)
  })

  it('conserva el orden del cronograma y las marcas de cada procedimiento', () => {
    const r = resumenDeVisita([proc('Laboratorio', true, true), proc('ECG', null, true)], null)
    expect(r?.items.map((i) => i.name)).toEqual(['Laboratorio', 'ECG'])
    expect(r?.items.map((i) => i.tieneReporte)).toEqual([true, true])
    expect(r?.sangre).toBe('si')
  })
})

describe('porCargar', () => {
  const rep = (completed: boolean, stage: string) => ({ completed, stage })

  it('cuenta los descargados, igual que el tablero', () => {
    expect(porCargar([rep(true, 'pendiente'), rep(true, 'descargado')])).toBe(2)
  })

  it('no cuenta lo evolucionado ni lo que todavía no se realizó', () => {
    expect(porCargar([rep(true, 'evolucionado'), rep(false, 'pendiente')])).toBe(0)
  })

  it('el tilde optimista SUBE el conteo: el reporte pasa a contar en el mismo render', () => {
    const servidor = [rep(false, 'pendiente')]
    expect(porCargar(servidor)).toBe(0)
    const conTildeOptimista = servidor.map((r) => ({ ...r, completed: true }))
    expect(porCargar(conTildeOptimista)).toBe(1)
  })
})

describe('armarResumenesDelDia', () => {
  const visitas = [
    { id: 'v1', protocol_id: 'P1' },
    { id: 'v2', protocol_id: 'P1' },
    { id: 'v3', protocol_id: 'P2' },
  ]
  const asignaciones = [
    { visit_id: 'v1', procedure_id: 'lab', name: 'Laboratorio' },
    { visit_id: 'v3', procedure_id: 'lab', name: 'Laboratorio' },
  ]

  it('cada visita toma SU lista, aunque dos compartan cuadro', () => {
    // v2 es del mismo cuadro que v1 pero pasó su laboratorio a otro día: su lista efectiva ya no lo
    // trae. Cruzar por cuadro (como hasta v0144) le volvería a dibujar la gota.
    const out = armarResumenesDelDia(visitas, asignaciones, [{ protocol_id: 'P1', procedure_id: 'lab', draws_blood: true, tieneReporte: false }], [])
    expect(out.v1?.total).toBe(1)
    expect(out.v1?.sangre).toBe('si')
    expect(out.v2).toBeNull()
  })

  it('el MISMO procedimiento del catálogo toma la sangre de SU estudio', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [
      { protocol_id: 'P1', procedure_id: 'lab', draws_blood: true, tieneReporte: false },
      { protocol_id: 'P2', procedure_id: 'lab', draws_blood: false, tieneReporte: false },
    ], [])
    expect(out.v1?.sangre).toBe('si')
    expect(out.v3?.sangre).toBe('no')
  })

  it('un procedimiento sin fila en el cuadro del estudio queda SIN DEFINIR, nunca en «no lleva»', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [], [])
    expect(out.v1?.sangre).toBeNull()
  })

  it('un retest con procedimientos propios tiene resumen', () => {
    const out = armarResumenesDelDia([{ id: 'r1', protocol_id: 'P1' }], [{ visit_id: 'r1', procedure_id: 'hem', name: 'Hemograma' }], [], [])
    expect(out.r1?.total).toBe(1)
  })

  it('una visita sin procedimientos y sin IP no tiene resumen', () => {
    const out = armarResumenesDelDia([{ id: 'v9', protocol_id: 'P1' }], asignaciones, [], [])
    expect(out.v9).toBeNull()
  })

  it('una visita sin procedimientos CON IP sí lo tiene', () => {
    const out = armarResumenesDelDia([{ id: 'v9', protocol_id: 'P1' }], asignaciones, [], [{ visit_id: 'v9', cierre: null }])
    expect(out.v9?.kitIp).toBe(true)
    expect(out.v9?.total).toBe(1)
  })

  it('el IP se cruza por visita, no por estudio', () => {
    const out = armarResumenesDelDia(visitas, asignaciones, [], [{ visit_id: 'v2', cierre: null }])
    expect(out.v1?.kitIp).toBe(false)
    expect(out.v2?.kitIp).toBe(true)
  })
})
