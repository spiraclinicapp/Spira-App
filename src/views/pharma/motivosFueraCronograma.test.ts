import { describe, expect, it } from 'vitest'
import {
  MOTIVOS_FUERA_CRONOGRAMA,
  MOTIVO_VNP,
  necesitaMotivoFueraCronograma,
} from './motivosFueraCronograma'
import type { VisitaDispensadora } from './motivosFueraCronograma'

/**
 * Cuándo una dispensación necesita declarar un motivo.
 *
 * Se testea porque es la regla que falla EN SILENCIO de esta tanda, y en una sola dirección:
 * un `true` de más marca `off_schedule` en una entrega NORMAL, y eso no se ve en ninguna
 * pantalla — la dispensación se crea, se prepara y se entrega igual de bien. El síntoma aparece
 * meses después, cuando alguien filtra las excepciones para una auditoría y encuentra decenas
 * que no lo eran. El `false` de más, en cambio, lo canta la base con un mensaje claro.
 *
 * El caso que hace que la función tenga TRES caminos y no una constante: la base valida
 * distinto según el pedido lleve renglones o sea solo la constancia de IP (0071:481-487). Una
 * visita que entrega IP pero no medicación concomitante NO necesita motivo para la constancia
 * y SÍ lo necesita para los renglones. Con una sola regla, uno de los dos consumidores mentiría.
 *
 * Sin base y sin navegador: es una función pura.
 */

const v = (dispenses: boolean, dispenses_ip: boolean): VisitaDispensadora => ({ dispenses, dispenses_ip })

describe('necesitaMotivoFueraCronograma', () => {
  it('la visita que el cronograma marcó como dispensadora no pide motivo', () => {
    expect(necesitaMotivoFueraCronograma(v(true, false), 'renglones')).toBe(false)
    expect(necesitaMotivoFueraCronograma(v(true, true), 'renglones')).toBe(false)
  })

  it('la visita que NO dispensa pide motivo para los renglones', () => {
    // El caso del mostrador: la VNP nunca dispensa según el cronograma (no tiene definición).
    expect(necesitaMotivoFueraCronograma(v(false, false), 'renglones')).toBe(true)
  })

  it('entrega IP pero no medicación: pide motivo para los renglones y NO para la constancia', () => {
    // El caso que separa los tres caminos. Con una sola regla (`!dispenses && !dispenses_ip`),
    // el mostrador mandaría renglones sin motivo y la base los rechazaría con "Esta visita no
    // entrega medicación" — un error del servidor por algo que la pantalla ya sabía.
    const soloIp = v(false, true)
    expect(necesitaMotivoFueraCronograma(soloIp, 'renglones')).toBe(true)
    expect(necesitaMotivoFueraCronograma(soloIp, 'solo_ip')).toBe(false)
  })

  it('entrega medicación pero no IP: al revés', () => {
    const soloMed = v(true, false)
    expect(necesitaMotivoFueraCronograma(soloMed, 'renglones')).toBe(false)
    expect(necesitaMotivoFueraCronograma(soloMed, 'solo_ip')).toBe(true)
  })

  it('"cualquiera" pide motivo solo cuando NINGÚN camino está autorizado', () => {
    // Es la condición de la sección de excepción en Coordinación, que ofrece los dos caminos:
    // alcanza con que uno esté habilitado para que la visita no sea una excepción.
    expect(necesitaMotivoFueraCronograma(v(false, false), 'cualquiera')).toBe(true)
    expect(necesitaMotivoFueraCronograma(v(true, false), 'cualquiera')).toBe(false)
    expect(necesitaMotivoFueraCronograma(v(false, true), 'cualquiera')).toBe(false)
    expect(necesitaMotivoFueraCronograma(v(true, true), 'cualquiera')).toBe(false)
  })
})

describe('MOTIVOS_FUERA_CRONOGRAMA', () => {
  it('tiene una opción para la VNP, y MOTIVO_VNP la encuentra', () => {
    // El mostrador preselecciona este motivo cuando el pedido nace de registrar una VNP. Si la
    // clave se renombrara en la lista sin actualizar la constante, la preselección fallaría en
    // silencio: el desplegable quedaría vacío y el botón bloqueado sin decir por qué.
    const vnp = MOTIVOS_FUERA_CRONOGRAMA.find((m) => m.value === MOTIVO_VNP)
    expect(vnp).toBeDefined()
    expect(vnp?.label).toBe('Visita no programada (VNP)')
  })

  it('no tiene claves repetidas', () => {
    const claves = MOTIVOS_FUERA_CRONOGRAMA.map((m) => m.value)
    expect(new Set(claves).size).toBe(claves.length)
  })
})
