import { describe, expect, it } from 'vitest'
import { coincideBusqueda, opcionesCoordinador, opcionesMedico, SIN_VALOR } from './alertFilters'

/**
 * El buscador de Alertas.
 *
 * Un filtro que no matchea donde debería esconde alertas y NO lo dice: la pantalla se dibuja
 * perfecta con menos filas de las que hay. En la pantalla cuyo trabajo es que no se pase un desvío,
 * ése es el único modo de falla que no se puede tolerar — de ahí el caso vacío (que tiene que
 * devolver TODAS, nunca ninguna) y el de acentos.
 *
 * Sin base y sin navegador: es una función pura.
 */

const fila = {
  patient_name: 'Muñoz Pampillon Andrés',
  patient_code: '032001500002',
  protocol_code: 'LTS17231',
}

describe('coincideBusqueda', () => {
  it('sin término deja pasar todo', () => {
    // El error clásico del otro lado: tratar el vacío como "no coincide con nada" y vaciar la lista.
    expect(coincideBusqueda(fila, '')).toBe(true)
    expect(coincideBusqueda(fila, '   ')).toBe(true)
  })

  it('encuentra por nombre, por número de sujeto y por protocolo', () => {
    expect(coincideBusqueda(fila, 'Pampillon')).toBe(true)
    expect(coincideBusqueda(fila, '0320015')).toBe(true)
    expect(coincideBusqueda(fila, 'LTS17231')).toBe(true)
  })

  it('ignora mayúsculas y acentos en los dos lados', () => {
    // Quien escribe apurada no pone la ñ ni la tilde; y el dato puede venir con o sin ellas.
    expect(coincideBusqueda(fila, 'muñoz')).toBe(true)
    expect(coincideBusqueda(fila, 'munoz')).toBe(true)
    expect(coincideBusqueda(fila, 'ANDRES')).toBe(true)
    expect(coincideBusqueda(fila, 'andrés')).toBe(true)
    expect(coincideBusqueda(fila, 'lts')).toBe(true)
  })

  it('no inventa coincidencias', () => {
    expect(coincideBusqueda(fila, 'Calderon')).toBe(false)
    expect(coincideBusqueda(fila, 'ACT18301')).toBe(false)
  })

  it('tolera el número de sujeto ausente', () => {
    // Pasa con visitas sueltas y pacientes sin IVRS cargado: no puede tirar al normalizar null.
    const sinCodigo = { ...fila, patient_code: null }
    expect(coincideBusqueda(sinCodigo, 'Pampillon')).toBe(true)
    expect(coincideBusqueda(sinCodigo, '0320015')).toBe(false)
  })

  it('ignora espacios alrededor del término', () => {
    expect(coincideBusqueda(fila, '  lts17231  ')).toBe(true)
  })
})

const p = (medico: string | null, coordId: string | null, coordNombre: string | null) =>
  ({ treating_physician: medico, coordinator_id: coordId, coordinator_name: coordNombre })

describe('opciones de Médico y Coordinador', () => {
  /* EL CASO QUE JUSTIFICA QUE ESTO SEA UNA FUNCIÓN: la pantalla tiene DOS listas, y un médico que
     sólo aparece en la de reportes tiene que estar igual en el menú. Si el menú se armara con una
     sola, sus alertas quedarían inalcanzables por filtro — con la pantalla viéndose normal. */
  it('cruza las dos listas', () => {
    const visitas = [p('Dra. Ibarra', null, null)]
    const reportes = [p('Dr. Sosa', null, null)]
    expect(opcionesMedico([visitas, reportes]).map((o) => o.label)).toEqual(['Dr. Sosa', 'Dra. Ibarra'])
  })

  it('cuenta sumando las dos listas', () => {
    const visitas = [p('Dra. Ibarra', null, null), p('Dra. Ibarra', null, null)]
    const reportes = [p('Dra. Ibarra', null, null)]
    expect(opcionesMedico([visitas, reportes])[0].count).toBe(3)
  })

  it('el "sin valor" existe como opción y va SIEMPRE al final', () => {
    // Sin esa opción no habría forma de pedir las que no tienen a nadie a cargo, que suelen ser
    // justamente las que se pasan.
    const o = opcionesMedico([[p(null, null, null), p('Dra. Ibarra', null, null), p('Dr. Álvarez', null, null)]])
    expect(o.map((x) => x.label)).toEqual(['Dr. Álvarez', 'Dra. Ibarra', 'Sin médico'])
    expect(o[o.length - 1].value).toBe(SIN_VALOR)
  })

  it('coordinador: la clave es el id y el rótulo el nombre snapshot', () => {
    const o = opcionesCoordinador([[p(null, 'u1', 'Sofía Cabrera'), p(null, 'u1', 'Sofía Cabrera')]])
    expect(o).toEqual([{ value: 'u1', label: 'Sofía Cabrera', count: 2 }])
  })

  it('coordinador: rescata el nombre aunque una fila lo traiga en null', () => {
    // `coordinator_name` es un snapshot escrito al asignar: puede faltar en una fila y estar en
    // otra del mismo coordinador. Descartar la opción por la fila incompleta lo escondería.
    const o = opcionesCoordinador([[p(null, 'u1', null), p(null, 'u1', 'Sofía Cabrera')]])
    expect(o[0]).toEqual({ value: 'u1', label: 'Sofía Cabrera', count: 2 })
  })

  it('listas vacías no producen opciones', () => {
    expect(opcionesMedico([[], []])).toEqual([])
    expect(opcionesCoordinador([[], []])).toEqual([])
  })
})
