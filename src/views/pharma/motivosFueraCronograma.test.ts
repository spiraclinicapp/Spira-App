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

  it('REGRESIÓN 0121: la base NUNCA pide motivo, aunque el cronograma no la prevea', () => {
    // Hasta la 0121 esto daba `true` en una visita que no dispensa (el caso del mostrador: la VNP no
    // tiene definición). Con la base libre (plan D4), un `true` acá sellaría `off_schedule` con un
    // motivo inventado en una entrega normal — exactamente la falla silenciosa del encabezado.
    for (const [d, ip] of [[false, false], [false, true], [true, false], [true, true]] as const) {
      expect(necesitaMotivoFueraCronograma(v(d, ip), 'renglones')).toBe(false)
    }
  })

  it('el IP sigue pidiendo motivo cuando el cronograma no lo prevé', () => {
    expect(necesitaMotivoFueraCronograma(v(true, false), 'solo_ip')).toBe(true)
    expect(necesitaMotivoFueraCronograma(v(false, false), 'solo_ip')).toBe(true)
    expect(necesitaMotivoFueraCronograma(v(false, true), 'solo_ip')).toBe(false)
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
